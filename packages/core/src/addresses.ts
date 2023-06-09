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
  ChugSplashBootloaderOneArtifact,
  ChugSplashBootloaderTwoArtifact,
  ForwarderArtifact,
  ChugSplashBootloaderTwoABI,
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
  utils.solidityKeccak256(['bytes'], [ChugSplashBootloaderOneArtifact.bytecode])
)

export const getRegistryConstructorValues = () => [getOwnerAddress()]

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

export const DEFAULT_CREATE3_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(['bytes'], [DefaultCreate3Artifact.bytecode])
)

export const DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes'],
    [DefaultGasPriceCalculatorArtifact.bytecode]
  )
)

export const DEFAULT_UPDATER_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(['bytes'], [DefaultUpdaterArtifact.bytecode])
)

export const DEFAULT_ADAPTER_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      DefaultAdapterArtifact.bytecode,
      utils.defaultAbiCoder.encode(['address'], [DEFAULT_UPDATER_ADDRESS]),
    ]
  )
)

export const OZ_UUPS_UPDATER_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(['bytes'], [OZUUPSUpdaterArtifact.bytecode])
)

export const OZ_UUPS_OWNABLE_ADAPTER_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      OZUUPSOwnableAdapterArtifact.bytecode,
      utils.defaultAbiCoder.encode(['address'], [OZ_UUPS_UPDATER_ADDRESS]),
    ]
  )
)

export const OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      OZUUPSAccessControlAdapterArtifact.bytecode,
      utils.defaultAbiCoder.encode(['address'], [OZ_UUPS_UPDATER_ADDRESS]),
    ]
  )
)

export const OZ_TRANSPARENT_ADAPTER_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      OZTransparentAdapterArtifact.bytecode,
      utils.defaultAbiCoder.encode(['address'], [DEFAULT_UPDATER_ADDRESS]),
    ]
  )
)

export const FORWARDER_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(['bytes'], [ForwarderArtifact.bytecode])
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

export const getBootloaderTwoConstructorArgs = () => [
  getOwnerAddress(),
  EXECUTION_LOCK_TIME,
  OWNER_BOND_AMOUNT.toString(),
  EXECUTOR_PAYMENT_PERCENTAGE,
  PROTOCOL_PAYMENT_PERCENTAGE,
  Object.values(CURRENT_CHUGSPLASH_MANAGER_VERSION),
]

export const [bootloaderTwoConstructorFragment] =
  ChugSplashBootloaderTwoABI.filter(
    (fragment) => fragment.type === 'constructor'
  )

export const getBootloaderAddress = () =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashBootloaderTwoArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          bootloaderTwoConstructorFragment.inputs,
          getBootloaderTwoConstructorArgs()
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

export const getChugSplashManagerAddress = (organizationID: string) => {
  return utils.getCreate2Address(
    getChugSplashRegistryAddress(),
    organizationID,
    getManagerProxyBytecodeHash()
  )
}

export const getManagerProxyBytecodeHash = (): string => {
  return utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ChugSplashManagerProxyArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        ['address', 'address'],
        [getChugSplashRegistryAddress(), getChugSplashRegistryAddress()]
      ),
    ]
  )
}
