import { sleep } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'
import ora from 'ora'

import {
  SphinxActionBundle,
  SphinxActionType,
  SphinxBundles,
  DeploymentState,
  DeploymentStatus,
} from '../actions'
import { getSphinxManager, getDeploymentEvents } from '../utils'
import { ParsedConfigWithOptions } from '../config'

export const getNumDeployedContracts = (
  bundle: SphinxActionBundle,
  actionsExecuted: ethers.BigNumber
): number => {
  return bundle.actions
    .slice(0, actionsExecuted.toNumber())
    .filter(
      (action) => action.action.actionType === SphinxActionType.DEPLOY_CONTRACT
    ).length
}

export const monitorExecution = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedConfigWithOptions,
  bundles: SphinxBundles,
  deploymentId: string,
  silent: boolean
) => {
  const spinner = ora({ isSilent: silent })
  spinner.start('Waiting for executor...')
  const { project, deployer } = parsedConfig
  const SphinxManager = getSphinxManager(deployer, signer)

  // Get the deployment state of the deployment ID.
  let deploymentState: DeploymentState = await SphinxManager.deployments(
    deploymentId
  )

  while (deploymentState.selectedExecutor === ethers.constants.AddressZero) {
    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await SphinxManager.deployments(deploymentId)
  }

  spinner.succeed('Executor has claimed the project.')
  spinner.start('Waiting for execution to be initiated...')

  while (deploymentState.status === DeploymentStatus.APPROVED) {
    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await SphinxManager.deployments(deploymentId)
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

    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await SphinxManager.deployments(deploymentId)
  }

  if (deploymentState.status === DeploymentStatus.COMPLETED) {
    spinner.succeed(`Finished executing ${project}.`)
    spinner.start(`Retrieving deployment info...`)
    const deploymentEvents = await getDeploymentEvents(
      SphinxManager,
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
