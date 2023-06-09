import { defaultAbiCoder } from 'ethers/lib/utils'

export const decodeCachedConfig = (
  encodedConfigCache: string,
  artifactFolder: string
) => {
  const ChugSplashUtilsABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(`${artifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`).abi
  const configCacheType = ChugSplashUtilsABI.find(
    (fragment) => fragment.name === 'configCache'
  ).outputs[0]

  const configCache = defaultAbiCoder.decode(
    [configCacheType],
    encodedConfigCache
  )[0]

  const structuredConfigCache = {
    blockGasLimit: configCache.blockGasLimit,
    localNetwork: configCache.localNetwork,
    networkName: configCache.networkName,
    contractConfigCache: {},
  }

  for (const cachedContract of configCache.contractConfigCache) {
    structuredConfigCache.contractConfigCache[cachedContract.referenceName] = {
      referenceName: cachedContract.referenceName,
      isTargetDeployed: cachedContract.isTargetDeployed,
      deploymentRevert: {
        deploymentReverted: cachedContract.deploymentRevert.deploymentReverted,
        deploymentRevertReason: cachedContract.deploymentRevert.revertString
          .exists
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
