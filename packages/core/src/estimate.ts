import { BigNumber } from 'ethers/lib/ethers'

import { ProjectConfigArtifacts } from './config/types'
import { CompilerOutputContract } from './languages/solidity/types'

export type DeployContractCost = {
  referenceName: string
  cost: BigNumber
}

export const getEstDeployContractCost = (
  gasEstimates: CompilerOutputContract['evm']['gasEstimates']
): BigNumber => {
  const { totalCost, codeDepositCost } = gasEstimates.creation

  if (totalCost === 'infinite') {
    // The `totalCost` is 'infinite' because the contract has a constructor, which means the
    // Solidity compiler won't determine the cost of the deployment since the constructor can
    // contain arbitrary logic. In this case, we use the `executionCost` along a buffer multiplier
    // of 1.5.
    return BigNumber.from(codeDepositCost).mul(3).div(2)
  } else {
    return BigNumber.from(totalCost)
  }
}

export const getDeployContractCosts = (
  projectConfigArtifacts: ProjectConfigArtifacts
): DeployContractCost[] => {
  const deployContractCosts: DeployContractCost[] = []
  for (const [referenceName, { artifact, buildInfo }] of Object.entries(
    projectConfigArtifacts
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
