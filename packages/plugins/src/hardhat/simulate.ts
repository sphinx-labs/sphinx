import { join } from 'path'

import {
  spawnAsync,
  getSphinxWalletPrivateKey,
  toSphinxLeafWithProofArray,
  makeDeploymentData,
  SphinxTransactionReceipt,
  ExecutionMode,
  MerkleRootStatus,
  SphinxJsonRpcProvider,
  fetchNameForNetwork,
  getLargestPossibleReorg,
  isFork,
  stripLeadingZero,
  isLiveNetwork,
  fundAccountMaxBalance,
  signMerkleRoot,
  compileAndExecuteDeployment,
  Deployment,
  CompilerConfig,
  DeploymentContext,
  ConfigArtifacts,
  HumanReadableAction,
  executeTransactionViaSigner,
  getSphinxWalletsSortedByAddress,
  injectRoles,
  removeRoles,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  SphinxLeafWithProof,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'

/**
 * These arguments are passed into the Hardhat subtask that simulates a user's deployment. There
 * can't be any functions as arguments because we pass them into a child process. There also
 * shouldn't be any fields that contain BigInts because we call `JSON.parse` to decode the data
 * returned by the subtask. (`JSON.parse` converts BigInts to strings).
 *
 * @property {Array<ParsedConfig>} parsedConfigArray The ParsedConfig on all networks. This is
 * necessary to create the entire Merkle tree in the simulation, which ensures we use the same
 * Merkle root in both the simulation and the production environment.
 */
export type simulateDeploymentSubtaskArgs = {
  compilerConfigArray: Array<CompilerConfig>
  chainId: string
}

/**
 * Simulate a deployment on a fork of the target network. We use Hardhat instead of Foundry to run
 * the simulation for two reasons:
 *
 * 1. Running the simulation with Hardhat allows us to reuse the TypeScript logic that executes the
 * deployment in production. If we use Foundry, we'd need to rewrite all of this logic in
 * Solidity. Also, adding complex Solidity logic to the Sphinx plugin contracts can lead to
 * unpredictable IR compilation failures.
 *
 * 2. Running the simulation with Hardhat allows us to accurately calculate the gas used by the
 * deployment, which determines the estimated cost that we provide to the user. The estimate is
 * more accurate with Hardhat because we're able to use the `gasUsed` field of the transaction
 * receipts instead of relying on the `gas` field of Foundry's transaction responses. The latter
 * gives estimates that are anywhere between 35-55% higher than the actual gas used because it
 * uses `eth_estimateGas` under the hood.
 *
 * 3. It's non-trivial to pass a very large Merkle tree from TypeScript to Foundry. Particularly,
 * `spawn` is prone to input size limits, and EthersJS can't ABI encode extremely large amounts
 * of data (i.e. it'll fail for a Merkle tree that contains 250 contract deployments, where the
 * contract is near the maximum size limit).
 */
export const simulate = async (
  compilerConfigArray: Array<CompilerConfig>,
  chainId: string,
  rpcUrl: string
): Promise<{
  receipts: Array<SphinxTransactionReceipt>
  batches: Array<Array<SphinxLeafWithProof>>
}> => {
  const rootPluginPath =
    process.env.DEV_FILE_PATH ?? join('node_modules', '@sphinx-labs', 'plugins')

  const provider = new SphinxJsonRpcProvider(rpcUrl)

  const block = await provider.getBlock('latest')
  // Narrow the TypeScript type.
  if (!block) {
    throw new Error(`Could not find block. Should never happen.`)
  }

  const envVars = {
    SPHINX_INTERNAL__FORK_URL: rpcUrl,
    SPHINX_INTERNAL__CHAIN_ID: chainId,
    SPHINX_INTERNAL__BLOCK_GAS_LIMIT: block.gasLimit.toString(),
    // We must set the Hardhat config using an environment variable so that Hardhat recognizes the
    // Hardhat config when we import the HRE in the child process.
    HARDHAT_CONFIG: join(rootPluginPath, 'dist', 'hardhat.config.js'),
  }

  const taskParams: simulateDeploymentSubtaskArgs = {
    compilerConfigArray,
    chainId,
  }

  if ((await isLiveNetwork(provider)) || (await isFork(provider))) {
    // Hardcode the block number in the Hardhat config so that the simulation uses the latest block
    // number. If we don't hardcode it, Hardhat uses a block number that's numerous confirmations
    // behind the latest block number, which protects against chain reorgs. We choose to use the
    // latest block number because it's aligned with Anvil's behavior and it ensures that any
    // recently executed transactions submitted by the caller are included in the simulation.
    envVars['SPHINX_INTERNAL__BLOCK_NUMBER'] = block.number.toString()
  } else {
    // The network is a non-forked local node (i.e. an Anvil or Hardhat node with a fresh state). We
    // do not hardcode the block number in the Hardhat config to avoid the following edge case:
    // 1. Say we create an Anvil node with Ethereum's chain ID: `anvil --chain-id 1`. The block
    //    number will be extremely low on this network (i.e. less than 100). This is standard
    //    behavior for Anvil nodes.
    // 2. Hardhat detects that the block number is extremely low and throws an error because the
    //    block number corresponds to a hardfork that's too early to be supported. Here's the thrown
    //    error:
    //    https://github.com/NomicFoundation/hardhat/blob/caa504fe0e53c183578f42d66f4740b8ec147051/packages/hardhat-core/src/internal/hardhat-network/provider/node.ts#L305-L309
    //
    // Some notes about this edge case:
    // 1. We only ran into this error when creating an Anvil node with Ethereum's chain ID, but it
    //    may also occur on other popular networks.
    // 2. We attempted to resolve this error by specifying the desired hardfork in the Hardhat
    //    config's `hardfork` option as well as its `chains.hardforkHistory` option. Neither
    //    resolved this error.
    // 3. This error is only thrown when hardcoding the block number in the Hardhat config. When we
    //    don't hardcode it, Hardhat uses the default hardfork, which is the behavior we want.

    // Fast forward the block number. This is necessary to prevent the following edge case:
    // 1. Some transactions are executed on the local network. These transactions could either be
    //    sent by the Sphinx team (during testing) or by the user during local development.
    // 2. The Deploy CLI command is executed, which creates a simulation using a block that's
    //    multiple confirmations behind the latest block. This is Hardhat's default behavior, which
    //    is meant to protect against chain reorgs on forks of live networks.
    // 3. The simulation fails because the transactions executed in step 1 don't exist on the
    //    Hardhat fork.
    const blocksToFastForward = getLargestPossibleReorg(chainId)
    const blocksHex = stripLeadingZero(ethers.toBeHex(blocksToFastForward))
    await provider.send(
      'hardhat_mine', // The `hardhat_mine` RPC method works on Anvil and Hardhat nodes.
      [blocksHex]
    )
  }

  const hardhatRunnerPath = join(
    rootPluginPath,
    'dist',
    'hardhat',
    'hardhatRunner.js'
  )
  // Execute the simulation in a child process. We don't run the simulation in the
  // current process to prevent the following edge case that was discovered in Sphinx's test suite.
  // First, some context: When Hardhat creates an in-process node that forks a standalone Anvil
  // node, the Hardhat node listens to the Anvil port from the process in which the Hardhat node is
  // created. In other words, if we create the Hardhat node in the current process and then call
  // `lsof -t -i:<ANVIL_PORT>`, one of the returned PIDs will be the current PID (i.e.
  // `process.pid`). Then, if we attempt to run `kill $(lsof -t -i:<ANVIL_PORT>)`, the current
  // process will exit with a mysterious `SIGTERM` error. This issue caused Sphinx's test suite to
  // exit early because we kill Anvil nodes after some test cases complete. It's possible
  // (although unlikely) that this same situation could happen in a user's test suite. We resolve
  // this by creating the Hardhat node in a child process via `spawnAsync`. This child process exits
  // when `spawnAsync` returns.
  const { stdout, code } = await spawnAsync(
    'node',
    [hardhatRunnerPath],
    envVars,
    JSON.stringify(taskParams)
  )

  if (code !== 0) {
    const networkName = fetchNameForNetwork(BigInt(chainId))
    let errorMessage: string = `Simulation failed for ${networkName} at block number ${block.number}.`
    try {
      // Attempt to decode the error message. This try-statement could theoretically throw an error
      // if `stdout` isn't a valid JSON string.
      const error = JSON.parse(stdout)

      // If the stack trace includes the error message, we only use the stack trace so that we don't
      // display the error reason twice.
      if (
        typeof error.stack === 'string' &&
        error.stack.includes(error.message)
      ) {
        errorMessage += `\n\n${error.stack}`
      } else {
        // Display both the error message and the stack trace.
        errorMessage += `\n\n${error.message}\n\n${error.stack}`
      }
    } catch {
      // An error occurred while attempting to decode `stdout` into an error message. We'll display
      // the raw `stdout` to the user in case it's useful.
      errorMessage += `\n\n${stdout}`
    }
    throw new Error(errorMessage)
  }

  const receipts = JSON.parse(stdout).receipts
  const batches = JSON.parse(stdout).batches.map(toSphinxLeafWithProofArray)

  return { receipts, batches }
}

/**
 * A Hardhat subtask that simulates a deployment against a forked Hardhat node. We need to load the
 * Hardhat Runtime Environment (HRE) because Hardhat doesn't document any lower-level functionality
 * for running a fork. We could theoretically interact with lower-level components, but this would
 * be brittle because Hardhat could change their internal functionality in a future minor or patch
 * version.
 */
export const simulateDeploymentSubtask = async (
  taskArgs: simulateDeploymentSubtaskArgs,
  hre: any
): Promise<{
  receipts: Array<SphinxTransactionReceipt>
  batches: Array<Array<SphinxLeafWithProof>>
}> => {
  const { compilerConfigArray, chainId } = taskArgs

  const compilerConfig = compilerConfigArray.find((e) => e.chainId === chainId)
  if (!compilerConfig) {
    throw new Error(
      `Could not find the parsed config for chain ID: ${chainId}. Should never happen.`
    )
  }

  const { executionMode } = compilerConfig

  // This provider is connected to the forked in-process Hardhat node.
  const provider = hre.ethers.provider

  let signer: ethers.Wallet
  if (executionMode === ExecutionMode.LiveNetworkCLI) {
    const privateKey = process.env.PRIVATE_KEY
    if (!privateKey) {
      throw new Error(`Could not find 'PRIVATE_KEY' environment variable.`)
    }
    signer = new ethers.Wallet(privateKey, provider)
  } else if (
    executionMode === ExecutionMode.LocalNetworkCLI ||
    executionMode === ExecutionMode.Platform
  ) {
    signer = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)
    await fundAccountMaxBalance(signer.address, provider)
  } else {
    throw new Error(`Unknown execution mode.`)
  }

  const deploymentData = makeDeploymentData(compilerConfigArray)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  // Create a list of auto-generated wallets. We'll later add these wallets as Gnosis Safe owners.
  const sphinxWallets = getSphinxWalletsSortedByAddress(
    BigInt(compilerConfig.newConfig.threshold),
    provider
  )
  const treeSigners = await Promise.all(
    sphinxWallets.map(async (wallet) => {
      return {
        signer: await wallet.getAddress(),
        signature: await signMerkleRoot(merkleTree.root, wallet),
      }
    })
  )

  const deployment: Deployment = {
    id: 'only required on website',
    multichainDeploymentId: 'only required on website',
    projectId: 'only required on website',
    chainId: compilerConfig.chainId,
    status: 'approved',
    moduleAddress: compilerConfig.moduleAddress,
    safeAddress: compilerConfig.safeAddress,
    compilerConfigs: compilerConfigArray,
    networkName: fetchNameForNetwork(BigInt(compilerConfig.chainId)),
    treeSigners,
  }
  const simulationContext: DeploymentContext = {
    throwError: (message: string) => {
      throw new Error(message)
    },
    handleError: (e) => {
      throw e
    },
    handleAlreadyExecutedDeployment: () => {
      throw new Error(
        'Deployment has already been executed. This is a bug. Please report it to the developers.'
      )
    },
    handleExecutionFailure: (
      _deploymentContext: DeploymentContext,
      _targetNetworkConfig: CompilerConfig,
      _configArtifacts: ConfigArtifacts,
      failureReason: HumanReadableAction
    ) => {
      throw new Error(
        `The following action reverted during the simulation:\n${failureReason.reason}`
      )
    },
    verify: async () => {
      return
    },
    handleSuccess: async () => {
      return
    },
    executeTransaction: executeTransactionViaSigner,
    deployment,
    provider,
    injectRoles,
    removeRoles,
    wallet: signer,
  }
  const result = await compileAndExecuteDeployment(simulationContext)

  if (!result) {
    throw new Error(
      'Simulation failed for an unexpected reason. This is a bug. Please report it to the developers.'
    )
  }

  const { finalStatus, failureAction, receipts, batches } = result

  if (finalStatus === MerkleRootStatus.FAILED) {
    if (failureAction) {
      throw new Error(
        `The following action reverted during the simulation:\n${failureAction.reason}`
      )
    } else {
      throw new Error(`An action reverted during the simulation.`)
    }
  }

  return { receipts, batches }
}
