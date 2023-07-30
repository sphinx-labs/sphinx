import {
  SphinxRegistryABI,
  getOwnerAddress,
  ManagedServiceArtifact,
  EXECUTION_LOCK_TIME,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  SphinxManagerABI,
  SphinxRegistryArtifact,
  SphinxManagerArtifact,
  DefaultAdapterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  DefaultCreate3Artifact,
  SphinxManagerProxyArtifact,
  ProxyArtifact,
  AuthFactoryArtifact,
  AuthProxyArtifact,
  AuthArtifact,
  BalanceArtifact,
  BalanceFactoryArtifact,
  EscrowArtifact,
} from '@sphinx-labs/contracts'
import { constants, utils } from 'ethers'

import { CURRENT_SPHINX_MANAGER_VERSION, REFERENCE_ORG_ID } from './constants'
import { USDC_ADDRESSES } from './networks'

const [registryConstructorFragment] = SphinxRegistryABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const registryConstructorArgTypes = registryConstructorFragment.inputs.map(
  (input) => input.type
)

export const getRegistryConstructorValues = () => [getOwnerAddress()]

export const getSphinxRegistryAddress = () =>
  utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        SphinxRegistryArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          registryConstructorArgTypes,
          getRegistryConstructorValues()
        ),
      ]
    )
  )

export const getManagedServiceAddress = (chainId: number) => {
  const usdcAddress =
    chainId === 10 || chainId === 420
      ? USDC_ADDRESSES[chainId]
      : constants.AddressZero
  return utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ManagedServiceArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [getOwnerAddress(), usdcAddress]
        ),
      ]
    )
  )
}

export const REFERENCE_SPHINX_MANAGER_PROXY_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      SphinxManagerProxyArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        ['address', 'address'],
        [getSphinxRegistryAddress(), getSphinxRegistryAddress()]
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
      utils.defaultAbiCoder.encode(['address'], [getSphinxRegistryAddress()]),
    ]
  )
)

export const DEFAULT_CREATE3_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(['bytes'], [DefaultCreate3Artifact.bytecode])
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

export const AUTH_FACTORY_ADDRESS = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      AuthFactoryArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        ['address', 'address'],
        [getSphinxRegistryAddress(), getOwnerAddress()]
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

export const getManagerConstructorValues = (chainId: number) => [
  getSphinxRegistryAddress(),
  DEFAULT_CREATE3_ADDRESS,
  getManagedServiceAddress(chainId),
  EXECUTION_LOCK_TIME,
  Object.values(CURRENT_SPHINX_MANAGER_VERSION),
]

const [managerConstructorFragment] = SphinxManagerABI.filter(
  (fragment) => fragment.type === 'constructor'
)

export const getSphinxManagerV1Address = (chainId: number) => {
  return utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        SphinxManagerArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          managerConstructorFragment.inputs,
          getManagerConstructorValues(chainId)
        ),
      ]
    )
  )
}

export const getSphinxManagerAddress = (owner: string, projectName: string) => {
  const salt = utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['address', 'string', 'bytes'],
      [owner, projectName, []]
    )
  )

  return utils.getCreate2Address(
    getSphinxRegistryAddress(),
    salt,
    getManagerProxyInitCodeHash()
  )
}

export const getAuthData = (
  owners: Array<string>,
  threshold: number
): string => {
  return utils.defaultAbiCoder.encode(
    ['address[]', 'uint256'],
    [owners, threshold]
  )
}

export const getAuthSalt = (authData: string, projectName: string): string => {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(['bytes', 'string'], [authData, projectName])
  )
}

export const getAuthAddress = (
  owners: Array<string>,
  threshold: number,
  projectName: string
): string => {
  const authData = getAuthData(owners, threshold)
  const salt = getAuthSalt(authData, projectName)

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
      SphinxManagerProxyArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        ['address', 'address'],
        [getSphinxRegistryAddress(), getSphinxRegistryAddress()]
      ),
    ]
  )
}

export const getBalanceFactoryAddress = (chainId: number): string => {
  return utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        BalanceFactoryArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [USDC_ADDRESSES[chainId], getManagedServiceAddress(chainId)]
        ),
      ]
    )
  )
}

export const getReferenceEscrowContractAddress = (chainId: number): string => {
  return utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        EscrowArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['string', 'address', 'address'],
          getReferenceEscrowConstructorArgs(chainId)
        ),
      ]
    )
  )
}

export const getReferenceBalanceConstructorArgs = (
  chainId: number
): Array<string> => {
  const balanceFactoryAddress = getBalanceFactoryAddress(chainId)
  const usdcAddress = USDC_ADDRESSES[chainId]
  const escrowAddress = getReferenceEscrowContractAddress(chainId)
  return [REFERENCE_ORG_ID, balanceFactoryAddress, usdcAddress, escrowAddress]
}

export const getReferenceEscrowConstructorArgs = (
  chainId: number
): Array<string> => {
  return [
    REFERENCE_ORG_ID,
    USDC_ADDRESSES[chainId],
    getManagedServiceAddress(chainId),
  ]
}

export const getReferenceBalanceContractAddress = (chainId: number): string => {
  const constructorArgs = getReferenceBalanceConstructorArgs(chainId)
  return utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        BalanceArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['string', 'address', 'address', 'address'],
          constructorArgs
        ),
      ]
    )
  )
}

export const ReferenceAuthProxyAddress = utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  constants.HashZero,
  utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      AuthProxyArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        ['address', 'address'],
        [AUTH_FACTORY_ADDRESS, constants.AddressZero]
      ),
    ]
  )
)
