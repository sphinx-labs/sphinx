import {
  ZeroHash,
  getCreate2Address,
  solidityPackedKeccak256,
  ethers,
  AbiCoder,
} from 'ethers'

import {
  SphinxModuleProxyFactoryArtifact,
  SimulateTxAccessorArtifact,
  GnosisSafeProxyFactoryArtifact,
  DefaultCallbackHandlerArtifact,
  CompatibilityFallbackHandlerArtifact,
  CreateCallArtifact,
  MultiSendArtifact,
  MultiSendCallOnlyArtifact,
  GnosisSafeL2Artifact,
  GnosisSafeArtifact,
  SphinxModuleArtifact,
  SignMessageLibArtifact,
  CheckBalanceLowArtifact,
  SphinxModuleProxyFactoryABI,
  GnosisSafeProxyArtifact,
  PermissionlessRelayArtifact,
  DrippieArtifact,
} from './ifaces'
import {
  getOwnerAddress,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
} from './constants'
import { Operation } from './merkle-tree'

export const getManagedServiceConstructorArgs = () => {
  return [getOwnerAddress()]
}

export const getPermissionlessRelayAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [PermissionlessRelayArtifact.bytecode])
  )
}

export const getSphinxModuleImplAddress = () => {
  return getCreate2Address(
    getSphinxModuleProxyFactoryAddress(),
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [SphinxModuleArtifact.bytecode])
  )
}

export const getSphinxModuleProxyFactoryAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes'],
      [SphinxModuleProxyFactoryArtifact.bytecode]
    )
  )
}

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

export const getSignMessageLibAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [SignMessageLibArtifact.bytecode])
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
export const getGnosisSafeSingletonAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [GnosisSafeArtifact.bytecode])
  )
}

export const getDrippieAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        DrippieArtifact.bytecode,
        AbiCoder.defaultAbiCoder().encode(['address'], [getOwnerAddress()]),
      ]
    )
  )
}

export const getCheckBalanceLowAddress = () => {
  return getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ZeroHash,
    solidityPackedKeccak256(['bytes'], [CheckBalanceLowArtifact.bytecode])
  )
}

/**
 * Sorts an array of hex strings in ascending order and returns the sorted array. Does not mutate
 * the original array.
 *
 * @param arr The array of hex strings to sort.
 * @returns A new sorted array.
 */
export const sortHexStrings = (arr: Array<string>): Array<string> => {
  // Create a copy of the array
  const arrCopy = [...arr]

  // Sort the copied array
  return arrCopy.sort((a, b) => {
    const aBigInt = BigInt(a)
    const bBigInt = BigInt(b)
    return aBigInt < bBigInt ? -1 : aBigInt > bBigInt ? 1 : 0
  })
}

export const getGnosisSafeInitializerData = (
  owners: Array<string>,
  threshold: number
): string => {
  if (owners.length === 0) {
    throw new Error(
      "Sphinx: You must have at least one owner in your 'owners' array."
    )
  }
  if (threshold === 0) {
    throw new Error(
      "Sphinx: You must set your 'threshold' to a value greater than 0."
    )
  }

  // Sort the owner addresses
  const sortedOwners = sortHexStrings(owners)

  const sphinxModuleProxyFactoryAddress = getSphinxModuleProxyFactoryAddress()

  const sphinxModuleProxyFactory = new ethers.Contract(
    sphinxModuleProxyFactoryAddress,
    SphinxModuleProxyFactoryABI
  )

  // Encode the data for deploying the Sphinx Module
  const encodedDeployModuleCall =
    sphinxModuleProxyFactory.interface.encodeFunctionData(
      'deploySphinxModuleProxyFromSafe',
      [ethers.ZeroHash]
    )

  // Encode the data in a format for MultiSend
  const deployModuleMultiSendData = ethers.solidityPacked(
    ['uint8', 'address', 'uint', 'uint', 'bytes'],
    [
      Operation.Call,
      sphinxModuleProxyFactoryAddress,
      0,
      ethers.getBytes(encodedDeployModuleCall).length,
      encodedDeployModuleCall,
    ]
  )

  // Similar encoding for enabling the Sphinx Module
  const encodedEnableModuleCall =
    sphinxModuleProxyFactory.interface.encodeFunctionData(
      'enableSphinxModuleProxyFromSafe',
      [ethers.ZeroHash]
    )

  const enableModuleMultiSendData = ethers.solidityPacked(
    ['uint8', 'address', 'uint', 'uint', 'bytes'],
    [
      Operation.DelegateCall,
      sphinxModuleProxyFactoryAddress,
      0,
      ethers.getBytes(encodedEnableModuleCall).length,
      encodedEnableModuleCall,
    ]
  )

  // Encode the entire MultiSend data
  const multiSend = new ethers.Contract(
    getMultiSendAddress(),
    MultiSendArtifact.abi
  )
  const multiSendData = multiSend.interface.encodeFunctionData('multiSend', [
    ethers.concat([deployModuleMultiSendData, enableModuleMultiSendData]),
  ])

  // Encode the call to the Gnosis Safe's `setup` function
  const gnosisSafe = new ethers.Contract(
    getGnosisSafeSingletonAddress(),
    GnosisSafeArtifact.abi
  )
  const safeInitializerData = gnosisSafe.interface.encodeFunctionData('setup', [
    sortedOwners,
    threshold,
    getMultiSendAddress(),
    multiSendData,
    // This is the default fallback handler used by Gnosis Safe during their
    // standard deployments.
    getCompatibilityFallbackHandlerAddress(),
    // The following fields are for specifying an optional payment as part of the
    // deployment. We don't use them.
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ])

  return safeInitializerData
}

export const getGnosisSafeProxyAddress = (
  owners: Array<string>,
  threshold: number,
  saltNonce: number
): string => {
  const sortedOwners = sortHexStrings(owners)
  const safeInitializerData = getGnosisSafeInitializerData(
    sortedOwners,
    threshold
  )

  const salt = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'uint256'],
      [ethers.keccak256(safeInitializerData), saltNonce]
    )
  )

  const deploymentData = ethers.solidityPacked(
    ['bytes', 'uint256'],
    [GnosisSafeProxyArtifact.bytecode, getGnosisSafeSingletonAddress()]
  )

  return ethers.getCreate2Address(
    getGnosisSafeProxyFactoryAddress(),
    salt,
    ethers.keccak256(deploymentData)
  )
}
