import { isContractDeployed } from './utils'
import { SphinxJsonRpcProvider } from './provider'
import {
  SphinxBundles,
  DeployContractAction,
  fromRawSphinxAction,
  isDeployContractAction,
  isSetStorageAction,
  isCallAction,
} from './actions'
import { getCreate3Address } from './config'

export const estimateExecutionGas = async (
  managerAddress: string,
  provider: SphinxJsonRpcProvider,
  bundles: SphinxBundles,
  actionsExecuted: number
): Promise<bigint> => {
  const gas = bundles.actionBundle.actions
    .slice(actionsExecuted)
    .map((action) => action.gas)
    .reduce((a, b) => a + b, BigInt(0))

  return gas
}

export const estimateExecutionCost = async (
  managerAddress: string,
  provider: SphinxJsonRpcProvider,
  bundles: SphinxBundles,
  actionsExecuted: number
): Promise<bigint> => {
  const estExecutionGas = await estimateExecutionGas(
    managerAddress,
    provider,
    bundles,
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
