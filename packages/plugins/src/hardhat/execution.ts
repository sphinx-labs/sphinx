import {
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  ParsedChugSplashConfig,
  getChugSplashRegistry,
  getChugSplashManager,
  getOwnerBalanceInChugSplashManager,
  getProjectOwnerAddress,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers } from 'ethers'
import { ChugSplashManagerABI } from '@chugsplash/contracts'
import { getChainId, sleep } from '@eth-optimism/core-utils'

import { getFinalDeploymentTxnHash } from './deployments'
import { writeHardhatSnapshotId } from './utils'

export const monitorRemoteExecution = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  bundleId: string
): Promise<string> => {
  const provider = hre.ethers.provider

  const projectName = parsedConfig.options.projectName
  const ChugSplashRegistry = getChugSplashRegistry(provider.getSigner())
  const ChugSplashManager = new ethers.Contract(
    await ChugSplashRegistry.projects(projectName),
    ChugSplashManagerABI,
    provider
  )

  // Get the bundle state of the bundle ID.
  let bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  // Handle cases where the bundle is not approved.
  if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(`${projectName} was cancelled.`)
  } else if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
    throw new Error(
      `${parsedConfig.options.projectName} has not been proposed or approved for
execution on ${hre.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.PROPOSED) {
    throw new Error(
      `${parsedConfig.options.projectName} has not been proposed but not yet
approved for execution on ${hre.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    // Get the `completeChugSplashBundle` transaction.
    const finalDeploymentTxnHash = await getFinalDeploymentTxnHash(
      ChugSplashManager,
      bundleId
    )
    return finalDeploymentTxnHash
  }

  // If we make it to this point, we know that the bundle is approved.

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
      throw new Error(
        `${projectName} ran out of funds. Please report this error.
Run the following command to add funds to your deployment so it can be completed:

npx hardhat chugsplash-fund --network ${hre.network.name} --amount ${estCost} <configPath>
        `
      )
    }

    // Get the current bundle state.
    bundleState = await ChugSplashManager.bundles(bundleId)

    // Wait for one second.
    await sleep(1000)
  }

  if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    // Get the `completeChugSplashBundle` transaction.
    const finalDeploymentTxnHash = await getFinalDeploymentTxnHash(
      ChugSplashManager,
      bundleId
    )
    return finalDeploymentTxnHash
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(`${projectName} was cancelled.`)
  }
}

/**
 * Performs actions on behalf of the project owner after the successful execution of a bundle.
 *
 * @param provider JSON RPC provider corresponding to the current project owner.
 * @param parsedConfig Parsed ParsedChugSplashConfig.
 * @param newProjectOwner Address to receive ownership of the project. If the specified address is
 * already the project owner, this parameter is unused.
 */
export const postExecutionActions = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  newProjectOwner: string
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

    // Transfer ownership of the ChugSplashManager to the new project owner if their address isn't
    // already the owner.
    if (newProjectOwner !== currProjectOwner) {
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
}
