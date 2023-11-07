import {
  getOwnerAddress,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ManagedServiceArtifact,
  BalanceFactoryArtifact,
  SphinxModuleFactoryArtifact,
} from '@sphinx-labs/contracts'
import {
  ZeroHash,
  ZeroAddress,
  getCreate2Address,
  solidityPackedKeccak256,
  AbiCoder,
} from 'ethers'

import { USDC_ADDRESSES } from './networks'
import { parseFoundryArtifact } from './utils'

export const getManagedServiceConstructorArgs = (chainId: bigint) => {
  const usdcAddress =
    chainId === 10n || chainId === 420n
      ? USDC_ADDRESSES[Number(chainId)]
      : ZeroAddress

  return [getOwnerAddress(), usdcAddress]
}

export const getManagedServiceAddress = (chainId: bigint) => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        parseFoundryArtifact(ManagedServiceArtifact).bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['address', 'address'],
          getManagedServiceConstructorArgs(chainId)
        ),
      ]
    )
  )
}

export const getBalanceFactoryAddress = (chainId: bigint): string => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        parseFoundryArtifact(BalanceFactoryArtifact).bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['address', 'address'],
          [USDC_ADDRESSES[Number(chainId)], getManagedServiceAddress(chainId)]
        ),
      ]
    )
  )
}

export const getSphinxModuleFactoryAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes'],
      [parseFoundryArtifact(SphinxModuleFactoryArtifact).bytecode]
    )
  )
}
