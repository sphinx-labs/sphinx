import {
  CheckBalanceLowArtifact,
  CompatibilityFallbackHandlerArtifact,
  CreateCallArtifact,
  DefaultCallbackHandlerArtifact,
  DrippieArtifact,
  GnosisSafeArtifact,
  GnosisSafeL2Artifact,
  GnosisSafeProxyFactoryArtifact,
  ManagedServiceArtifact,
  MultiSendArtifact,
  MultiSendCallOnlyArtifact,
  SimulateTxAccessorArtifact,
  SphinxModuleProxyFactoryArtifact,
  SignMessageLibArtifact,
  SphinxModuleArtifact,
} from './ifaces'
import { FoundryContractArtifact, GnosisSafeContractArtifact } from './types'
import {
  getCheckBalanceLowAddress,
  getCompatibilityFallbackHandlerAddress,
  getCreateCallAddress,
  getDefaultCallbackHandlerAddress,
  getDrippieAddress,
  getGnosisSafeAddress,
  getGnosisSafeL2Address,
  getGnosisSafeProxyFactoryAddress,
  getManagedServiceAddress,
  getMultiSendAddress,
  getMultiSendCallOnlyAddress,
  getSignMessageLibAddress,
  getSimulateTxAccessorAddress,
  getSphinxModuleImplAddress,
  getSphinxModuleProxyFactoryAddress,
} from './addresses'
import { getOwnerAddress } from './constants'

export enum SystemContractType {
  SPHINX,
  OPTIMISM,
  GNOSIS_SAFE,
}

type SphinxSystemContract = {
  artifact: FoundryContractArtifact | GnosisSafeContractArtifact
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
      artifact: ManagedServiceArtifact,
      expectedAddress: getManagedServiceAddress(),
      constructorArgs: [getOwnerAddress()],
      type: SystemContractType.SPHINX,
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
      expectedAddress: getGnosisSafeAddress(),
      constructorArgs: [],
      type: SystemContractType.GNOSIS_SAFE,
    },
    {
      artifact: DrippieArtifact,
      expectedAddress: getDrippieAddress(),
      constructorArgs: [getOwnerAddress()],
      type: SystemContractType.OPTIMISM,
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
