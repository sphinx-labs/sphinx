import { ethers } from 'ethers'
import { deployChugSplashContracts } from '@chugsplash/plugins'
import {
  CHUGSPLASH_CONSTRUCTOR_ARGS,
  ChugSplashBootLoaderArtifact,
  ProxyUpdaterArtifact,
  ProxyArtifact,
  ChugSplashManagerProxyArtifact,
  ChugSplashManagerArtifact,
  ChugSplashRegistryArtifact,
  DefaultAdapterArtifact,
  CHUGSPLASH_BOOTLOADER_ADDRESS,
  PROXY_UPDATER_ADDRESS,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
  CHUGSPLASH_MANAGER_ADDRESS,
  CHUGSPLASH_REGISTRY_ADDRESS,
  DEFAULT_ADAPTER_ADDRESS,
  buildInfo,
} from '@chugsplash/contracts'

import {
  linkProxyWithImplementation,
  attemptVerification,
  getEtherscanInfo,
} from './etherscan'

export const initializeChugSplashContracts = async (
  hre: any,
  deployer: ethers.Signer
) => {
  await deployChugSplashContracts(hre, deployer)

  const { etherscanApiKey, etherscanApiEndpoints } = await getEtherscanInfo(hre)

  const contracts = [
    {
      artifact: ChugSplashManagerArtifact,
      address: CHUGSPLASH_MANAGER_ADDRESS,
    },
    {
      artifact: ChugSplashBootLoaderArtifact,
      address: CHUGSPLASH_BOOTLOADER_ADDRESS,
    },
    { artifact: ProxyUpdaterArtifact, address: PROXY_UPDATER_ADDRESS },
    { artifact: ProxyArtifact, address: CHUGSPLASH_REGISTRY_PROXY_ADDRESS },
    {
      artifact: ChugSplashManagerProxyArtifact,
      address: ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
    },
    {
      artifact: ChugSplashRegistryArtifact,
      address: CHUGSPLASH_REGISTRY_ADDRESS,
    },
    { artifact: DefaultAdapterArtifact, address: DEFAULT_ADAPTER_ADDRESS },
  ]

  for (const { artifact, address } of contracts) {
    const { sourceName, contractName, abi } = artifact

    await attemptVerification(
      hre.ethers.provider,
      hre.network.name,
      etherscanApiEndpoints,
      address,
      sourceName,
      contractName,
      abi,
      etherscanApiKey,
      buildInfo.input,
      buildInfo.solcVersion,
      CHUGSPLASH_CONSTRUCTOR_ARGS[sourceName]
    )
  }

  // Link the ChugSplashRegistry's implementation with its proxy
  await linkProxyWithImplementation(
    etherscanApiEndpoints,
    etherscanApiKey,
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    CHUGSPLASH_REGISTRY_ADDRESS,
    'ChugSplashRegistry'
  )

  // Link the root ChugSplashManager's implementation with its proxy
  await linkProxyWithImplementation(
    etherscanApiEndpoints,
    etherscanApiKey,
    ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
    CHUGSPLASH_MANAGER_ADDRESS,
    'ChugSplashManager'
  )
}
