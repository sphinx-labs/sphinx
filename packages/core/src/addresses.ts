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
  LZEndpointMockArtifact,
  LZSenderArtifact,
  LZReceiverArtifact,
  AuthFactoryArtifact,
  AuthProxyArtifact,
  AuthArtifact,
} from '@chugsplash/contracts'
import { constants, utils } from 'ethers'

import {
  CURRENT_CHUGSPLASH_MANAGER_VERSION,
  SUPPORTED_NETWORKS,
} from './constants'
import { LAYERZERO_ADDRESSES } from './networks'

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

export const getMockEndPointAddress = (chainId: number) =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        LZEndpointMockArtifact.bytecode,
        utils.defaultAbiCoder.encode(['uint16'], [chainId]),
      ]
    )
  )

export const getDestinationChains = (localLZEndpoint: boolean) => {
  // Get the set of destination chains based off the supported networks
  const destinationChains = Object.values(SUPPORTED_NETWORKS).map((id) => {
    const lzDestChainAddressInfo = LAYERZERO_ADDRESSES[id]

    return [
      lzDestChainAddressInfo.lzChainId,
      // Calculate the receiver address using either the mock or real endpoint depending on the situation
      getLZReceiverAddress(
        localLZEndpoint
          ? getMockEndPointAddress(lzDestChainAddressInfo.lzChainId)
          : lzDestChainAddressInfo.endpointAddress
      ),
    ] as [number, string]
  })

  return destinationChains
}

export const getLZSenderAddress = (
  localLZEndpoint: boolean,
  lzEndpointAddress: string
) =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        LZSenderArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'tuple(uint16,address)[]', 'address'],
          [
            lzEndpointAddress,
            getDestinationChains(localLZEndpoint),
            getOwnerAddress(),
          ]
        ),
      ]
    )
  )

export const getLZReceiverAddress = (endpointAddress: string) => {
  return utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        LZReceiverArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [endpointAddress, getOwnerAddress()]
        ),
      ]
    )
  )
}

export const AUTH_FACTORY_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      AuthFactoryArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        ['address', 'address'],
        [getChugSplashRegistryAddress(), getOwnerAddress()]
      ),
    ]
  )
)

export const AUTH_IMPL_V1_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      AuthArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        ['uint256', 'uint256', 'uint256'],
        [1, 0, 0]
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

export const getChugSplashManagerAddress = (owner: string) => {
  // We set the saltNonce to 0 since we can safely assume that each owner
  // will only have one manager contract for now.
  const salt = utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'bytes'],
      [owner, 0, []]
    )
  )

  return utils.getCreate2Address(
    getChugSplashRegistryAddress(),
    salt,
    getManagerProxyInitCodeHash()
  )
}

export const getAuthData = (
  orgOwners: Array<string>,
  orgThreshold: number
): string => {
  return utils.defaultAbiCoder.encode(
    ['address[]', 'uint256'],
    [orgOwners, orgThreshold]
  )
}

export const getAuthSalt = (authData: string): string => {
  // We set the saltNonce to 0 since we can safely assume that each owner
  // will only have one manager contract for now.
  return utils.keccak256(
    utils.defaultAbiCoder.encode(['bytes', 'uint256'], [authData, 0])
  )
}

export const getAuthAddress = (
  orgOwners: Array<string>,
  orgThreshold: number
): string => {
  const authData = getAuthData(orgOwners, orgThreshold)
  const salt = getAuthSalt(authData)

  return utils.getCreate2Address(
    AUTH_FACTORY_ADDRESS,
    salt,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        AuthProxyArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [AUTH_FACTORY_ADDRESS, AUTH_FACTORY_ADDRESS]
        ),
      ]
    )
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
