import { sleep } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'
import ora from 'ora'

import {
  ChugSplashActionBundle,
  ChugSplashActionType,
  ChugSplashBundles,
  DeploymentState,
  DeploymentStatus,
} from '../actions'
import { getAmountToDeposit } from '../fund'
import { getChugSplashManager, getDeploymentEvents } from '../utils'
import { ParsedProjectConfig } from '../config/types'

export const getNumDeployedContracts = (
  bundle: ChugSplashActionBundle,
  actionsExecuted: ethers.BigNumber
): number => {
  return bundle.actions
    .slice(0, actionsExecuted.toNumber())
    .filter(
      (action) =>
        action.action.actionType === ChugSplashActionType.DEPLOY_CONTRACT
    ).length
}

export const monitorExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedProjectConfig: ParsedProjectConfig,
  bundles: ChugSplashBundles,
  deploymentId: string,
  silent: boolean
) => {
  const spinner = ora({ isSilent: silent })
  spinner.start('Waiting for executor...')
  const { project, deployer } = parsedProjectConfig.options
  const ChugSplashManager = getChugSplashManager(deployer, signer)

  // Get the deployment state of the deployment ID.
  let deploymentState: DeploymentState = await ChugSplashManager.deployments(
    deploymentId
  )

  while (deploymentState.selectedExecutor === ethers.constants.AddressZero) {
    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await ChugSplashManager.deployments(deploymentId)
  }

  spinner.succeed('Executor has claimed the project.')
  spinner.start('Waiting for execution to be initiated...')

  while (deploymentState.status === DeploymentStatus.APPROVED) {
    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await ChugSplashManager.deployments(deploymentId)
  }

  spinner.succeed('Execution initiated.')

  const totalNumActions = bundles.actionBundle.actions.length
  while (deploymentState.status === DeploymentStatus.PROXIES_INITIATED) {
    if (deploymentState.actionsExecuted.toNumber() === totalNumActions) {
      spinner.start(`All actions have been executed. Completing execution...`)
    } else {
      spinner.start(
        `Number of actions executed: ${deploymentState.actionsExecuted.toNumber()} out of ${totalNumActions}`
      )
    }

    // Check if there are enough funds in the ChugSplashManager to finish the deployment.
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundles,
      deploymentState.actionsExecuted.toNumber(),
      parsedProjectConfig,
      false
    )
    if (amountToDeposit.gt(0)) {
      // If the amount to deposit is non-zero, we throw an error that informs the user to deposit
      // more funds.
      spinner.fail(`Project has insufficient funds to complete the deployment.`)
      throw new Error(
        `${project} has insufficient funds to complete the deployment. You'll need to deposit additional funds via the UI.`
      )
    }

    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await ChugSplashManager.deployments(deploymentId)
  }

  if (deploymentState.status === DeploymentStatus.COMPLETED) {
    spinner.succeed(`Finished executing ${project}.`)
    spinner.start(`Retrieving deployment info...`)
    const deploymentEvents = await getDeploymentEvents(
      ChugSplashManager,
      deploymentId
    )
    spinner.succeed('Retrieved deployment info.')
    return deploymentEvents
  } else if (deploymentState.status === DeploymentStatus.CANCELLED) {
    spinner.fail(`${project} was cancelled.`)
    throw new Error(`${project} was cancelled.`)
  } else {
    spinner.fail(
      `Project was never active. Current status: ${deploymentState.status}`
    )
  }
}
