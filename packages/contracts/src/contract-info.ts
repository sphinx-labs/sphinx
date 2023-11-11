import { ZeroAddress } from 'ethers'

import {
  CompatibilityFallbackHandlerArtifact,
  CreateCallArtifact,
  DefaultCallbackHandlerArtifact,
  GnosisSafeArtifact,
  GnosisSafeL2Artifact,
  GnosisSafeProxyFactoryArtifact,
  ManagedServiceArtifact,
  MultiSendArtifact,
  MultiSendCallOnlyArtifact,
  SimulateTxAccessorArtifact,
  SphinxModuleFactoryArtifact,
} from './ifaces'
import { ContractArtifact } from './types'
import {
  getCompatibilityFallbackHandlerAddress,
  getCreateCallAddress,
  getDefaultCallbackHandlerAddress,
  getGnosisSafeAddress,
  getGnosisSafeL2Address,
  getGnosisSafeProxyFactoryAddress,
  getManagedServiceAddress,
  getMultiSendAddress,
  getMultiSendCallOnlyAddress,
  getSimulateTxAccessorAddress,
  getSphinxModuleFactoryAddress,
} from './addresses'
import { getOwnerAddress } from './constants'

// Maps a chain ID to the USDC address on the network.
export const USDC_ADDRESSES: { [chainId: string]: string } = {
  // Optimism Goerli:
  420: '0x7E07E15D2a87A24492740D16f5bdF58c16db0c4E',
  // Optimism Mainnet:
  10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  31337: ZeroAddress,
}

export const getSphinxConstants = (): Array<{
  artifact: ContractArtifact
  expectedAddress: string
  constructorArgs: any[]
}> => {
  const contractInfo = [
    {
      artifact: ManagedServiceArtifact,
      expectedAddress: getManagedServiceAddress(),
      constructorArgs: [getOwnerAddress()],
    },
    {
      artifact: SphinxModuleFactoryArtifact,
      expectedAddress: getSphinxModuleFactoryAddress(),
      constructorArgs: [],
    },
    {
      artifact: SimulateTxAccessorArtifact,
      expectedAddress: getSimulateTxAccessorAddress(),
      constructorArgs: [],
    },
    {
      artifact: GnosisSafeProxyFactoryArtifact,
      expectedAddress: getGnosisSafeProxyFactoryAddress(),
      constructorArgs: [],
    },
    {
      artifact: DefaultCallbackHandlerArtifact,
      expectedAddress: getDefaultCallbackHandlerAddress(),
      constructorArgs: [],
    },
    {
      artifact: CompatibilityFallbackHandlerArtifact,
      expectedAddress: getCompatibilityFallbackHandlerAddress(),
      constructorArgs: [],
    },
    {
      artifact: CreateCallArtifact,
      expectedAddress: getCreateCallAddress(),
      constructorArgs: [],
    },
    {
      artifact: MultiSendArtifact,
      expectedAddress: getMultiSendAddress(),
      constructorArgs: [],
    },
    {
      artifact: MultiSendCallOnlyArtifact,
      expectedAddress: getMultiSendCallOnlyAddress(),
      constructorArgs: [],
    },
    {
      artifact: GnosisSafeL2Artifact,
      expectedAddress: getGnosisSafeL2Address(),
      constructorArgs: [],
    },
    {
      artifact: GnosisSafeArtifact,
      expectedAddress: getGnosisSafeAddress(),
      constructorArgs: [],
    },
  ]

  return contractInfo
}
