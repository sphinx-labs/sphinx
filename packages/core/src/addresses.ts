import {
  ChugSplashRegistryABI,
  getOwnerAddress,
  ManagedServiceArtifact,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  PROTOCOL_PAYMENT_PERCENTAGE,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ChugSplashManagerABI,
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
  ChugSplashManagerProxyArtifact,
  ProxyArtifact,
  AdapterDeployerArtifact,
  ChugSplashBootloaderArtifact,
  ForwarderArtifact,
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

const [registryConstructorFragment] = ChugSplashRegistryABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const registryConstructorArgTypes = registryConstructorFragment.inputs.map(
  (input) => input.type
)

export const ADAPTER_DEPLOYER_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(['bytes'], [AdapterDeployerArtifact.bytecode])
)

export const getBootloaderAddress = () =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashBootloaderArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [getOwnerAddress(), ADAPTER_DEPLOYER_ADDRESS]
        ),
      ]
    )
  )

export const getRegistryConstructorValues = () => [getBootloaderAddress()]

export const getChugSplashRegistryAddress = () =>
  utils.getCreate2Address(
    getBootloaderAddress(),
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
    getBootloaderAddress(),
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

export const getDefaultCreate3Address = () =>
  utils.getCreate2Address(
    getBootloaderAddress(),
    constants.HashZero,
    utils.solidityKeccak256(['bytes'], [DefaultCreate3Artifact.bytecode])
  )

export const getDefaultGasPriceCalculatorAddress = () =>
  utils.getCreate2Address(
    getBootloaderAddress(),
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes'],
      [DefaultGasPriceCalculatorArtifact.bytecode]
    )
  )

export const getDefaultUpdaterAddress = () =>
  utils.getCreate2Address(
    ADAPTER_DEPLOYER_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(['bytes'], [DefaultUpdaterArtifact.bytecode])
  )

export const getDefaultAdapterAddress = () =>
  utils.getCreate2Address(
    ADAPTER_DEPLOYER_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        DefaultAdapterArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [getDefaultUpdaterAddress()]),
      ]
    )
  )

export const getOZUUPSUpdaterAddress = () =>
  utils.getCreate2Address(
    ADAPTER_DEPLOYER_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(['bytes'], [OZUUPSUpdaterArtifact.bytecode])
  )

export const getOZUUPSOwnableAdapterAddress = () =>
  utils.getCreate2Address(
    ADAPTER_DEPLOYER_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        OZUUPSOwnableAdapterArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [getOZUUPSUpdaterAddress()]),
      ]
    )
  )

export const getOZUUPSAccessControlAdapterAddress = () =>
  utils.getCreate2Address(
    ADAPTER_DEPLOYER_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        OZUUPSAccessControlAdapterArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [getOZUUPSUpdaterAddress()]),
      ]
    )
  )

export const getOZTransparentAdapterAddress = () =>
  utils.getCreate2Address(
    ADAPTER_DEPLOYER_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        OZTransparentAdapterArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [getDefaultUpdaterAddress()]),
      ]
    )
  )

export const getForwarderAddress = () =>
  utils.getCreate2Address(
    getBootloaderAddress(),
    constants.HashZero,
    utils.solidityKeccak256(['bytes'], [ForwarderArtifact.bytecode])
  )

export const getChugSplashConstructorArgs = () => {
  return {
    [chugsplashRegistrySourceName]: [getOwnerAddress()],
    [chugsplashManagerSourceName]: getManagerConstructorValues(),
    [defaultAdapterSourceName]: [getDefaultUpdaterAddress()],
    [OZUUPSOwnableAdapterSourceName]: [getOZUUPSUpdaterAddress()],
    [OZUUPSAccessControlAdapterSourceName]: [getOZUUPSUpdaterAddress()],
    [OZTransparentAdapterSourceName]: [getDefaultUpdaterAddress()],
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

export const getManagerConstructorValues = () => [
  getChugSplashRegistryAddress(),
  getDefaultCreate3Address(),
  getDefaultGasPriceCalculatorAddress(),
  getManagedServiceAddress(),
  EXECUTION_LOCK_TIME,
  OWNER_BOND_AMOUNT.toString(),
  EXECUTOR_PAYMENT_PERCENTAGE,
  PROTOCOL_PAYMENT_PERCENTAGE,
  Object.values(CURRENT_CHUGSPLASH_MANAGER_VERSION),
  getForwarderAddress(),
]

const [managerConstructorFragment] = ChugSplashManagerABI.filter(
  (fragment) => fragment.type === 'constructor'
)

export const getChugSplashManagerV1Address = () =>
  utils.getCreate2Address(
    getBootloaderAddress(),
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
