import { ethers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import {
  SphinxLeafWithProof,
  ManagedServiceABI,
  SphinxMerkleTree,
  getManagedServiceAddress,
} from '@sphinx-labs/contracts'

import {
  MerkleRootState,
  MerkleRootStatus,
  HumanReadableAction,
  HumanReadableActions,
  EstimateGas,
  ExecuteActions,
} from './types'
import {
  estimateGasViaManagedService,
  executeActionsViaManagedService,
  getGasPriceOverrides,
} from '../utils'
import { SphinxJsonRpcProvider } from '../provider'

export const executeDeployment = async (
  module: ethers.Contract,
  merkleTree: SphinxMerkleTree,
  signatures: string[],
  humanReadableActions: HumanReadableActions,
  blockGasLimit: bigint,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Signer,
  logger?: Logger | undefined
): Promise<{
  success: boolean
  receipts: ethers.TransactionReceipt[]
  failureAction?: HumanReadableAction
}> => {
  logger?.info(`[Sphinx]: preparing to execute the project...`)

  const receipts: ethers.TransactionReceipt[] = []

  const chainId = await provider.getNetwork().then((n) => n.chainId)
  // filter for leaves on the target network
  const networkLeaves = merkleTree.leavesWithProofs.filter(
    (leaf) => leaf.leaf.chainId === chainId
  )

  // Encode the `APPROVE` leaf.
  const approvalLeaf = networkLeaves[0]
  const packedSignatures = ethers.solidityPacked(
    signatures.map(() => 'bytes'),
    signatures
  )
  const managedService = new ethers.Contract(
    getManagedServiceAddress(),
    ManagedServiceABI,
    signer
  )
  const approvalData = module.interface.encodeFunctionData('approve', [
    merkleTree.root,
    approvalLeaf,
    packedSignatures,
  ])

  const state: MerkleRootState = await module.merkleRootStates(merkleTree.root)

  if (state.status === MerkleRootStatus.EMPTY) {
    // Execute the `APPROVE` leaf.
    receipts.push(
      await (
        await managedService.exec(
          await module.getAddress(),
          approvalData,
          await getGasPriceOverrides(signer)
        )
      ).wait()
    )
  }

  // Execute the `EXECUTE` leaves of the Merkle tree.
  logger?.info(`[Sphinx]: executing actions...`)
  const { status, failureAction, executionReceipts } =
    await executeBatchActions(
      networkLeaves,
      chainId,
      module,
      blockGasLimit,
      humanReadableActions,
      signer,
      executeActionsViaManagedService,
      estimateGasViaManagedService,
      logger
    )
  receipts.push(...executionReceipts)

  if (status === MerkleRootStatus.FAILED) {
    return { success: false, receipts, failureAction }
  } else {
    logger?.info(`[Sphinx]: executed actions`)
  }

  // We're done!
  logger?.info(`[Sphinx]: successfully deployed project`)
  return { success: true, receipts }
}

/**
 * Helper function for finding the maximum number of batch elements that can be executed from a
 * given input list of actions. This is done by performing a binary search over the possible
 * batch sizes and finding the largest batch size that does not exceed the maximum gas limit.
 *
 * @param actions List of actions to execute.
 * @returns Maximum number of actions that can be executed.
 */
const findMaxBatchSize = async (
  leaves: SphinxLeafWithProof[],
  maxGasLimit: bigint,
  moduleInterface: ethers.Interface,
  moduleAddress: string,
  signer: ethers.Signer,
  estimateGas: EstimateGas
): Promise<number> => {
  // Optimization, try to execute the entire batch at once before going through the hassle of a
  // binary search. Can often save a significant amount of time on execution.
  if (
    await executable(
      leaves,
      maxGasLimit,
      moduleInterface,
      moduleAddress,
      signer,
      estimateGas
    )
  ) {
    return leaves.length
  }

  // If the full batch size isn't executable, then we need to perform a binary search to find the
  // largest batch size that is actually executable.
  let min = 0
  let max = leaves.length
  while (min < max) {
    const mid = Math.ceil((min + max) / 2)
    if (
      await executable(
        leaves.slice(0, mid),
        maxGasLimit,
        moduleInterface,
        moduleAddress,
        signer,
        estimateGas
      )
    ) {
      min = mid
    } else {
      max = mid - 1
    }
  }

  // No possible size works, this is a problem and should never happen.
  if (min === 0) {
    throw new Error(
      'unable to find a batch size that does not exceed the block gas limit'
    )
  }

  return min
}

/**
 * Helper function for executing a list of actions in batches. We execute actions in batches to
 * reduce the total number of transactions, which makes the deployment faster and cheaper.
 *
 * @param actions List of actions to execute.
 * @returns TODO(docs): batches does not include `EXECUTE` merkle leaves that were executed before
 * this function was called.
 */
export const executeBatchActions = async (
  leavesOnNetwork: SphinxLeafWithProof[],
  chainId: bigint,
  sphinxModule: ethers.Contract,
  blockGasLimit: bigint,
  humanReadableActions: HumanReadableActions,
  signer: ethers.Signer,
  executeActions: ExecuteActions,
  estimateGas: EstimateGas,
  logger?: Logger | undefined
): Promise<{
  status: bigint
  executionReceipts: ethers.TransactionReceipt[]
  batches: SphinxLeafWithProof[][]
  failureAction?: HumanReadableAction
}> => {
  const executionReceipts: ethers.TransactionReceipt[] = []
  const batches: SphinxLeafWithProof[][] = []

  // Set the maximum gas of a batch. Approaching the maximum block gas limit can cause transactions
  // to be executed slowly as a result of the algorithms that miners use to select which
  // transactions to include. As a result, we restrict our total gas usage to a fraction of the
  // block gas limit. Note that this number should match the one used in the Foundry plugin.
  const maxGasLimit = blockGasLimit / BigInt(2)

  // Pull the Merkle root state from the contract so we're guaranteed to be up to date.
  const activeRoot = await sphinxModule.activeMerkleRoot()
  let state: MerkleRootState = await sphinxModule.merkleRootStates(activeRoot)

  // TODO(test): we previously didn't do human readable actions - 2. write a test case for this.

  if (state.status === MerkleRootStatus.FAILED) {
    return {
      status: state.status,
      executionReceipts,
      batches,
      failureAction:
        humanReadableActions[chainId.toString()][
          Number(state.leavesExecuted) - 2
        ],
    }
  }

  // Remove the actions that have already been executed.
  const filtered = leavesOnNetwork.filter((leaf) => {
    return leaf.leaf.index >= state.leavesExecuted
  })

  // We can return early if there are no actions to execute.
  if (filtered.length === 0) {
    logger?.info('[Sphinx]: no actions left to execute')
    return { status: state.status, executionReceipts, batches }
  }

  const moduleAddress = await sphinxModule.getAddress()
  let executed = 0
  while (executed < filtered.length) {
    // Figure out the maximum number of actions that can be executed in a single batch.
    const batchSize = await findMaxBatchSize(
      filtered.slice(executed),
      maxGasLimit,
      sphinxModule.interface,
      moduleAddress,
      signer,
      estimateGas
    )

    // Pull out the next batch of actions.
    const batch = filtered.slice(executed, executed + batchSize)

    // Keep 'em notified.
    logger?.info(
      `[Sphinx]: executing actions ${executed} to ${executed + batchSize} of ${
        filtered.length
      }...`
    )

    const executionData = sphinxModule.interface.encodeFunctionData('execute', [
      batch,
    ])
    const receipt = await (
      await executeActions(moduleAddress, executionData, signer)
    ).wait()

    if (!receipt) {
      throw new Error(
        `Could not find transaction receipt. Should never happen.`
      )
    }

    executionReceipts.push(receipt)
    batches.push(batch)

    // Return early if the deployment failed.
    state = await sphinxModule.merkleRootStates(activeRoot)

    if (state.status === MerkleRootStatus.FAILED) {
      return {
        status: state.status,
        batches,
        executionReceipts,
        failureAction:
          humanReadableActions[chainId.toString()][
            Number(state.leavesExecuted) - 2
          ],
      }
    }

    // Move on to the next batch if necessary.
    executed += batchSize
  }

  // Return the final deployment status.
  return { status: state.status, executionReceipts, batches }
}

/**
 * Helper function that determines if a given batch is executable.
 *
 * @param selected Selected actions to execute.
 * @returns True if the batch is executable, false otherwise.
 */
export const executable = async (
  selected: SphinxLeafWithProof[],
  maxGasLimit: bigint,
  moduleInterface: ethers.Interface,
  moduleAddress: string,
  signer: ethers.Signer,
  estimateGas: EstimateGas
): Promise<boolean> => {
  const executionData = moduleInterface.encodeFunctionData('execute', [
    selected,
  ])
  try {
    await estimateGas(moduleAddress, executionData, maxGasLimit, signer)

    // We didn't error so this batch size is valid.
    return true
  } catch (err) {
    return false
  }
}
