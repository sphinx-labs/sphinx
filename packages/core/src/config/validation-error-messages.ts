import { CallAction } from '../actions/types'
import { hyperlink, prettyFunctionCall } from '../utils'
import { UserCallAction } from './types'

export const contractInstantiatedWithInvalidAddress = (
  address: string
): string => {
  return `Contract was instantiated with an invalid address: ${address}`
}

export const contractInstantiatedWithInvalidAbi = (
  ethersErrorMessage: string,
  address: string,
  referenceName?: string
): string => {
  return `An invalid ABI was used to instantiate the contract: ${
    referenceName ?? address
  }. Reason: ${ethersErrorMessage}`
}

export const contractInstantiatedWithInvalidNetworkOverrides = (
  invalidNetworks: Array<string>,
  address: string,
  referenceName?: string
): string => {
  return (
    `The contract ${
      referenceName ?? address
    } was instantiated with unsupported networks in its address overrides: ${invalidNetworks.join(
      ', '
    )}.\n` +
    `See ${hyperlink(
      'here',
      'https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md#options'
    )} for a list of supported networks.`
  )
}

export const contractInstantiatedWithDuplicatedNetworkOverrides = (
  address: string,
  referenceName?: string
): string => {
  return `The contract ${
    referenceName ?? address
  } was instantiated with duplicated networks in its address overrides:`
}

export const contractInstantiatedWithInvalidOverridingAddresses = (
  address: string,
  referenceName?: string
): string => {
  return `The contract ${
    referenceName ?? address
  } was instantiated with invalid overriding addresses:`
}

export const externalContractMustIncludeAbi = (address: string): string => {
  return `You must include an ABI when instantiating the contract at address ${address}.`
}

export const failedToEncodeFunctionCall = (
  ethersErrorMessage: string,
  callAction: UserCallAction,
  referenceName?: string
): string => {
  return (
    `Failed to encode data for the function call on ${
      referenceName ?? callAction.address
    }:\n` +
    `${prettyFunctionCall(
      callAction.functionName,
      callAction.functionArgs
    )}\n` +
    `Reason: ${ethersErrorMessage}`
  )
}

export const functionTypeArgumentsAreNotAllowed = (
  functionLogName: string
): string => {
  return `The ${functionLogName} contains function type arguments, which are not allowed. Please remove the following fields:`
}
