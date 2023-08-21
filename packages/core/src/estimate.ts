import { CompilerOutputContract } from './languages/solidity/types'
import { ConfigArtifacts } from './config'

export type DeployContractCost = {
  referenceName: string
  cost: bigint
}

export const getEstDeployContractCost = (
  gasEstimates: CompilerOutputContract['evm']['gasEstimates']
): bigint => {
  const { totalCost, codeDepositCost } = gasEstimates.creation

  if (totalCost === 'infinite') {
    // The `totalCost` is 'infinite' because the contract has a constructor, which means the
    // Solidity compiler won't determine the cost of the deployment since the constructor can
    // contain arbitrary logic. In this case, we use the `executionCost` along a buffer multiplier
    // of 1.5.
    return (BigInt(codeDepositCost) * 3n) / 2n
  } else {
    return BigInt(totalCost)
  }
}

export const getDeployContractCosts = (
  configArtifacts: ConfigArtifacts
): DeployContractCost[] => {
  const deployContractCosts: DeployContractCost[] = []
  for (const [referenceName, { artifact, buildInfo }] of Object.entries(
    configArtifacts
  )) {
    const { sourceName, contractName } = artifact

    const deployContractCost = getEstDeployContractCost(
      buildInfo.output.contracts[sourceName][contractName].evm.gasEstimates
    )

    deployContractCosts.push({
      referenceName,
      cost: deployContractCost,
    })
  }
  return deployContractCosts
}
