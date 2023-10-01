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
import {
  ZeroHash,
  ZeroAddress,
  getCreate2Address,
  solidityPackedKeccak256,
  AbiCoder,
  keccak256,
} from 'ethers'

import { REFERENCE_ORG_ID } from './constants'
import { USDC_ADDRESSES } from './networks'
import { SemVer } from './types'

const [registryConstructorFragment] = SphinxRegistryABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const registryConstructorArgTypes = registryConstructorFragment.inputs.map(
  (input) => input.type
)

export const getRegistryConstructorValues = () => [getOwnerAddress()]

export const getSphinxRegistryAddress = () =>
  getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        SphinxRegistryArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          registryConstructorArgTypes,
          getRegistryConstructorValues()
        ),
      ]
    )
  )

export const getManagedServiceAddress = (chainId: bigint) => {
  const usdcAddress =
    chainId === 10n || chainId === 420n
      ? USDC_ADDRESSES[Number(chainId)]
      : ZeroAddress
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        ManagedServiceArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['address', 'address'],
          [getOwnerAddress(), usdcAddress]
        ),
      ]
    )
  )
}

export const REFERENCE_SPHINX_MANAGER_PROXY_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      SphinxManagerProxyArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(
        ['address', 'address'],
        [getSphinxRegistryAddress(), getSphinxRegistryAddress()]
      ),
    ]
  )
)

export const REFERENCE_PROXY_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      ProxyArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(
        ['address'],
        [getSphinxRegistryAddress()]
      ),
    ]
  )
)

export const DEFAULT_CREATE3_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(['bytes'], [DefaultCreate3Artifact.bytecode])
)

export const DEFAULT_UPDATER_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(['bytes'], [DefaultUpdaterArtifact.bytecode])
)

export const DEFAULT_ADAPTER_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      DefaultAdapterArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(['address'], [DEFAULT_UPDATER_ADDRESS]),
    ]
  )
)

export const OZ_UUPS_UPDATER_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(['bytes'], [OZUUPSUpdaterArtifact.bytecode])
)

export const OZ_UUPS_OWNABLE_ADAPTER_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      OZUUPSOwnableAdapterArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(['address'], [OZ_UUPS_UPDATER_ADDRESS]),
    ]
  )
)

export const OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      OZUUPSAccessControlAdapterArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(['address'], [OZ_UUPS_UPDATER_ADDRESS]),
    ]
  )
)

export const OZ_TRANSPARENT_ADAPTER_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      OZTransparentAdapterArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(['address'], [DEFAULT_UPDATER_ADDRESS]),
    ]
  )
)

export const AUTH_FACTORY_ADDRESS = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      AuthFactoryArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(
        ['address', 'address'],
        [getSphinxRegistryAddress(), getOwnerAddress()]
      ),
    ]
  )
)

export const getAuthImplAddress = (version: SemVer) => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        AuthArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'uint256', 'uint256'],
          Object.values(version)
        ),
      ]
    )
  )
}

export const getManagerConstructorValues = (
  chainId: bigint,
  version: SemVer
) => [
  getSphinxRegistryAddress(),
  DEFAULT_CREATE3_ADDRESS,
  getManagedServiceAddress(chainId),
  EXECUTION_LOCK_TIME,
  Object.values(version),
]

const [managerConstructorFragment] = SphinxManagerABI.filter(
  (fragment) => fragment.type === 'constructor'
)

export const getEncodedSphinxManagerConstructorArgs = (
  chainId: bigint,
  version: SemVer
): string => {
  return AbiCoder.defaultAbiCoder().encode(
    managerConstructorFragment.inputs,
    getManagerConstructorValues(chainId, version)
  )
}

export const getSphinxManagerImplAddress = (
  chainId: bigint,
  version: SemVer
) => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        SphinxManagerArtifact.bytecode,
        getEncodedSphinxManagerConstructorArgs(chainId, version),
      ]
    )
  )
}

export const getSphinxManagerAddress = (owner: string, projectName: string) => {
  const salt = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['address', 'string', 'bytes'],
      [owner, projectName, '0x']
    )
  )

  return getCreate2Address(
    getSphinxRegistryAddress(),
    salt,
    getManagerProxyInitCodeHash()
  )
}

export const getAuthData = (
  owners: Array<string>,
  ownerThreshold: number
): string => {
  // Sort the owners in ascending order. This makes it easier to calculate the
  // the address of the SphinxAuth contract, which is generated using the
  // auth data.
  owners.sort()

  return AbiCoder.defaultAbiCoder().encode(
    ['address[]', 'uint256'],
    [owners, ownerThreshold]
  )
}

export const getAuthSalt = (authData: string, projectName: string): string => {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['bytes', 'string'],
      [authData, projectName]
    )
  )
}

export const getAuthAddress = (
  owners: Array<string>,
  ownerThreshold: number,
  projectName: string
): string => {
  const authData = getAuthData(owners, ownerThreshold)
  const salt = getAuthSalt(authData, projectName)

  return getCreate2Address(
    AUTH_FACTORY_ADDRESS,
    salt,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        AuthProxyArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['address', 'address'],
          [AUTH_FACTORY_ADDRESS, AUTH_FACTORY_ADDRESS]
        ),
      ]
    )
  )
}

export const getManagerProxyInitCodeHash = (): string => {
  return solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      SphinxManagerProxyArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(
        ['address', 'address'],
        [getSphinxRegistryAddress(), getSphinxRegistryAddress()]
      ),
    ]
  )
}

export const AUTH_PROXY_INIT_CODE_HASH = solidityPackedKeccak256(
  ['bytes', 'bytes'],
  [
    AuthProxyArtifact.bytecode,
    AbiCoder.defaultAbiCoder().encode(
      ['address', 'address'],
      [AUTH_FACTORY_ADDRESS, AUTH_FACTORY_ADDRESS]
    ),
  ]
)

export const getBalanceFactoryAddress = (chainId: bigint): string => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        BalanceFactoryArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['address', 'address'],
          [USDC_ADDRESSES[Number(chainId)], getManagedServiceAddress(chainId)]
        ),
      ]
    )
  )
}

export const getReferenceEscrowContractAddress = (chainId: bigint): string => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        EscrowArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['string', 'address', 'address'],
          getReferenceEscrowConstructorArgs(chainId)
        ),
      ]
    )
  )
}

export const getReferenceBalanceConstructorArgs = (
  chainId: bigint
): Array<string> => {
  const balanceFactoryAddress = getBalanceFactoryAddress(chainId)
  const usdcAddress = USDC_ADDRESSES[Number(chainId)]
  const escrowAddress = getReferenceEscrowContractAddress(chainId)
  return [REFERENCE_ORG_ID, balanceFactoryAddress, usdcAddress, escrowAddress]
}

export const getReferenceEscrowConstructorArgs = (
  chainId: bigint
): Array<string> => {
  return [
    REFERENCE_ORG_ID,
    USDC_ADDRESSES[Number(chainId)],
    getManagedServiceAddress(chainId),
  ]
}

export const getReferenceBalanceContractAddress = (chainId: bigint): string => {
  const constructorArgs = getReferenceBalanceConstructorArgs(chainId)
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        BalanceArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['string', 'address', 'address', 'address'],
          constructorArgs
        ),
      ]
    )
  )
}

export const ReferenceAuthProxyAddress = getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ZeroHash,
  solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      AuthProxyArtifact.bytecode,
      AbiCoder.defaultAbiCoder().encode(
        ['address', 'address'],
        [AUTH_FACTORY_ADDRESS, ZeroAddress]
      ),
    ]
  )
)
