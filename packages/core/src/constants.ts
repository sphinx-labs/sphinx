import {
  ChugSplashRegistryArtifact,
  ChugSplashManagerArtifact,
  DefaultAdapterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  OWNER_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  DEFAULT_UPDATER_ADDRESS,
  PROTOCOL_PAYMENT_PERCENTAGE,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  OZ_UUPS_UPDATER_ADDRESS,
  OWNER_MULTISIG_ADDRESS,
  ChugSplashRegistryABI,
} from '@chugsplash/contracts'
import { utils, constants } from 'ethers'
import { CustomChain } from '@nomiclabs/hardhat-etherscan/dist/src/types'

// Etherscan constants
export const customChains: CustomChain[] = []

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

const chugsplashRegistrySourceName = ChugSplashRegistryArtifact.sourceName
const chugsplashManagerSourceName = ChugSplashManagerArtifact.sourceName
const defaultAdapterSourceName = DefaultAdapterArtifact.sourceName
const OZUUPSOwnableAdapterSourceName = OZUUPSOwnableAdapterArtifact.sourceName
const OZUUPSAccessControlAdapterSourceName =
  OZUUPSAccessControlAdapterArtifact.sourceName
const defaultUpdaterSourceName = DefaultUpdaterArtifact.sourceName
const OZUUPSUpdaterSourceName = OZUUPSUpdaterArtifact.sourceName
const OZTransparentAdapterSourceName = OZTransparentAdapterArtifact.sourceName

export const registryConstructorValues = [
  OWNER_MULTISIG_ADDRESS,
  OWNER_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  PROTOCOL_PAYMENT_PERCENTAGE,
]

const [registryConstructorFragment] = ChugSplashRegistryABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const registryConstructorArgTypes = registryConstructorFragment.inputs.map(
  (input) => input.type
)

export const CHUGSPLASH_REGISTRY_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ChugSplashRegistryArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        registryConstructorArgTypes,
        registryConstructorValues
      ),
    ]
  )
)

export const chugsplashManagerConstructorArgs = {
  _registry: CHUGSPLASH_REGISTRY_ADDRESS,
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
