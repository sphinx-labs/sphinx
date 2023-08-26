import { MinimalConfigCache } from '@sphinx-labs/core/dist/config/types'
import { AbiCoder } from 'ethers'

export const decodeCachedConfig = (
  encodedConfigCache: string,
  SphinxUtilsABI: any
): MinimalConfigCache => {
  const configCacheType = SphinxUtilsABI.find(
    (fragment) => fragment.name === 'configCache'
  ).outputs[0]

  const coder = AbiCoder.defaultAbiCoder()
  const configCache = coder.decode([configCacheType], encodedConfigCache)[0]

  const structuredConfigCache: MinimalConfigCache = {
    blockGasLimit: configCache.blockGasLimit,
    chainId: parseInt(configCache.chainId, 10),
    isManagerDeployed: configCache.isManagerDeployed,
    contractConfigCache: {},
    callHashes: {}, // TODO
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
      previousConfigUri: cachedContract.previousConfigUri.exists
        ? cachedContract.previousConfigUri.value
        : undefined,
    }
  }

  return structuredConfigCache
}
