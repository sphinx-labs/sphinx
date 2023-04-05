import { sleep } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'
import ora from 'ora'

import {
  ChugSplashActionBundle,
  ChugSplashActionType,
  ChugSplashBundles,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  createDeploymentArtifacts,
} from '../actions'
import { ParsedChugSplashConfig } from '../config'
import { EXECUTION_BUFFER_MULTIPLIER, Integration } from '../constants'
import { getAmountToDeposit, getOwnerWithdrawableAmount } from '../fund'
import { ArtifactPaths } from '../languages'
import {
  formatEther,
  getBundleCompletionTxnHash,
  getChugSplashManager,
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
  bundleId: string,
  spinner: ora.Ora
) => {
  spinner.start('Waiting for executor...')
  const { projectName, organizationID } = parsedConfig.options
  const ChugSplashManager = getChugSplashManager(signer, organizationID)

  // Get the bundle state of the bundle ID.
  let bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  while (bundleState.selectedExecutor !== ethers.constants.AddressZero) {
    // Wait for one second.
    await sleep(1000)

    // Get the current bundle state.
    bundleState = await ChugSplashManager.bundles(bundleId)
  }

  spinner.succeed('Executor has claimed the project.')
  spinner.start('Waiting for execution to be initiated...')

  while (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    // Wait for one second.
    await sleep(1000)

    // Get the current bundle state.
    bundleState = await ChugSplashManager.bundles(bundleId)
  }

  spinner.succeed('Execution initiated.')

  const totalNumActions = bundles.actionBundle.actions.length
  while (bundleState.status === ChugSplashBundleStatus.INITIATED) {
    if (bundleState.actionsExecuted.toNumber() === totalNumActions) {
      spinner.start(`All actions have been executed. Completing execution...`)
    } else {
      spinner.start(
        `Number of actions executed: ${bundleState.actionsExecuted.toNumber()} out of ${totalNumActions}`
      )
    }

    // Check if there are enough funds in the ChugSplashManager to finish the deployment.
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundles,
      bundleState.actionsExecuted.toNumber(),
      organizationID,
      projectName,
      false
    )
    if (amountToDeposit.gt(0)) {
      // If the amount to deposit is non-zero, we throw an error that informs the user to deposit
      // more funds.
      spinner.fail(`Project has insufficient funds to complete the deployment.`)
      throw new Error(
        `${projectName} has insufficient funds to complete the deployment. Please report this error to improve our deployment cost estimation.
  Run the following command to add funds to your deployment so it can be completed:

  npx hardhat chugsplash-fund --network <network> --amount ${amountToDeposit.mul(
    EXECUTION_BUFFER_MULTIPLIER
  )} --config-path <configPath>
          `
      )
    }

    // Wait for one second.
    await sleep(1000)

    // Get the current bundle state.
    bundleState = await ChugSplashManager.bundles(bundleId)
  }

  if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.succeed(`Finished executing ${projectName}.`)
    spinner.start(`Retrieving deployment info...`)
    const deploymentEvents = await getDeploymentEvents(
      ChugSplashManager,
      bundleId
    )
    spinner.succeed('Retrieved deployment info.')
    return deploymentEvents
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    spinner.fail(`${projectName} was cancelled.`)
    throw new Error(`${projectName} was cancelled.`)
  } else {
    spinner.fail(
      `Project was never active. Current status: ${bundleState.status}`
    )
  }
}

/**
 * Performs actions on behalf of the project owner after the successful execution of a bundle.
 *
 * @param provider JSON RPC provider corresponding to the current project owner.
 * @param parsedConfig Parsed ParsedChugSplashConfig.
 * @param deploymentEvents Array of `DefaultProxyDeployed` and `ImplementationDeployed` events
 * @param withdraw Boolean that determines if remaining funds in the ChugSplashManager should be
 * withdrawn to the project owner.
 * @param newProjectOwner Optional address to receive ownership of the project.
 */
export const postExecutionActions = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  deploymentEvents: ethers.Event[],
  withdraw: boolean,
  networkName: string,
  deploymentfolderPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  remoteExecution: boolean,
  newProjectOwner?: string,
  spinner: ora.Ora = ora({ isSilent: true })
) => {
  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.organizationID
  )
  const currProjectOwner = await getProjectOwnerAddress(
    signer,
    parsedConfig.options.organizationID
  )

  spinner.start(`Retrieving leftover funds...`)

  if ((await signer.getAddress()) === currProjectOwner) {
    const ownerBalance = await getOwnerWithdrawableAmount(
      provider,
      parsedConfig.options.organizationID
    )
    if (withdraw) {
      // Withdraw any of the current project owner's funds in the ChugSplashManager.
      if (ownerBalance.gt(0)) {
        await (
          await ChugSplashManager.withdrawOwnerETH(
            await getGasPriceOverrides(provider)
          )
        ).wait()
        spinner.succeed(
          `Sent leftover funds to the project owner. Amount: ${formatEther(
            ownerBalance,
            4
          )} ETH. Recipient: ${currProjectOwner}`
        )
      } else {
        spinner.succeed(
          `There were no leftover funds to send to the project owner.`
        )
      }
    } else {
      spinner.succeed(
        `Skipped withdrawing leftover funds. Amount remaining: ${formatEther(
          ownerBalance,
          4
        )} ETH.`
      )
    }

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
  }

  spinner.start(`Writing deployment artifacts...`)

  await writeDeploymentArtifacts(hre, parsedConfig, deploymentEvents)

  spinner.succeed(`Wrote deployment artifacts.`)
}
