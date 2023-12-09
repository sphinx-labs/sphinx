import {
  concat,
  dataSlice,
  ethers,
  getAddress,
  getCreate2Address,
  keccak256,
} from 'ethers'

import { prettyFunctionCall } from '../utils'
import { Action } from './types'
import { HumanReadableAction } from '../actions'

export const getReadableActions = (
  actions: Action[]
): HumanReadableAction[] => {
  return actions.map((action) => {
    const { referenceName, functionName, variables, address } = action
    const actionStr = prettyFunctionCall(
      referenceName,
      address,
      functionName,
      variables,
      5,
      3
    )
    return {
      reason: actionStr,
      actionIndex: action.index,
    }
  })
}

export const getCreate3Address = (deployer: string, salt: string): string => {
  // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the `CREATE3.sol`
  // library for details.
  const proxyBytecode = '0x67363d3d37363d34f03d5260086018f3'

  const proxyAddress = getCreate2Address(
    deployer,
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
