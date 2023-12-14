import { ethers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import {
  SphinxLeafWithProof,
  ManagedServiceABI,
  SphinxMerkleTree,
  getManagedServiceAddress,
  decodeExecuteLeafData,
} from '@sphinx-labs/contracts'

import {
  MerkleRootState,
  MerkleRootStatus,
  HumanReadableAction,
  HumanReadableActions,
} from './types'
import { getGasPriceOverrides } from '../utils'
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

  // We execute all actions in batches to reduce the total number of transactions and reduce the
  // cost of a deployment in general. Approaching the maximum block gas limit can cause
  // transactions to be executed slowly as a result of the algorithms that miners use to select
  // which transactions to include. As a result, we restrict our total gas usage to a fraction of
  // the block gas limit. Note that this number should match the one used in the Foundry plugin.
  const maxGasLimit = blockGasLimit / 2n

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

  try {
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
  } catch (e) {
    if (!e.message.includes('SphinxModule: active merkle root')) {
      throw e
    }
  }

  // Execute the `EXECUTE` leaves of the Merkle tree.
  logger?.info(`[Sphinx]: executing actions...`)
  const { status, failureAction } = await executeBatchActions(
    networkLeaves,
    module,
    managedService,
    maxGasLimit,
    humanReadableActions,
    signer,
    receipts,
    logger
  )

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
  maxGasLimit: bigint
): Promise<number> => {
  // Optimization, try to execute the entire batch at once before going through the hassle of a
  // binary search. Can often save a significant amount of time on execution.
  if (await executable(leaves, maxGasLimit)) {
    return leaves.length
  }

  // If the full batch size isn't executable, then we need to perform a binary search to find the
  // largest batch size that is actually executable.
  let min = 0
  let max = leaves.length
  while (min < max) {
    const mid = Math.ceil((min + max) / 2)
    if (await executable(leaves.slice(0, mid), maxGasLimit)) {
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
 * Helper function for executing a list of actions in batches.
 *
 * @param actions List of actions to execute.
 */
const executeBatchActions = async (
  leaves: SphinxLeafWithProof[],
  module: ethers.Contract,
  managedService: ethers.Contract,
  maxGasLimit: bigint,
  humanReadableActions: HumanReadableActions,
  signer: ethers.Signer,
  receipts: ethers.TransactionReceipt[],
  logger?: Logger | undefined
): Promise<{
  status: bigint
  receipts: ethers.TransactionReceipt[]
  failureAction?: HumanReadableAction
}> => {
  const chainId = (await signer.provider?.getNetwork())?.chainId!

  // Pull the Merkle root state from the contract so we're guaranteed to be up to date.
  const activeRoot = await module.activeMerkleRoot()
  let state: MerkleRootState = await module.merkleRootStates(activeRoot)

  // Remove the actions that have already been executed.
  const filtered = leaves.filter((leaf) => {
    return leaf.leaf.index >= state.leavesExecuted
  })

  // We can return early if there are no actions to execute.
  if (filtered.length === 0) {
    logger?.info('[Sphinx]: no actions left to execute')
    return { status: state.status, receipts }
  }

  let executed = 0
  while (executed < filtered.length) {
    const mostRecentState: MerkleRootState = await module.merkleRootStates(
      activeRoot
    )
    if (mostRecentState.status === MerkleRootStatus.FAILED) {
      return {
        status: mostRecentState.status,
        receipts,
        failureAction:
          humanReadableActions[chainId.toString()][
            Number(state.leavesExecuted)
          ],
      }
    }

    // Figure out the maximum number of actions that can be executed in a single batch.
    const batchSize = await findMaxBatchSize(
      filtered.slice(executed),
      maxGasLimit
    )

    // Pull out the next batch of actions.
    const batch = filtered.slice(executed, executed + batchSize)

    // Keep 'em notified.
    logger?.info(
      `[Sphinx]: executing actions ${executed} to ${executed + batchSize} of ${
        filtered.length
      }...`
    )

    const executeData = module.interface.encodeFunctionData('execute', [batch])
    const res = await managedService.exec(
      await module.getAddress(),
      executeData,
      await getGasPriceOverrides(signer)
    )
    const tx = await res.wait()
    receipts.push(tx)

    // Return early if the deployment failed.
    state = await module.merkleRootStates(activeRoot)

    if (state.status === MerkleRootStatus.FAILED) {
      return {
        status: state.status,
        receipts,
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
  return { status: state.status, receipts }
}

/**
 * Helper function that determines if a given batch is executable.
 *
 * @param selected Selected actions to execute.
 * @returns True if the batch is executable, false otherwise.
 */
export const executable = async (
  selected: SphinxLeafWithProof[],
  maxGasLimit: bigint
): Promise<boolean> => {
  const estGasUsed = selected
    .map((action) => decodeExecuteLeafData(action.leaf).gas)
    .reduce((a, b) => a + b)

  return maxGasLimit > estGasUsed
}
