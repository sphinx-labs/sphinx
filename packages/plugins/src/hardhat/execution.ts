import {
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  ParsedChugSplashConfig,
  getChugSplashManager,
  getOwnerBalanceInChugSplashManager,
  getProjectOwnerAddress,
  ChugSplashActionType,
  ChugSplashActionBundle,
  getCurrentChugSplashActionType,
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
    // Check if the available execution amount in the ChugSplashManager is too low to finish the
    // deployment. We do this by estimating the cost of a large transaction, which is calculated by
    // taking the current gas price and multiplying it by eight million. For reference, it costs
    // ~5.5 million gas to deploy Seaport. This estimated cost is compared to the available
    // execution amount in the ChugSplashManager.
    const gasPrice = await provider.getGasPrice()
    const availableExecutionAmount = await getOwnerBalanceInChugSplashManager(
      provider,
      projectName
    )
    if (gasPrice.mul(8_000_000).gt(availableExecutionAmount)) {
      // If the available execution amount is less than the estimated value, throw an error.
      const estCost = gasPrice.mul(ethers.utils.parseEther('0.1'))
      spinner.fail(`Project ran out of funds.`)
      throw new Error(
        `${projectName} ran out of funds. Please report this error.
Run the following command to add funds to your deployment so it can be completed:

npx hardhat chugsplash-fund --network ${hre.network.name} --amount ${estCost} <configPath>
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
          spinner.succeed('The contracts have been deployed.')
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
    spinner.succeed('Got deployment info.')
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
 * @param newProjectOwner Optional address to receive ownership of the project.
 */
export const postExecutionActions = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  finalDeploymentTxnHash: string,
  newProjectOwner?: string
) => {
  const signer = hre.ethers.provider.getSigner()
  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )
  const currProjectOwner = await getProjectOwnerAddress(
    hre.ethers.provider,
    parsedConfig.options.projectName
  )

  if ((await signer.getAddress()) === currProjectOwner) {
    // Withdraw any of the current project owner's funds in the ChugSplashManager.
    const ownerFunds = await getOwnerBalanceInChugSplashManager(
      hre.ethers.provider,
      parsedConfig.options.projectName
    )
    if (ownerFunds.gt(0)) {
      await (await ChugSplashManager.withdrawOwnerETH()).wait()
    }

    // Transfer ownership of the ChugSplashManager if a new project owner has been specified.
    if (newProjectOwner !== undefined && newProjectOwner !== currProjectOwner) {
      if (newProjectOwner === ethers.constants.AddressZero) {
        // We must call a separate function if ownership is being transferred to address(0).
        await (await ChugSplashManager.renounceOwnership()).wait()
      } else {
        await (
          await ChugSplashManager.transferOwnership(newProjectOwner)
        ).wait()
      }
    }
  }

  // Save the snapshot ID if we're on the hardhat network.
  if ((await getChainId(hre.ethers.provider)) === 31337) {
    await writeHardhatSnapshotId(hre)
  }

  await createDeploymentArtifacts(hre, parsedConfig, finalDeploymentTxnHash)
}
