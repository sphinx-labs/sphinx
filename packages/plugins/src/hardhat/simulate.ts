import { join } from 'path'

import {
  ParsedConfig,
  runEntireDeploymentProcess,
  spawnAsync,
  estimateGasViaSigner,
  estimateGasViaManagedService,
  approveDeploymentViaSigner,
  approveDeploymentViaManagedService,
  executeActionsViaSigner,
  executeActionsViaManagedService,
  EstimateGas,
  ApproveDeployment,
  ExecuteActions,
  getSphinxWalletPrivateKey,
  toSphinxLeafWithProofArray,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  DeploymentData,
  SphinxLeafWithProof,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'

// TODO(docs): this can't have functions as fields b/c we pass it into a child process. it also
// can't have any fields that contain BigInts b/c we stringify then parse JSON.
export type simulateDeploymentSubtaskArgs = {
  parsedConfig: ParsedConfig
  deploymentData: DeploymentData
  isLiveNetworkBroadcast: boolean
}

/**
 * Simulate a deployment on a fork of the target network. We use Hardhat instead of Foundry to run
 * the simulation for two reasons:
 *
 * 1. Running the simulation with Hardhat allows us to reuse the TypeScript logic that executes the
 * deployment in production. If we use Foundry, we'd need to rewrite all of this logic in
 * Solidity.
 *
 * 2. Running the simulation with Hardhat allows us to accurately calculate the gas used by the
 * deployment, which determines the estimated cost that we provide to the user. There are two
 * main reasons that it's more accurate. First, we're able to use the `gasUsed` field of the
 * transaction receipts instead of relying on the `gas` field of Foundry's transaction responses.
 * The latter gives estimates that are anywhere between 35-55% higher than the actual gas used
 * because it uses `evm_estimateGas` under the hood. Second, executing the deployment in
 * TypeScript allows us to calculate the batch sizes of the `EXECUTE` leaves, which is a
 * significant factor in the gas used by the deployment. We can't calculate the batch sizes in
 * Foundry because of a subtle limitation: in a single Forge script simulation, it's not
 * currently possible to perform a sequence like this:
 *
 * a. Execute a transaction.
 * b. Use `vm.rpc("eth_estimateGas")` to estimate the gas using the state of the chain after
 * the transaction. (Instead, this cheatcode uses the initial state of the chain.)
 *
 * This prevents us from using Foundry because the size and cost of a batch usually depends on the
 * previous batch. For example, a batch may consist of transactions that are executed on
 * contracts that were deployed in a previous batch.
 */
export const simulate = async (
  parsedConfig: ParsedConfig,
  deploymentData: DeploymentData,
  rpcUrl: string,
  isLiveNetworkBroadcast: boolean
): Promise<{
  receipts: Array<ethers.TransactionReceipt> // TODO(artifacts): use SphinxTransactionReceipt, which shouldn't have any BigInt fields.
  batches: Array<Array<SphinxLeafWithProof>>
}> => {
  const rootPluginPath =
    process.env.DEV_FILE_PATH ?? join('node_modules', '@sphinx-labs', 'plugins')

  const envVars = {
    SPHINX_INTERNAL__FORK_URL: rpcUrl,
    SPHINX_INTERNAL__CHAIN_ID: parsedConfig.chainId,
    // We must set the Hardhat config using an environment variable so that Hardhat recognizes the
    // Hardhat config when we import the HRE in the child process.
    HARDHAT_CONFIG: join(rootPluginPath, 'dist', 'hardhat.config.js'),
  }

  const taskParams: simulateDeploymentSubtaskArgs = {
    parsedConfig,
    deploymentData,
    isLiveNetworkBroadcast,
  }

  const hardhatRunnerPath = join(
    rootPluginPath,
    'dist',
    'hardhat',
    'hardhatRunner.js'
  )
  const { stdout, stderr, code } = await spawnAsync(
    'node',
    [hardhatRunnerPath],
    envVars,
    JSON.stringify(taskParams)
  )

  if (code !== 0) {
    throw new Error(`Simulation failed: ${stderr}`)
  }

  const receipts = JSON.parse(stdout).receipts
  const batches = JSON.parse(stdout).batches.map(toSphinxLeafWithProofArray)

  return { receipts, batches }
}

// TODO: left off: should we kill the PID that seems to be initiated when we run the hardhat fork?

export const simulateDeploymentSubtask = async (
  taskArgs: simulateDeploymentSubtaskArgs,
  hre: any
): Promise<{
  receipts: Array<ethers.TransactionReceipt>
  batches: Array<Array<SphinxLeafWithProof>>
}> => {
  const { parsedConfig, isLiveNetworkBroadcast, deploymentData } = taskArgs

  // This provider is connected to the forked in-process Hardhat node.
  const provider = hre.ethers.provider

  let estimateGas: EstimateGas
  let approveDeployment: ApproveDeployment
  let executeActions: ExecuteActions
  let signer: ethers.Wallet
  if (isLiveNetworkBroadcast) {
    const privateKey = process.env.PRIVATE_KEY
    if (!privateKey) {
      throw new Error(`Could not find 'PRIVATE_KEY' environment variable.`)
    }
    signer = new ethers.Wallet(privateKey, provider)

    estimateGas = estimateGasViaSigner
    approveDeployment = approveDeploymentViaSigner
    executeActions = executeActionsViaSigner
  } else {
    signer = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)

    estimateGas = estimateGasViaManagedService
    approveDeployment = approveDeploymentViaManagedService
    executeActions = executeActionsViaManagedService
  }

  const merkleTree = makeSphinxMerkleTree(deploymentData)
  const { receipts, batches } = await runEntireDeploymentProcess(
    parsedConfig,
    merkleTree,
    provider,
    signer,
    isLiveNetworkBroadcast,
    estimateGas,
    approveDeployment,
    executeActions
  )

  return { receipts, batches }
}

// TODO(docs): put this somewhere: We run the simulation by invoking a Hardhat subtask. We need to
// load the Hardhat Runtime Environment (HRE) because Hardhat doesn't document any lower-level
// functionality for running a fork. We could theoretically interact with lower-level components,
// but this would be brittle because Hardhat could change their internal functionality in a future
// minor or patch version.

// TODO(docs): explain somewhere why we use a child process
