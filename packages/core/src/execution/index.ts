import { sleep } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'
import ora from 'ora'

import {
  ChugSplashActionBundle,
  ChugSplashActionType,
  ChugSplashBundles,
  DeploymentState,
  DeploymentStatus,
  writeDeploymentArtifacts,
} from '../actions'
import { ConfigArtifacts, ParsedChugSplashConfig } from '../config'
import { Integration } from '../constants'
import { getAmountToDeposit } from '../fund'
import {
  getChugSplashManager,
  getDeploymentEvents,
  getGasPriceOverrides,
  getProjectOwnerAddress,
} from '../utils'

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
  parsedConfig: ParsedChugSplashConfig,
  bundles: ChugSplashBundles,
  deploymentId: string,
  spinner: ora.Ora
) => {
  spinner.start('Waiting for executor...')
  const { projectName, organizationID } = parsedConfig.options
  const ChugSplashManager = getChugSplashManager(signer, organizationID)

  // Get the deployment state of the deployment ID.
  let deploymentState: DeploymentState = await ChugSplashManager.deployments(
    deploymentId
  )

  while (deploymentState.selectedExecutor !== ethers.constants.AddressZero) {
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
      parsedConfig,
      false
    )
    if (amountToDeposit.gt(0)) {
      // If the amount to deposit is non-zero, we throw an error that informs the user to deposit
      // more funds.
      spinner.fail(`Project has insufficient funds to complete the deployment.`)
      throw new Error(
        `${projectName} has insufficient funds to complete the deployment. You'll need to deposit additional funds via the UI.`
      )
    }

    // Wait for one second.
    await sleep(1000)

    // Get the current deployment state.
    deploymentState = await ChugSplashManager.deployments(deploymentId)
  }

  if (deploymentState.status === DeploymentStatus.COMPLETED) {
    spinner.succeed(`Finished executing ${projectName}.`)
    spinner.start(`Retrieving deployment info...`)
    const deploymentEvents = await getDeploymentEvents(
      ChugSplashManager,
      deploymentId
    )
    spinner.succeed('Retrieved deployment info.')
    return deploymentEvents
  } else if (deploymentState.status === DeploymentStatus.CANCELLED) {
    spinner.fail(`${projectName} was cancelled.`)
    throw new Error(`${projectName} was cancelled.`)
  } else {
    spinner.fail(
      `Project was never active. Current status: ${deploymentState.status}`
    )
  }
}

/**
 * Performs actions on behalf of the project owner after the successful execution of a deployment.
 *
 * @param provider JSON RPC provider corresponding to the current project owner.
 * @param parsedConfig Parsed ParsedChugSplashConfig.
 * @param deploymentEvents Array of `DefaultProxyDeployed` and `ContractDeployed` events
 * @param withdraw Boolean that determines if remaining funds in the ChugSplashManager should be
 * withdrawn to the project owner.
 * @param newProjectOwner Optional address to receive ownership of the project.
 */
export const postExecutionActions = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  deploymentEvents: ethers.Event[],
  networkName: string,
  deploymentFolderPath: string,
  configArtifacts: ConfigArtifacts,
  integration: Integration,
  newProjectOwner?: string | undefined,
  spinner: ora.Ora = ora({ isSilent: true })
) => {
  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.organizationID
  )
  const currProjectOwner = await getProjectOwnerAddress(ChugSplashManager)

  // Transfer ownership of the ChugSplashManager if a new project owner has been specified.
  if (
    newProjectOwner !== undefined &&
    ethers.utils.isAddress(newProjectOwner) &&
    newProjectOwner !== currProjectOwner
  ) {
    spinner.start(`Transferring project ownership to: ${newProjectOwner}`)
    if (newProjectOwner === ethers.constants.AddressZero) {
      // We must call a separate function if ownership is being transferred to address(0).
      await (
        await ChugSplashManager.renounceOwnership(
          await getGasPriceOverrides(provider)
        )
      ).wait()
    } else {
      await (
        await ChugSplashManager.transferOwnership(
          newProjectOwner,
          await getGasPriceOverrides(provider)
        )
      ).wait()
    }
    spinner.succeed(`Transferred project ownership to: ${newProjectOwner}`)
  }

  spinner.start(`Writing deployment artifacts...`)

  await writeDeploymentArtifacts(
    provider,
    parsedConfig,
    deploymentEvents,
    networkName,
    deploymentFolderPath,
    configArtifacts
  )

  spinner.succeed(`Wrote deployment artifacts.`)
}
