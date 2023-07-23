import { ethers } from 'ethers'

import { isContractDeployed } from './utils'
import {
  SphinxBundles,
  DeployContractAction,
  fromRawSphinxAction,
  isDeployContractAction,
  isSetStorageAction,
} from './actions'
import { contractKindHashes } from './config/types'

export const estimateExecutionGas = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: SphinxBundles,
  actionsExecuted: number
): Promise<ethers.BigNumber> => {
  const actions = bundles.actionBundle.actions
    .map((action) => fromRawSphinxAction(action.action))
    .slice(actionsExecuted)

  const estimatedGas = ethers.BigNumber.from(150_000).mul(
    actions.filter((action) => isSetStorageAction(action)).length
  )

  const deployedContractPromises = actions
    .filter((action) => isDeployContractAction(action))
    .map(async (action: DeployContractAction) => {
      if (await isContractDeployed(action.addr, provider)) {
        return ethers.BigNumber.from(0)
      } else if (action.contractKindHash === contractKindHashes['proxy']) {
        // If the contract is a default proxy, then estimate 550k gas. This is a minor optimization
        // that we can make because we know the cost of deploying the proxy ahead of time.
        return ethers.BigNumber.from(550_000)
      } else {
        return provider.estimateGas({
          data: action.code,
        })
      }
    })

  const resolved = await Promise.all(deployedContractPromises)

  const estimatedContractDeploymentGas = resolved.reduce(
    (a, b) => a.add(b),
    ethers.BigNumber.from(0)
  )

  // We also add an extra 200k gas for each proxy target (including any that are not being upgraded) to account
  // for the variable cost of the `initiateBundleExecution` and `completeBundleExecution` functions.
  const initiateAndCompleteCost = ethers.BigNumber.from(200_000).mul(
    bundles.targetBundle.targets.length
  )

  return estimatedGas
    .add(estimatedContractDeploymentGas)
    .add(initiateAndCompleteCost)
}

export const estimateExecutionCost = async (
  provider: ethers.providers.JsonRpcProvider,
  bundles: SphinxBundles,
  actionsExecuted: number
): Promise<ethers.BigNumber> => {
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

  return estExecutionGas.mul(estGasPrice)
}
