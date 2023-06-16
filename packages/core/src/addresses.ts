import {
  ChugSplashRegistryABI,
  getOwnerAddress,
  ManagedServiceArtifact,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  DEFAULT_UPDATER_ADDRESS,
  PROTOCOL_PAYMENT_PERCENTAGE,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  OZ_UUPS_UPDATER_ADDRESS,
  ChugSplashManagerABI,
  DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
  DEFAULT_CREATE3_ADDRESS,
  OWNER_BOND_AMOUNT,
  ChugSplashRegistryArtifact,
  ChugSplashManagerArtifact,
  DefaultAdapterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  DefaultCreate3Artifact,
  DefaultGasPriceCalculatorArtifact,
  FORWARDER_ADDRESS,
  ChugSplashManagerProxyArtifact,
  ProxyArtifact,
} from '@chugsplash/contracts'
import { constants, utils } from 'ethers'

import { CURRENT_CHUGSPLASH_MANAGER_VERSION } from './constants'

const chugsplashRegistrySourceName = ChugSplashRegistryArtifact.sourceName
const chugsplashManagerSourceName = ChugSplashManagerArtifact.sourceName
const defaultAdapterSourceName = DefaultAdapterArtifact.sourceName
const OZUUPSOwnableAdapterSourceName = OZUUPSOwnableAdapterArtifact.sourceName
const OZUUPSAccessControlAdapterSourceName =
  OZUUPSAccessControlAdapterArtifact.sourceName
const defaultUpdaterSourceName = DefaultUpdaterArtifact.sourceName
const OZUUPSUpdaterSourceName = OZUUPSUpdaterArtifact.sourceName
const OZTransparentAdapterSourceName = OZTransparentAdapterArtifact.sourceName
const DefaultCreate3SourceName = DefaultCreate3Artifact.sourceName
const DefaultGasPriceCalculatorSourceName =
  DefaultGasPriceCalculatorArtifact.sourceName
const ManagedServiceSourceName = ManagedServiceArtifact.sourceName
const chugsplashManagerProxySourceName =
  ChugSplashManagerProxyArtifact.sourceName
const proxyArtifactSourceName = ProxyArtifact.sourceName

export const getRegistryConstructorValues = () => [getOwnerAddress()]

const [registryConstructorFragment] = ChugSplashRegistryABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const registryConstructorArgTypes = registryConstructorFragment.inputs.map(
  (input) => input.type
)

export const getChugSplashRegistryAddress = () =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashRegistryArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          registryConstructorArgTypes,
          getRegistryConstructorValues()
        ),
      ]
    )
  )

export const getManagedServiceAddress = () =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ManagedServiceArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [getOwnerAddress()]),
      ]
    )
  )

export const getReferenceChugSplashManagerProxyAddress = () =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashManagerProxyArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [getChugSplashRegistryAddress(), getChugSplashRegistryAddress()]
        ),
      ]
    )
  )

export const getReferenceDefaultProxyAddress = () =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ProxyArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address'],
          [getChugSplashRegistryAddress()]
        ),
      ]
    )
  )

export const getManagerConstructorValues = () => [
  getChugSplashRegistryAddress(),
  DEFAULT_CREATE3_ADDRESS,
  DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
  getManagedServiceAddress(),
  EXECUTION_LOCK_TIME,
  OWNER_BOND_AMOUNT.toString(),
  EXECUTOR_PAYMENT_PERCENTAGE,
  PROTOCOL_PAYMENT_PERCENTAGE,
  Object.values(CURRENT_CHUGSPLASH_MANAGER_VERSION),
  FORWARDER_ADDRESS,
]

const [managerConstructorFragment] = ChugSplashManagerABI.filter(
  (fragment) => fragment.type === 'constructor'
)

export const getChugSplashManagerV1Address = () =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashManagerArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          managerConstructorFragment.inputs,
          getManagerConstructorValues()
        ),
      ]
    )
  )

export const getChugSplashConstructorArgs = () => {
  return {
    [chugsplashRegistrySourceName]: [getOwnerAddress()],
    [chugsplashManagerSourceName]: getManagerConstructorValues(),
    [defaultAdapterSourceName]: [DEFAULT_UPDATER_ADDRESS],
    [OZUUPSOwnableAdapterSourceName]: [OZ_UUPS_UPDATER_ADDRESS],
    [OZUUPSAccessControlAdapterSourceName]: [OZ_UUPS_UPDATER_ADDRESS],
    [OZTransparentAdapterSourceName]: [DEFAULT_UPDATER_ADDRESS],
    [defaultUpdaterSourceName]: [],
    [OZUUPSUpdaterSourceName]: [],
    [DefaultCreate3SourceName]: [],
    [DefaultGasPriceCalculatorSourceName]: [],
    [ManagedServiceSourceName]: [getOwnerAddress()],
    [chugsplashManagerProxySourceName]: [
      getChugSplashRegistryAddress(),
      getChugSplashRegistryAddress(),
    ],
    [proxyArtifactSourceName]: [getChugSplashRegistryAddress()],
  }
}
