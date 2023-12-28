import { join } from 'path'

import {
  ParsedConfig,
  EstimateGas,
  ExecuteActions,
  ApproveDeployment,
  runEntireDeploymentProcess,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { SphinxLeafWithProof, SphinxMerkleTree } from '@sphinx-labs/contracts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

type simulateDeploymentSubtaskArgs = {
  merkleTree: SphinxMerkleTree
  parsedConfig: ParsedConfig
  isLiveNetworkBroadcast: boolean
  config: string
  signer: ethers.Wallet
  estimateGas: EstimateGas
  approveDeployment: ApproveDeployment
  executeActions: ExecuteActions
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
  merkleTree: SphinxMerkleTree,
  rpcUrl: string,
  signer: ethers.Wallet,
  isLiveNetworkBroadcast: boolean,
  estimateGas: EstimateGas,
  approveDeployment: ApproveDeployment,
  executeActions: ExecuteActions
): Promise<{
  receipts: Array<ethers.TransactionReceipt>
  batches: Array<Array<SphinxLeafWithProof>>
}> => {
  const rootPluginPath =
    process.env.DEV_FILE_PATH ?? join('node_modules', '@sphinx-labs', 'plugins')
  const hardhatConfigPath = join(rootPluginPath, 'dist', 'hardhat.config.js')

  process.env['SPHINX_INTERNAL__FORK_URL'] = rpcUrl
  process.env['SPHINX_INTERNAL__CHAIN_ID'] = parsedConfig.chainId
  const initialHardhatConfigEnvVar = process.env['HARDHAT_CONFIG']
  // We must temporarily set the Hardhat config using an environment variable so that Hardhat
  // recognizes the Hardhat config for the simulation. If the user specified a `HARDHAT_CONFIG`
  // environment variable, we'll set it after the simulation is done.
  process.env['HARDHAT_CONFIG'] = join('dist', 'hardhat.config.js')

  // We run the simulation by invoking a Hardhat subtask. We need to load the Hardhat Runtime
  // Environment (HRE) because Hardhat doesn't document any lower-level functionality for running a
  // fork. We could theoretically interact with lower-level components, but this would be brittle
  // because Hardhat could change their internal functionality in a future minor or patch version.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hre = require('hardhat')

  const taskParams: simulateDeploymentSubtaskArgs = {
    parsedConfig,
    merkleTree,
    signer,
    isLiveNetworkBroadcast,
    // The `config` parameter takes priority over the `HARDHAT_CONFIG` environment variable. (ref:
    // https://hardhat.org/hardhat-runner/docs/reference/environment-variables). It's not strictly
    // necessary to use this variable, but we do it anyways to make sure that we're using the
    // correct Hardhat config.
    config: hardhatConfigPath,
    estimateGas,
    approveDeployment,
    executeActions,
  }
  const {
    receipts,
    batches,
  }: Awaited<ReturnType<typeof simulateDeploymentSubtask>> = await hre.run(
    'sphinxSimulateDeployment',
    taskParams
  )

  delete process.env['SPHINX_INTERNAL__FORK_URL']
  delete process.env['SPHINX_INTERNAL__CHAIN_ID']
  process.env['HARDHAT_CONFIG'] = initialHardhatConfigEnvVar

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
  const {
    merkleTree,
    parsedConfig,
    isLiveNetworkBroadcast,
    estimateGas,
    approveDeployment,
    executeActions,
  } = taskArgs

  // This provider is connected to the forked in-process Hardhat node.
  const provider: HardhatEthersProvider = hre.ethers.provider

  const signer = taskArgs.signer.connect(provider)

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
