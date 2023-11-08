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
} from '../src/ifaces'
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
import { parseFoundryArtifact } from './utils'
import { getOwnerAddress } from './constants'

// Maps a chain ID to the USDC address on the network.
export const USDC_ADDRESSES: { [chainId: string]: string } = {
  // Optimism Goerli:
  420: '0x7E07E15D2a87A24492740D16f5bdF58c16db0c4E',
  // Optimism Mainnet:
  10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
}

export const getSphinxConstants = (
  chainId: bigint
): Array<{
  artifact: ContractArtifact
  expectedAddress: string
  constructorArgs: any[]
}> => {
  const contractInfo = [
    {
      artifact: ManagedServiceArtifact,
      expectedAddress: getManagedServiceAddress(chainId),
      constructorArgs: [
        getOwnerAddress(),
        chainId === 420n || chainId === 10n
          ? USDC_ADDRESSES[Number(chainId)]
          : ZeroAddress,
      ],
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
