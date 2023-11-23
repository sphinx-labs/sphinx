import { SphinxMerkleTree, decodeExecuteLeafData } from '@sphinx-labs/contracts'

import { SphinxJsonRpcProvider } from './provider'

export const estimateExecutionGas = async (
  bundle: SphinxMerkleTree,
  actionsExecuted: number
): Promise<bigint> => {
  const gas = bundle.leavesWithProofs
    .slice(actionsExecuted)
    .map((action) => {
      const values = decodeExecuteLeafData(action.leaf.data)
      return values[2]
    })
    .reduce((a, b) => a + b, BigInt(0))

  return gas
}

export const estimateExecutionCost = async (
  provider: SphinxJsonRpcProvider,
  bundle: SphinxMerkleTree,
  actionsExecuted: number
): Promise<bigint> => {
  const estExecutionGas = await estimateExecutionGas(bundle, actionsExecuted)
  const feeData = await provider.getFeeData()

  // Use the `maxFeePerGas` if it exists, otherwise use the `gasPrice`. The `maxFeePerGas` is not
  // defined on Optimism.
  const estGasPrice = feeData.maxFeePerGas ?? feeData.gasPrice

  if (estGasPrice === null) {
    throw new Error(`Gas price does not exist on network`)
  }

  return estExecutionGas * estGasPrice
}
