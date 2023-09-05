import { ethers } from 'ethers'
import ora from 'ora'

import {
  SphinxActionBundle,
  SphinxActionType,
  SphinxBundles,
  DeploymentState,
  DeploymentStatus,
} from '../actions'
import { getSphinxManager, getDeploymentEvents, sleep } from '../utils'
import { SphinxJsonRpcProvider } from '../provider'
import { ParsedConfigWithOptions } from '../config'

export const getNumDeployedContracts = (
  bundle: SphinxActionBundle,
  actionsExecuted: bigint
): number => {
  return bundle.actions
    .slice(0, Number(actionsExecuted))
    .filter(
      (action) => action.action.actionType === SphinxActionType.DEPLOY_CONTRACT
    ).length
}

export const monitorExecution = async (
  provider: SphinxJsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedConfigWithOptions,
  bundles: SphinxBundles,
  deploymentId: string,
  silent: boolean
) => {
  const spinner = ora({ isSilent: silent })
  spinner.start('Waiting for executor...')
  const { projectName, manager } = parsedConfig
  const SphinxManager = getSphinxManager(manager, signer)

  // Get the deployment state of the deployment ID.
  let deploymentState: DeploymentState = await SphinxManager.deployments(
    deploymentId
  )

  while (deploymentState.selectedExecutor === ethers.ZeroAddress) {
    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await SphinxManager.deployments(deploymentId)
  }

  spinner.succeed('Executor has claimed the project.')
  spinner.start('Executing actions...')

  const totalNumActions = bundles.actionBundle.actions.length
  while (
    deploymentState.status !== DeploymentStatus.COMPLETED &&
    deploymentState.status !== DeploymentStatus.CANCELLED &&
    deploymentState.status !== DeploymentStatus.FAILED
  ) {
    if (Number(deploymentState.actionsExecuted) === totalNumActions) {
      spinner.start(`All actions have been executed. Completing execution...`)
    } else {
      spinner.start(
        `Number of actions executed: ${Number(
          deploymentState.actionsExecuted
        )} out of ${totalNumActions}`
      )
    }

    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await SphinxManager.deployments(deploymentId)
  }

  if (deploymentState.status === DeploymentStatus.COMPLETED) {
    spinner.succeed(`Finished executing ${projectName}.`)
    spinner.start(`Retrieving deployment info...`)
    const deploymentEvents = await getDeploymentEvents(
      SphinxManager,
      deploymentId
    )
    spinner.succeed('Retrieved deployment info.')
    return deploymentEvents
  } else if (deploymentState.status === DeploymentStatus.CANCELLED) {
    spinner.fail(`${projectName} was cancelled.`)
    throw new Error(`${projectName} was cancelled.`)
  } else if (deploymentState.status === DeploymentStatus.FAILED) {
    spinner.fail(`${projectName} failed.`)
    throw new Error(`${projectName} failed.`)
  } else {
    spinner.fail(
      `Project ${projectName} ended in an unknown state: ${deploymentState.status}`
    )
  }
}
