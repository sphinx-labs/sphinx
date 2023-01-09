import * as path from 'path'

import {
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  ParsedChugSplashConfig,
  getChugSplashManager,
  getOwnerWithdrawableAmount,
  getProjectOwnerAddress,
  ChugSplashActionType,
  ChugSplashActionBundle,
  getCurrentChugSplashActionType,
  getAmountToDeposit,
  EXECUTION_BUFFER_MULTIPLIER,
  formatEther,
  getGasPriceOverrides,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers } from 'ethers'
import { getChainId, sleep } from '@eth-optimism/core-utils'
import ora from 'ora'

import { getFinalDeploymentTxnHash } from './deployments'
import { writeHardhatSnapshotId } from './utils'
import { createDeploymentArtifacts } from './artifacts'

export const monitorExecution = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  bundle: ChugSplashActionBundle,
  bundleId: string,
  spinner: ora.Ora
): Promise<string> => {
  spinner.start('Waiting for executor...')
  const provider = hre.ethers.provider

  const projectName = parsedConfig.options.projectName
  const ChugSplashManager = getChugSplashManager(
    provider.getSigner(),
    projectName
  )

  // Get the bundle state of the bundle ID.
  let bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  let actionType: ChugSplashActionType
  while (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    // Check if there are enough funds in the ChugSplashManager to finish the deployment.
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundle,
      bundleState.actionsExecuted.toNumber(),
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

npx hardhat chugsplash-fund --network ${
          hre.network.name
        } --amount ${amountToDeposit.mul(
          EXECUTION_BUFFER_MULTIPLIER
        )} --config-path <configPath>
        `
      )
    }

    if (bundleState.selectedExecutor !== ethers.constants.AddressZero) {
      const currActionType = getCurrentChugSplashActionType(
        bundle,
        bundleState.actionsExecuted
      )

      if (actionType !== currActionType) {
        if (currActionType === ChugSplashActionType.SET_STORAGE) {
          spinner.succeed('Executor has claimed the project.')
          spinner.start('Executor is setting the state variables...')
        } else if (
          currActionType === ChugSplashActionType.DEPLOY_IMPLEMENTATION
        ) {
          spinner.succeed('State variables have been set.')
        } else if (currActionType === ChugSplashActionType.SET_IMPLEMENTATION) {
          spinner.succeed('Contracts have been deployed.')
          spinner.start(
            'Executor is linking the proxies with their implementation contracts...'
          )
        }
        actionType = currActionType
      }

      if (currActionType === ChugSplashActionType.DEPLOY_IMPLEMENTATION) {
        spinner.start(
          `Executor is deploying the contracts... [${getNumDeployedImplementations(
            bundle,
            bundleState.actionsExecuted
          )}/${Object.keys(parsedConfig.contracts).length}]`
        )
      }
    }

    // Wait for one second.
    await sleep(1000)

    // Get the current bundle state.
    bundleState = await ChugSplashManager.bundles(bundleId)
  }

  if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.succeed(`Finished executing ${projectName}.`)
    spinner.start(`Retrieving deployment info...`)
    // Get the `completeChugSplashBundle` transaction.
    const finalDeploymentTxnHash = await getFinalDeploymentTxnHash(
      ChugSplashManager,
      bundleId
    )
    spinner.succeed('Retrieved deployment info.')
    return finalDeploymentTxnHash
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    spinner.fail(`${projectName} was cancelled.`)
    throw new Error(`${projectName} was cancelled.`)
  } else {
    spinner.fail(
      `Project was never active. Current status: ${bundleState.status}`
    )
  }
}

export const getNumDeployedImplementations = (
  bundle: ChugSplashActionBundle,
  actionsExecuted: ethers.BigNumber
): number => {
  return bundle.actions
    .slice(0, actionsExecuted.toNumber())
    .filter(
      (action) =>
        action.action.actionType === ChugSplashActionType.DEPLOY_IMPLEMENTATION
    ).length
}

/**
 * Performs actions on behalf of the project owner after the successful execution of a bundle.
 *
 * @param provider JSON RPC provider corresponding to the current project owner.
 * @param parsedConfig Parsed ParsedChugSplashConfig.
 * @param finalDeploymentTxnHash Hash of the transaction that completed the deployment. This is the
 * call to `completeChugSplashBundle` on the ChugSplashManager.
 * @param withdraw Boolean that determines if remaining funds in the ChugSplashManager should be
 * withdrawn to the project owner.
 * @param newProjectOwner Optional address to receive ownership of the project.
 */
export const postExecutionActions = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  finalDeploymentTxnHash: string,
  withdraw: boolean,
  newProjectOwner?: string,
  spinner: ora.Ora = ora({ isSilent: true })
) => {
  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )
  const currProjectOwner = await getProjectOwnerAddress(
    hre.ethers.provider.getSigner(),
    parsedConfig.options.projectName
  )

  spinner.start(`Retrieving leftover funds...`)

  if ((await signer.getAddress()) === currProjectOwner) {
    const ownerBalance = await getOwnerWithdrawableAmount(
      provider,
      parsedConfig.options.projectName
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

  // Save the snapshot ID if we're on the hardhat network.
  if ((await getChainId(hre.ethers.provider)) === 31337) {
    await writeHardhatSnapshotId(hre)
  }

  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')

  await createDeploymentArtifacts(
    hre,
    parsedConfig,
    finalDeploymentTxnHash,
    artifactFolder
  )

  spinner.succeed(`Wrote deployment artifacts.`)
}
