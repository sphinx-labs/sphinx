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
  ForwarderArtifact,
  LZEndpointMockArtifact,
  FunderArtifact,
  LZReceiverArtifact,
} from '@chugsplash/contracts'
import { constants, utils } from 'ethers'

import { CURRENT_CHUGSPLASH_MANAGER_VERSION } from './constants'

const [registryConstructorFragment] = ChugSplashRegistryABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const registryConstructorArgTypes = registryConstructorFragment.inputs.map(
  (input) => input.type
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

export const MANAGED_SERVICE_ADDRESS = utils.getCreate2Address(
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

export const REFERENCE_CHUGSPLASH_MANAGER_PROXY_ADDRESS =
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

export const REFERENCE_PROXY_ADDRESS = utils.getCreate2Address(
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

export const getMockEndPointAddress = (chainId: number) =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'uint16'],
      [LZEndpointMockArtifact.bytecode, chainId]
    )
  )

export const getFunderAddress = (endpointAddress: string) => {
  return utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'address'],
      [
        FunderArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [endpointAddress]),
      ]
    )
  )
}

export const getLZReceiverAddress = (endpointAddress: string) => {
  return utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'address'],
      [
        LZReceiverArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [endpointAddress]),
      ]
    )
  )
}

export const getManagerConstructorValues = () => [
  getChugSplashRegistryAddress(),
  DEFAULT_CREATE3_ADDRESS,
  DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
  MANAGED_SERVICE_ADDRESS,
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
    getManagerProxyInitCodeHash()
  )
}

export const getManagerProxyInitCodeHash = (): string => {
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
