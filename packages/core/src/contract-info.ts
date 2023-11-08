import {
  CompatibilityFallbackHandlerArtifact,
  CreateCallArtifact,
  DefaultCallbackHandlerArtifact,
  getOwnerAddress,
  GnosisSafeArtifact,
  GnosisSafeL2Artifact,
  GnosisSafeProxyFactoryArtifact,
  ManagedServiceArtifact,
  MultiSendArtifact,
  MultiSendCallOnlyArtifact,
  SimulateTxAccessorArtifact,
  SphinxModuleFactoryArtifact,
} from '@sphinx-labs/contracts'
import { Provider, ZeroAddress } from 'ethers'

import { ContractArtifact } from './languages/solidity/types'
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
import { USDC_ADDRESSES } from './networks'
import { parseFoundryArtifact } from './utils'

export const getSphinxConstants = async (
  provider: Provider
): Promise<
  Array<{
    artifact: ContractArtifact
    expectedAddress: string
    constructorArgs: any[]
  }>
> => {
  const network = await provider.getNetwork()
  const chainId = network.chainId
  const contractInfo = [
    {
      artifact: parseFoundryArtifact(ManagedServiceArtifact),
      expectedAddress: getManagedServiceAddress(chainId),
      constructorArgs: [
        getOwnerAddress(),
        chainId === 420n || chainId === 10n
          ? USDC_ADDRESSES[Number(chainId)]
          : ZeroAddress,
      ],
    },
    {
      artifact: parseFoundryArtifact(SphinxModuleFactoryArtifact),
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
