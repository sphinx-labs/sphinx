import { SphinxMerkleTree, decodeExecuteLeafData } from '@sphinx-labs/contracts'

import { SphinxJsonRpcProvider } from './provider'

export const estimateExecutionGas = async (
  merkleTree: SphinxMerkleTree,
  actionsExecuted: number
): Promise<bigint> => {
  const gas = merkleTree.leavesWithProofs
    .slice(actionsExecuted)
    .map((action) => decodeExecuteLeafData(action.leaf).gas)
    .reduce((a, b) => a + b, BigInt(0))

  return gas
}

export const estimateExecutionCost = async (
  provider: SphinxJsonRpcProvider,
  merkleTree: SphinxMerkleTree,
  actionsExecuted: number
): Promise<bigint> => {
  const estExecutionGas = await estimateExecutionGas(
    merkleTree,
    actionsExecuted
  )
  const feeData = await provider.getFeeData()

  // Use the `maxFeePerGas` if it exists, otherwise use the `gasPrice`. The `maxFeePerGas` is not
  // defined on Optimism.
  const estGasPrice = feeData.maxFeePerGas ?? feeData.gasPrice

  if (estGasPrice === null) {
    throw new Error(`Gas price does not exist on network`)
  }

  return estExecutionGas * estGasPrice
}
