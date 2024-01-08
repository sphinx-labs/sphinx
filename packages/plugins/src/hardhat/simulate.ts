import { join } from 'path'

import {
  ParsedConfig,
  runEntireDeploymentProcess,
  spawnAsync,
  getSphinxWalletPrivateKey,
  toSphinxLeafWithProofArray,
  makeDeploymentData,
  SphinxTransactionReceipt,
  ExecutionMode,
  MerkleRootStatus,
  SphinxJsonRpcProvider,
  isLiveNetwork,
  getNetworkNameForChainId,
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
  parsedConfigArray: Array<ParsedConfig>
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
  parsedConfigArray: Array<ParsedConfig>,
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
    parsedConfigArray,
    chainId,
  }

  if (!(await isLiveNetwork(provider))) {
    // Fast forward 1000 blocks. This is necessary to prevent the following edge case that occurs
    // when running the simulation against a vanilla Anvil node:
    // 1. We deploy the Gnosis Safe and Sphinx contracts.
    // 2. We create the Hardhat fork, which uses a block that's multiple confirmations behind the latest
    // block. This is Hardhat's default behavior, which is meant to protect against chain reorgs
    // on forks of live networks.
    // 3. The simulation fails because some of the contracts deployed in step 1 don't exist on the
    // Hardhat fork.
    //
    // We chose 1000 blocks at random. The number of blocks must be sufficiently high to prevent
    // this type of edge case on every network. The largest possible number of blocks that Hardhat
    // rewinds is 100 blocks (as of Hardhat v2.19.0).
    await provider.send(
      // The `hardhat_mine` RPC method works on Anvil and Hardhat nodes.
      'hardhat_mine',
      // 1000 blocks.
      ['0x3e8']
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
    const networkName = getNetworkNameForChainId(BigInt(chainId))
    throw new Error(
      `Simulation failed for ${networkName} at block number ${block.number}. Reason:\n${stderr}`
    )
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
  const { parsedConfigArray, chainId } = taskArgs

  const parsedConfig = parsedConfigArray.find((e) => e.chainId === chainId)
  if (!parsedConfig) {
    throw new Error(
      `Could not find the parsed config for chain ID: ${chainId}. Should never happen.`
    )
  }

  const { executionMode } = parsedConfig

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
  } else {
    throw new Error(`Unknown execution mode.`)
  }

  const deploymentData = makeDeploymentData(parsedConfigArray)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  const { receipts, batches, finalStatus, failureAction } =
    await runEntireDeploymentProcess(parsedConfig, merkleTree, provider, signer)

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
