import {
  ChugSplashRegistryArtifact,
  ChugSplashBootLoaderArtifact,
  ChugSplashManagerProxyArtifact,
  ChugSplashManagerArtifact,
  ProxyInitializerArtifact,
  DefaultAdapterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  OWNER_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  CHUGSPLASH_BOOTLOADER_ADDRESS,
  DEFAULT_UPDATER_ADDRESS,
  registryProxyConstructorArgValues,
  proxyInitializerConstructorArgValues,
  PROTOCOL_PAYMENT_PERCENTAGE,
  ChugSplashManagerABI,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CHUGSPLASH_SALT,
  CHUGSPLASH_RECORDER_ADDRESS,
  ChugSplashRegistryProxyArtifact,
  OZ_UUPS_UPDATER_ADDRESS,
} from '@chugsplash/contracts'
import { utils } from 'ethers'

export const EXECUTION_BUFFER_MULTIPLIER = 2
export type Integration = 'hardhat' | 'foundry'

export type Keyword = '{preserve}' | '{gap}'
type Keywords = {
  preserve: Keyword
  gap: Keyword
}

export const keywords: Keywords = {
  preserve: '{preserve}',
  gap: '{gap}',
}

// TODO: We should use fully qualified names instead of source names
const chugsplashRegistrySourceName = ChugSplashRegistryArtifact.sourceName
const chugsplashBootLoaderSourceName = ChugSplashBootLoaderArtifact.sourceName
const chugsplashManagerProxySourceName =
  ChugSplashManagerProxyArtifact.sourceName
const chugsplashManagerSourceName = ChugSplashManagerArtifact.sourceName
const chugsplashRegistyProxySourceName =
  ChugSplashRegistryProxyArtifact.sourceName
const proxyInitializerSourceName = ProxyInitializerArtifact.sourceName
const defaultAdapterSourceName = DefaultAdapterArtifact.sourceName
const OZUUPSOwnableAdapterSourceName = OZUUPSOwnableAdapterArtifact.sourceName
const OZUUPSAccessControlAdapterSourceName =
  OZUUPSAccessControlAdapterArtifact.sourceName
const defaultUpdaterSourceName = DefaultUpdaterArtifact.sourceName
const OZUUPSUpdaterSourceName = OZUUPSUpdaterArtifact.sourceName
const OZTransparentAdapterSourceName = OZTransparentAdapterArtifact.sourceName

// TODO: All of the ChugSplash contract constructor arguments should be in this format to make it
// easy to do meta-upgrades on them later.
export const chugsplashManagerConstructorArgs = {
  _registry: CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  _recorder: CHUGSPLASH_RECORDER_ADDRESS,
  _executionLockTime: EXECUTION_LOCK_TIME,
  _ownerBondAmount: OWNER_BOND_AMOUNT.toString(),
  _executorPaymentPercentage: EXECUTOR_PAYMENT_PERCENTAGE,
  _protocolPaymentPercentage: PROTOCOL_PAYMENT_PERCENTAGE,
}

export const CHUGSPLASH_CONSTRUCTOR_ARGS = {}
CHUGSPLASH_CONSTRUCTOR_ARGS[chugsplashRegistrySourceName] = [
  OWNER_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
]
CHUGSPLASH_CONSTRUCTOR_ARGS[chugsplashBootLoaderSourceName] = []
CHUGSPLASH_CONSTRUCTOR_ARGS[chugsplashManagerProxySourceName] = [
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  CHUGSPLASH_BOOTLOADER_ADDRESS,
]
CHUGSPLASH_CONSTRUCTOR_ARGS[chugsplashManagerSourceName] = Object.values(
  chugsplashManagerConstructorArgs
)
CHUGSPLASH_CONSTRUCTOR_ARGS[defaultAdapterSourceName] = [
  DEFAULT_UPDATER_ADDRESS,
]
CHUGSPLASH_CONSTRUCTOR_ARGS[OZUUPSOwnableAdapterSourceName] = [
  OZ_UUPS_UPDATER_ADDRESS,
]
CHUGSPLASH_CONSTRUCTOR_ARGS[OZUUPSAccessControlAdapterSourceName] = [
  OZ_UUPS_UPDATER_ADDRESS,
]
CHUGSPLASH_CONSTRUCTOR_ARGS[OZTransparentAdapterSourceName] = [
  DEFAULT_UPDATER_ADDRESS,
]
CHUGSPLASH_CONSTRUCTOR_ARGS[defaultUpdaterSourceName] = []
CHUGSPLASH_CONSTRUCTOR_ARGS[OZUUPSUpdaterSourceName] = []
CHUGSPLASH_CONSTRUCTOR_ARGS[chugsplashRegistyProxySourceName] =
  registryProxyConstructorArgValues
CHUGSPLASH_CONSTRUCTOR_ARGS[proxyInitializerSourceName] =
  proxyInitializerConstructorArgValues

const [chugsplashManagerConstructorFragment] = ChugSplashManagerABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const chugsplashManagerConstructorArgTypes =
  chugsplashManagerConstructorFragment.inputs.map((input) => input.type)
export const CURRENT_CHUGSPLASH_MANAGER_VERSION_ADDRESS =
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    CHUGSPLASH_SALT,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashManagerArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          chugsplashManagerConstructorArgTypes,
          Object.values(chugsplashManagerConstructorArgs)
        ),
      ]
    )
  )
