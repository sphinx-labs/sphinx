import { hyperlink } from '../utils'

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
