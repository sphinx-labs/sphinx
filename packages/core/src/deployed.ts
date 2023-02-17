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
  readBuildInfo,
  readCanonicalConfig,
} from './utils'
import 'core-js/features/array/at'

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

// TODO: When you add support for artifacts from sources other than OZ upgrades (e.g. hardhat,
// hardhat-deploy), remember to call `addEnumMembersToStorageLayout`. This isn't necessary for OZ
// artifacts.
export const getLatestDeployedStorageLayout = async (
  provider: providers.Provider,
  referenceName: string,
  proxyAddress: string,
  userConfig: UserChugSplashConfig,
  artifactPaths: ArtifactPaths,
  remoteExecution: boolean,
  canonicalConfigFolderPath: string
): Promise<SolidityStorageLayout> => {
  const { deployedFullyQualifiedName, deployedStorageLayout } =
    userConfig.contracts[referenceName]
  if (
    deployedFullyQualifiedName !== undefined &&
    deployedStorageLayout !== undefined
  ) {
    const buildInfo = readBuildInfo(artifactPaths, deployedFullyQualifiedName)
  }

  const deployedCanonicalConfig = await getLatestDeployedCanonicalConfig(
    provider,
    proxyAddress,
    remoteExecution,
    canonicalConfigFolderPath
  )

  if (deployedCanonicalConfig !== undefined) {
    const deployedCanonicalConfigArtifacts = await getCanonicalConfigArtifacts(
      deployedCanonicalConfig
    )
    return deployedCanonicalConfigArtifacts[referenceName].storageLayout
  } else {
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
    } else {
      throw new Error(
        `Could not find the most recent storage layout to use for the storage slot checker.
If you are confident that there are no storage slot conflicts, call this task again with the flag: --skip-storage-check
Otherwise, please report this error.`
      )
    }
  }
}
