import { ethers } from 'ethers'

import {
  CheckBalanceLowArtifact,
  CompatibilityFallbackHandlerArtifact,
  CreateCallArtifact,
  DefaultCallbackHandlerArtifact,
  GnosisSafeArtifact,
  GnosisSafeL2Artifact,
  GnosisSafeProxyFactoryArtifact,
  MultiSendArtifact,
  MultiSendCallOnlyArtifact,
  SimulateTxAccessorArtifact,
  SphinxModuleProxyFactoryArtifact,
  SignMessageLibArtifact,
  SphinxModuleArtifact,
  PermissionlessRelayArtifact,
} from './ifaces'
import {
  ContractArtifact,
  GnosisSafeContractArtifact,
  SystemContractInfo,
} from './types'
import {
  getCheckBalanceLowAddress,
  getCompatibilityFallbackHandlerAddress,
  getCreateCallAddress,
  getDefaultCallbackHandlerAddress,
  getGnosisSafeSingletonAddress,
  getGnosisSafeL2Address,
  getGnosisSafeProxyFactoryAddress,
  getMultiSendAddress,
  getMultiSendCallOnlyAddress,
  getSignMessageLibAddress,
  getSimulateTxAccessorAddress,
  getSphinxModuleImplAddress,
  getSphinxModuleProxyFactoryAddress,
  getPermissionlessRelayAddress,
} from './addresses'
import { remove0x } from './utils'

export enum SystemContractType {
  SPHINX,
  PERMISSIONLESS_RELAY,
  OPTIMISM,
  GNOSIS_SAFE,
}

type SphinxSystemContract = {
  artifact: ContractArtifact | GnosisSafeContractArtifact
  expectedAddress: string
  constructorArgs: any[]
  type: SystemContractType
}

// An array of additional system contracts to verify on Etherscan.
export const additionalSystemContractsToVerify: Array<SphinxSystemContract> = [
  // The `SphinxModule` is deployed in the constructor of the `SphinxModuleProxyFactory`, which is
  // why it's not included as an element in the `getSphinxConstants` array. We put it in this array
  // so that we can verify the `SphinxModule` on Etherscan.
  {
    artifact: SphinxModuleArtifact,
    expectedAddress: getSphinxModuleImplAddress(),
    constructorArgs: [],
    type: SystemContractType.SPHINX,
  },
]

export const getSphinxConstants = (): Array<SphinxSystemContract> => {
  const contractInfo = [
    {
      artifact: PermissionlessRelayArtifact,
      expectedAddress: getPermissionlessRelayAddress(),
      constructorArgs: [],
      type: SystemContractType.PERMISSIONLESS_RELAY,
    },
    {
      artifact: SphinxModuleProxyFactoryArtifact,
      expectedAddress: getSphinxModuleProxyFactoryAddress(),
      constructorArgs: [],
      type: SystemContractType.SPHINX,
    },
    {
      artifact: SimulateTxAccessorArtifact,
      expectedAddress: getSimulateTxAccessorAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: GnosisSafeProxyFactoryArtifact,
      expectedAddress: getGnosisSafeProxyFactoryAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: DefaultCallbackHandlerArtifact,
      expectedAddress: getDefaultCallbackHandlerAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: CompatibilityFallbackHandlerArtifact,
      expectedAddress: getCompatibilityFallbackHandlerAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: CreateCallArtifact,
      expectedAddress: getCreateCallAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: MultiSendArtifact,
      expectedAddress: getMultiSendAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: MultiSendCallOnlyArtifact,
      expectedAddress: getMultiSendCallOnlyAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: SignMessageLibArtifact,
      expectedAddress: getSignMessageLibAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: GnosisSafeL2Artifact,
      expectedAddress: getGnosisSafeL2Address(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: GnosisSafeArtifact,
      expectedAddress: getGnosisSafeSingletonAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: CheckBalanceLowArtifact,
      expectedAddress: getCheckBalanceLowAddress(),
      constructorArgs: [],
      type: SystemContractType.OPTIMISM,
    },
  ]

  return contractInfo
}

/**
 * Returns a minimal representation of the system contracts to use in the Sphinx Foundry plugin.
 */
export const getSystemContractInfo = (): Array<SystemContractInfo> => {
  return getSphinxConstants().map(
    ({ artifact, constructorArgs, expectedAddress }) => {
      const { abi, bytecode } = artifact

      const iface = new ethers.Interface(abi)

      const initCodeWithArgs = bytecode.concat(
        remove0x(iface.encodeDeploy(constructorArgs))
      )

      return { initCodeWithArgs, expectedAddress }
    }
  )
}
