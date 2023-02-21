import { ChugSplashManagerABI } from '@chugsplash/contracts'
import { getChainId } from '@eth-optimism/core-utils'
import { Manifest } from '@openzeppelin/upgrades-core'
import { Contract, providers } from 'ethers'

import { chugsplashFetchSubtask } from './config/fetch'
import { CanonicalChugSplashConfig, UserChugSplashConfig } from './config/types'
import {
  ArtifactPaths,
  getCanonicalConfigArtifacts,
  SolidityStorageLayout,
} from './languages'
import {
  getChugSplashRegistry,
  getEIP1967ProxyImplementationAddress,
  readCanonicalConfig,
} from './utils'
import 'core-js/features/array/at'
import { readStorageLayout } from './actions/artifacts'

export const getLatestDeployedCanonicalConfig = async (
  provider: providers.Provider,
  proxyAddress: string,
  remoteExecution: boolean,
  canonicalConfigFolderPath: string
): Promise<CanonicalChugSplashConfig | undefined> => {
  const ChugSplashRegistry = getChugSplashRegistry(provider)

  const actionExecutedEvents = await ChugSplashRegistry.queryFilter(
    ChugSplashRegistry.filters.EventAnnouncedWithData(
      'ChugSplashActionExecuted',
      null,
      proxyAddress
    )
  )

  if (actionExecutedEvents.length === 0) {
    return undefined
  }

  const latestRegistryEvent = actionExecutedEvents.at(-1)

  if (latestRegistryEvent === undefined) {
    return undefined
  } else if (latestRegistryEvent.args === undefined) {
    throw new Error(`ChugSplashActionExecuted event has no args.`)
  }

  const ChugSplashManager = new Contract(
    latestRegistryEvent.args.manager,
    ChugSplashManagerABI,
    provider
  )

  const latestExecutionEvent = (
    await ChugSplashManager.queryFilter(
      ChugSplashManager.filters.ChugSplashActionExecuted(null, proxyAddress)
    )
  ).at(-1)

  if (latestExecutionEvent === undefined) {
    throw new Error(
      `ChugSplashActionExecuted event detected in registry but not in manager contract`
    )
  } else if (latestExecutionEvent.args === undefined) {
    throw new Error(`ChugSplashActionExecuted event has no args.`)
  }

  const latestProposalEvent = (
    await ChugSplashManager.queryFilter(
      ChugSplashManager.filters.ChugSplashBundleProposed(
        latestExecutionEvent.args.bundleId
      )
    )
  ).at(-1)

  if (latestProposalEvent === undefined) {
    throw new Error(
      `ChugSplashManager emitted a ChugSplashActionExecuted event but not a ChugSplashBundleProposed event`
    )
  } else if (latestProposalEvent.args === undefined) {
    throw new Error(`ChugSplashBundleProposed event does not have args`)
  }

  if (remoteExecution) {
    return chugsplashFetchSubtask({
      configUri: latestProposalEvent.args.configUri,
    })
  } else {
    return readCanonicalConfig(
      canonicalConfigFolderPath,
      latestProposalEvent.args.configUri
    )
  }
}

/**
 * Get the most recent storage layout for a given reference name. The order of priority (from
 * highest to lowest) is:
 * 1. The storage layout at the path specified by the user via 'previousBuildInfo'
 * 2. The latest deployment in the ChugSplash system for the corresponding proxy
 * 3. OpenZeppelin's Network File (if the proxy is an OpenZeppelin proxy type)
 *
 * If we detect a 'previousBuildInfo' path as well as a previous deployment using ChugSplash, we log
 * a warning to the user and use the storage layout at 'previousBuildInfo'.
 */
export const getLatestDeployedStorageLayout = async (
  provider: providers.Provider,
  referenceName: string,
  proxyAddress: string,
  userConfig: UserChugSplashConfig,
  artifactPaths: ArtifactPaths,
  remoteExecution: boolean,
  canonicalConfigFolderPath: string
): Promise<SolidityStorageLayout> => {
  const deployedCanonicalConfig = await getLatestDeployedCanonicalConfig(
    provider,
    proxyAddress,
    remoteExecution,
    canonicalConfigFolderPath
  )

  const userContractConfig = userConfig.contracts[referenceName]
  if (
    userContractConfig.previousFullyQualifiedName !== undefined &&
    userContractConfig.previousBuildInfo !== undefined
  ) {
    const storageLayout = readStorageLayout(
      userContractConfig.previousBuildInfo,
      userContractConfig.previousFullyQualifiedName
    )

    if (deployedCanonicalConfig !== undefined) {
      console.warn(
        '\x1b[33m%s\x1b[0m', // Display message in yellow
        `\nUsing the "previousBuildInfo" and "previousFullyQualifiedName" field to get the storage layout for\n` +
          `the contract: ${referenceName}. If you'd like to use the storage layout from your most recent\n` +
          `ChugSplash deployment instead, please remove these two fields from your ChugSplash file.`
      )
    }

    return storageLayout
  }

  if (deployedCanonicalConfig !== undefined) {
    const deployedCanonicalConfigArtifacts = await getCanonicalConfigArtifacts(
      deployedCanonicalConfig
    )
    return deployedCanonicalConfigArtifacts[referenceName].storageLayout
  } else if (
    userContractConfig.externalProxyType === 'oz-transparent' ||
    userContractConfig.externalProxyType === 'oz-uups'
  ) {
    const manifest = new Manifest(await getChainId(provider))
    const currImplAddress = await getEIP1967ProxyImplementationAddress(
      provider,
      proxyAddress
    )

    const data = await manifest.read()
    const versionWithoutMetadata = Object.keys(data.impls).find(
      (v) => data.impls[v]?.address === currImplAddress
    )
    if (versionWithoutMetadata !== undefined) {
      const implDeployment = data.impls[versionWithoutMetadata]
      if (implDeployment === undefined) {
        throw new Error(
          'Could not retrieve deployment info from OpenZeppelin Upgrades artifact'
        )
      }
      return implDeployment.layout as unknown as SolidityStorageLayout
    }
  }

  throw new Error(
    `Could not find the previous storage layout for the contract: ${referenceName}. Please include\n` +
      `a "previousBuildInfo" and "previousFullyQualifiedName" field for this contract in your ChugSplash file.`
  )
}
