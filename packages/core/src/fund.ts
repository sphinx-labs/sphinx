import { isContractDeployed } from './utils'
import { SphinxJsonRpcProvider } from './provider'
import {
  SphinxBundles,
  DeployContractAction,
  fromRawSphinxAction,
  isDeployContractAction,
  isSetStorageAction,
} from './actions'
import { contractKindHashes } from './config/types'

export const estimateExecutionGas = async (
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

  const deployedContractPromises = actions
    .filter((action) => isDeployContractAction(action))
    .map(async (action: DeployContractAction) => {
      if (await isContractDeployed(action.addr, provider)) {
        return BigInt(0)
      } else if (action.contractKindHash === contractKindHashes['proxy']) {
        // If the contract is a default proxy, then estimate 550k gas. This is a minor optimization
        // that we can make because we know the cost of deploying the proxy ahead of time.
        return BigInt(550_000)
      } else {
        return provider.estimateGas({
          data: action.code,
        })
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

  return estimatedGas + estimatedContractDeploymentGas + initiateAndCompleteCost
}

export const estimateExecutionCost = async (
  provider: SphinxJsonRpcProvider,
  bundles: SphinxBundles,
  actionsExecuted: number
): Promise<bigint> => {
  const estExecutionGas = await estimateExecutionGas(
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
