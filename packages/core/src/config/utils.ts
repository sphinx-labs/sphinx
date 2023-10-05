import {
  concat,
  dataSlice,
  ethers,
  getAddress,
  getCreate2Address,
  keccak256,
} from 'ethers'

import { ContractKind, ContractKindEnum } from './types'

export const toContractKindEnum = (kind: ContractKind): ContractKindEnum => {
  switch (kind) {
    case 'oz-transparent':
      return ContractKindEnum.OZ_TRANSPARENT
    case 'oz-ownable-uups':
      return ContractKindEnum.OZ_OWNABLE_UUPS
    case 'oz-access-control-uups':
      return ContractKindEnum.OZ_ACCESS_CONTROL_UUPS
    case 'external-transparent':
      return ContractKindEnum.EXTERNAL_DEFAULT
    case 'immutable':
      return ContractKindEnum.IMMUTABLE
    case 'proxy':
      return ContractKindEnum.INTERNAL_DEFAULT
    default:
      throw new Error(`Invalid contract kind: ${kind}`)
  }
}

/**
 * Returns the Create3 address of a target contract deployed by Sphinx. There is a one-to-one mapping
 * between a Create3 address and the input parameters to this function. Note that the contract may
 * not yet be deployed at this address since it's calculated via Create3.
 */
export const getTargetAddress = (
  managerAddress: string,
  referenceName: string,
  userSalt: string
): string => {
  const targetSalt = getCreate3Salt(referenceName, userSalt)

  return getCreate3Address(managerAddress, targetSalt)
}

export const getCreate3Address = (
  managerAddress: string,
  salt: string
): string => {
  // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the `CREATE3.sol`
  // library for details.
  const proxyBytecode = '0x67363d3d37363d34f03d5260086018f3'

  const proxyAddress = getCreate2Address(
    managerAddress,
    salt,
    keccak256(proxyBytecode)
  )

  const addressHash = keccak256(concat(['0xd694', proxyAddress, '0x01']))

  // Return the last 20 bytes of the address hash
  const last20Bytes = dataSlice(addressHash, 12)

  // Return the checksum address
  return getAddress(last20Bytes)
}

export const getCreate3Salt = (
  referenceName: string,
  userSalt: string
): string => {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'bytes32'],
      [referenceName, userSalt]
    )
  )
}
