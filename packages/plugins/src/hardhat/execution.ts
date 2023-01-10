import * as path from 'path'

import {
  ParsedChugSplashConfig,
  getChugSplashManager,
  getOwnerWithdrawableAmount,
  getProjectOwnerAddress,
  formatEther,
  getGasPriceOverrides,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers } from 'ethers'
import { getChainId } from '@eth-optimism/core-utils'
import ora from 'ora'

import { writeHardhatSnapshotId } from './utils'
import { createDeploymentArtifacts } from './artifacts'

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
  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')

  await createDeploymentArtifacts(
    hre,
    parsedConfig,
    finalDeploymentTxnHash,
    artifactFolder,
    buildInfoFolder,
    'hardhat',
    spinner
  )

  spinner.succeed(`Wrote deployment artifacts.`)
}
