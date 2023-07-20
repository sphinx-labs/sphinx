import { ConfigCache } from '@sphinx/core/dist/config/types'
import { defaultAbiCoder } from 'ethers/lib/utils'

export const decodeCachedConfig = (
  encodedConfigCache: string,
  SphinxUtilsABI: any
): ConfigCache => {
  const configCacheType = SphinxUtilsABI.find(
    (fragment) => fragment.name === 'configCache'
  ).outputs[0]

  const configCache = defaultAbiCoder.decode(
    [configCacheType],
    encodedConfigCache
  )[0]

  const structuredConfigCache: ConfigCache = {
    blockGasLimit: configCache.blockGasLimit,
    localNetwork: configCache.localNetwork,
    networkName: configCache.networkName,
    isRegistered: configCache.isRegistered,
    contractConfigCache: {},
  }

  for (const cachedContract of configCache.contractConfigCache) {
    structuredConfigCache.contractConfigCache[cachedContract.referenceName] = {
      isTargetDeployed: cachedContract.isTargetDeployed,
      deploymentRevert: {
        deploymentReverted: cachedContract.deploymentRevert.deploymentReverted,
        revertString: cachedContract.deploymentRevert.revertString.exists
          ? cachedContract.deploymentRevert.revertString.value
          : undefined,
      },
      importCache: {
        requiresImport: cachedContract.importCache.requiresImport,
        currProxyAdmin: cachedContract.importCache.currProxyAdmin.exists
          ? cachedContract.importCache.currProxyAdmin.value
          : undefined,
      },
      deployedCreationCodeWithArgsHash: cachedContract
        .deployedCreationCodeWithArgsHash.exists
        ? cachedContract.deployedCreationCodeWithArgsHash.value
        : undefined,
      previousConfigUri: cachedContract.previousConfigUri.exists
        ? cachedContract.previousConfigUri.value
        : undefined,
    }
  }

  return structuredConfigCache
}
