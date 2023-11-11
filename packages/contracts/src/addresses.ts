import {
  ZeroHash,
  getCreate2Address,
  solidityPackedKeccak256,
  AbiCoder,
} from 'ethers'

import {
  ManagedServiceArtifact,
  SphinxModuleFactoryArtifact,
  SimulateTxAccessorArtifact,
  GnosisSafeProxyFactoryArtifact,
  DefaultCallbackHandlerArtifact,
  CompatibilityFallbackHandlerArtifact,
  CreateCallArtifact,
  MultiSendArtifact,
  MultiSendCallOnlyArtifact,
  GnosisSafeL2Artifact,
  GnosisSafeArtifact,
} from './ifaces'
import {
  getOwnerAddress,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
} from './constants'

export const getManagedServiceConstructorArgs = () => {
  return [getOwnerAddress()]
}

export const getManagedServiceAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        ManagedServiceArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['address'],
          getManagedServiceConstructorArgs()
        ),
      ]
    )
  )
}

export const getSphinxModuleFactoryAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [SphinxModuleFactoryArtifact.bytecode])
  )
}

// TODO - use gnosis singleton factory to get the canonical addresses?

// SimulateTxAccessor
export const getSimulateTxAccessorAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [SimulateTxAccessorArtifact.bytecode])
  )
}

// GnosisSafeProxyFactory
export const getGnosisSafeProxyFactoryAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes'],
      [GnosisSafeProxyFactoryArtifact.bytecode]
    )
  )
}

// DefaultCallbackHandler
export const getDefaultCallbackHandlerAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes'],
      [DefaultCallbackHandlerArtifact.bytecode]
    )
  )
}

// CompatibilityFallbackHandler
export const getCompatibilityFallbackHandlerAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes'],
      [CompatibilityFallbackHandlerArtifact.bytecode]
    )
  )
}

// CreateCall
export const getCreateCallAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [CreateCallArtifact.bytecode])
  )
}

// MultiSend
export const getMultiSendAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [MultiSendArtifact.bytecode])
  )
}

// MultiSendCallOnly
export const getMultiSendCallOnlyAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [MultiSendCallOnlyArtifact.bytecode])
  )
}

// GnosisSafeL2
export const getGnosisSafeL2Address = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [GnosisSafeL2Artifact.bytecode])
  )
}

// GnosisSafe
export const getGnosisSafeAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [GnosisSafeArtifact.bytecode])
  )
}
