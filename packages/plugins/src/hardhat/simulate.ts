import { join } from 'path'

import {
  spawnAsync,
  getSphinxWalletPrivateKey,
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
  DeploymentConfig,
  DeploymentContext,
  ConfigArtifacts,
  HumanReadableAction,
  executeTransactionViaSigner,
  getSphinxWalletsSortedByAddress,
  injectRoles,
  removeRoles,
  fetchNetworkConfigFromDeploymentConfig,
  NetworkConfig,
  callWithTimeout,
  fetchExecutionTransactionReceipts,
  convertEthersTransactionReceipt,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

/**
 * These arguments are passed into the Hardhat subtask that simulates a user's deployment. There
 * can't be any functions as arguments because we pass them into a child process. There also
 * shouldn't be any fields that contain BigInts because we call `JSON.parse` to decode the data
 * returned by the subtask. (`JSON.parse` converts BigInts to strings).
 *
 * @property {Array<NetworkConfig>} networkConfigArray The NetworkConfig on all networks. This is
 * necessary to create the entire Merkle tree in the simulation, which ensures we use the same
 * Merkle root in both the simulation and the production environment.
 */
export type simulateDeploymentSubtaskArgs = {
  deploymentConfig: DeploymentConfig
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
  deploymentConfig: DeploymentConfig,
  chainId: string,
  rpcUrl: string
): Promise<{
  receipts: Array<SphinxTransactionReceipt>
}> => {
  const rootPluginPath =
    process.env.DEV_FILE_PATH ?? join('node_modules', '@sphinx-labs', 'plugins')

  const provider = new SphinxJsonRpcProvider(rpcUrl)

  const networkConfig = fetchNetworkConfigFromDeploymentConfig(
    BigInt(chainId),
    deploymentConfig
  )

  const envVars = {
    SPHINX_INTERNAL__FORK_URL: rpcUrl,
    SPHINX_INTERNAL__CHAIN_ID: chainId,
    SPHINX_INTERNAL__BLOCK_GAS_LIMIT: networkConfig.blockGasLimit,
    // We must set the Hardhat config using an environment variable so that Hardhat recognizes the
    // Hardhat config when we import the HRE in the child process.
    HARDHAT_CONFIG: join(rootPluginPath, 'dist', 'hardhat.config.js'),
  }

  const taskParams: simulateDeploymentSubtaskArgs = {
    deploymentConfig,
    chainId,
  }

  if ((await isLiveNetwork(provider)) || (await isFork(provider))) {
    // Use the same block number as the Forge script that collected the user's transactions. This
    // reduces the chance that the simulation throws an error or stalls, which can occur when using
    // the most recent block number.
    envVars['SPHINX_INTERNAL__BLOCK_NUMBER'] = networkConfig.blockNumber
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
  const { stdout, stderr, code } = await spawnAsync(
    'node',
    [hardhatRunnerPath],
    envVars,
    JSON.stringify(taskParams)
  )

  if (code !== 0) {
    const networkName = fetchNameForNetwork(BigInt(chainId))
    let errorMessage: string = `Simulation failed for ${networkName} at block number ${networkConfig.blockNumber}.`
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

  /**
   * Occasionally an unexpected error can cause stdout to not conform to JSON format. This should never
   * happen, but if it does we will error when attempting to parse stdout. So we use a try catch here
   * and exit with the real value of stdout if an error occurs.
   */
  try {
    const receipts = JSON.parse(stdout).receipts
    return { receipts }
  } catch (e) {
    console.log(stdout)
    console.error(stderr)
    process.exit(1)
  }
}

/**
 * Handles setting up any
 *
 * @param provider
 * @returns
 */
export const setupPresimulationState = async (
  provider: any,
  executionMode: ExecutionMode
) => {
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

  return signer
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
}> => {
  const { deploymentConfig, chainId } = taskArgs
  const { merkleTree } = deploymentConfig

  const networkConfig = fetchNetworkConfigFromDeploymentConfig(
    BigInt(chainId),
    deploymentConfig
  )

  const { executionMode } = networkConfig

  // This provider is connected to the forked in-process Hardhat node.
  const provider = hre.ethers.provider

  let signer = await setupPresimulationState(provider, executionMode)

  // Create a list of auto-generated wallets. We'll later add these wallets as Gnosis Safe owners.
  const sphinxWallets = getSphinxWalletsSortedByAddress(
    BigInt(networkConfig.newConfig.threshold),
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

  let executionCompleted = false
  let receipts: Array<SphinxTransactionReceipt> | undefined
  const deployment: Deployment = {
    id: 'only required on website',
    multichainDeploymentId: 'only required on website',
    projectId: 'only required on website',
    chainId: networkConfig.chainId,
    status: 'approved',
    moduleAddress: networkConfig.moduleAddress,
    safeAddress: networkConfig.safeAddress,
    deploymentConfig,
    networkName: fetchNameForNetwork(BigInt(networkConfig.chainId)),
    treeSigners,
  }
  const simulationContext: DeploymentContext = {
    throwError: (message: string) => {
      throw new Error(message)
    },
    handleError: (e) => {
      throw e
    },
    handleAlreadyExecutedDeployment: async (deploymentContext) => {
      executionCompleted = true
      receipts = (
        await fetchExecutionTransactionReceipts(
          [],
          deploymentContext.deployment.moduleAddress,
          deploymentContext.deployment.deploymentConfig.merkleTree.root,
          deploymentContext.provider
        )
      ).map(convertEthersTransactionReceipt)
    },
    handleExecutionFailure: (
      _deploymentContext: DeploymentContext,
      _networkConfig: NetworkConfig,
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

  let attempts = 0
  while (executionCompleted === false) {
    try {
      const result = await callWithTimeout(
        compileAndExecuteDeployment(simulationContext),
        90000,
        'timed out executing deployment'
      )

      if (!result) {
        throw new Error(
          'Simulation failed for an unexpected reason. This is a bug. Please report it to the developers.'
        )
      }

      const { finalStatus, failureAction } = result
      receipts = result.receipts

      if (finalStatus === MerkleRootStatus.FAILED) {
        if (failureAction) {
          throw new Error(
            `The following action reverted during the simulation:\n${failureAction.reason}`
          )
        } else {
          throw new Error(`An action reverted during the simulation.`)
        }
      }

      return { receipts }
    } catch (e) {
      /**
       * There are really only a few cases where an error will be thrown during the deployment and caught
       * here (that we know of):
       * 1. There's a legitimate error in our execution logic
       * 2. We estimate the merkle leaf gas incorrectly
       * 3. We fail to find a valid batch size
       * 4. The users RPC provider rate limits us
       *
       * Retrying execution won't help in cases 1, 2, or 3.
       *
       * We have this retry logic implemented almost entirely for case 4 where we hit a rate limit that
       * causes the execution to fail. We found that simply retrying in this case generally does work, but
       * is not 100% reliable. We often get other errors that appear to be caused by the initial rate limiting.
       *
       * For example, we occassionally encountered a situation where transactions would fail after rate
       * limiting due to the nonce used in the transaction being incorrect. There's also another case where
       * the transaction to deploy the users Safe would fail after rate limiting because the Safe has already
       * been deployed. This is something we have logic specifically to prevent that we know works well.
       *
       * We believe these issues are related to there being data cached somewhere that is not correct. We
       * found the most reliable method to resolve these sort of issues was to completely reset the simulation
       * fork back to the original state using `hardhat_reset`.
       */

      if (!hre.config.networks.hardhat.forking) {
        throw new Error(
          'Simulation was not using fork. This is a bug, please report it to the developers.'
        )
      }

      await provider.send('hardhat_reset', [
        {
          forking: {
            jsonRpcUrl: hre.config.networks.hardhat.forking.url,
            blockNumber: hre.config.networks.hardhat.forking.blockNumber,
          },
        },
      ])

      // Since we're resetting back to the initial state, we also need to call the setup function again
      signer = await setupPresimulationState(provider, executionMode)

      if (attempts < 5) {
        attempts += 1
      } else {
        throw e
      }
    }
  }

  if (!receipts) {
    throw new Error(
      'Simulation failed for an unexpected reason. This is a bug. Please report it to the developers.'
    )
  }

  return { receipts }
}
