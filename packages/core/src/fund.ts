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
  const actions = bundles.actionBundle.actions
    .map((action) => fromRawSphinxAction(action.action))
    .slice(actionsExecuted)

  const numSetStorageActions = actions.filter((action) =>
    isSetStorageAction(action)
  ).length
  const estimatedGas = BigInt(150_000) * BigInt(numSetStorageActions)

  const numCallActions = actions.filter((action) => isCallAction(action)).length
  const estimatedCallActionGas = BigInt(250_000) * BigInt(numCallActions)

  const deployedContractPromises = actions
    .filter((action) => isDeployContractAction(action))
    .map(async (action: DeployContractAction) => {
      const addr = getCreate3Address(managerAddress, action.salt)
      if (await isContractDeployed(addr, provider)) {
        return BigInt(0)
      } else {
        try {
          // We estimate the gas for the contract deployment by calling `estimateGas` on the provider.
          return await provider.estimateGas({
            data: action.creationCodeWithConstructorArgs,
          })
        } catch (e) {
          // If the estimate fails, we return a default value of 500k gas which is plenty since the actual
          // deployment will not happen on chain.
          return BigInt(500_000)
        }
      }
    })

  const resolved = await Promise.all(deployedContractPromises)

  const estimatedContractDeploymentGas = resolved.reduce(
    (a, b) => a + b,
    BigInt(0)
  )

  // We also add an extra 200k gas for each proxy target (including any that are not being upgraded) to account
  // for the variable cost of the `initiateBundleExecution` and `completeBundleExecution` functions.
  const initiateAndCompleteCost =
    BigInt(200_000) * BigInt(bundles.targetBundle.targets.length)

  return (
    estimatedGas +
    estimatedCallActionGas +
    estimatedContractDeploymentGas +
    initiateAndCompleteCost
  )
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
