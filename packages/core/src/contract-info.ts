import {
  getOwnerAddress,
  ManagedServiceArtifact,
  SphinxRegistryArtifact,
  SphinxManagerArtifact,
  DefaultAdapterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  DefaultCreate3Artifact,
  SphinxManagerProxyArtifact,
  ProxyArtifact,
  AuthFactoryArtifact,
  AuthArtifact,
  BalanceFactoryArtifact,
  BalanceArtifact,
  EscrowArtifact,
} from '@sphinx/contracts'
import { providers } from 'ethers/lib/ethers'

import { ContractArtifact } from './languages/solidity/types'
import {
  getManagerConstructorValues,
  OZ_UUPS_UPDATER_ADDRESS,
  DEFAULT_UPDATER_ADDRESS,
  getSphinxRegistryAddress,
  getRegistryConstructorValues,
  getSphinxManagerV1Address,
  DEFAULT_ADAPTER_ADDRESS,
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  DEFAULT_CREATE3_ADDRESS,
  getManagedServiceAddress,
  REFERENCE_SPHINX_MANAGER_PROXY_ADDRESS,
  REFERENCE_PROXY_ADDRESS,
  AUTH_FACTORY_ADDRESS,
  AUTH_IMPL_V1_ADDRESS,
  getReferenceBalanceContractAddress,
  getReferenceBalanceConstructorArgs,
  getReferenceEscrowConstructorArgs,
  getBalanceFactoryAddress,
  getReferenceEscrowContractAddress,
} from './addresses'
import { USDC_ADDRESSES } from './constants'

export const getSphinxConstants = async (
  provider: providers.Provider
): Promise<
  Array<{
    artifact: ContractArtifact
    expectedAddress: string
    constructorArgs: any[]
  }>
> => {
  const contractInfo = [
    {
      artifact: SphinxRegistryArtifact,
      expectedAddress: getSphinxRegistryAddress(),
      constructorArgs: getRegistryConstructorValues(),
    },
    {
      artifact: SphinxManagerArtifact,
      expectedAddress: getSphinxManagerV1Address(),
      constructorArgs: getManagerConstructorValues(),
    },
    {
      artifact: DefaultAdapterArtifact,
      expectedAddress: DEFAULT_ADAPTER_ADDRESS,
      constructorArgs: [DEFAULT_UPDATER_ADDRESS],
    },
    {
      artifact: OZUUPSOwnableAdapterArtifact,
      expectedAddress: OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
      constructorArgs: [OZ_UUPS_UPDATER_ADDRESS],
    },
    {
      artifact: OZUUPSAccessControlAdapterArtifact,
      expectedAddress: OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
      constructorArgs: [OZ_UUPS_UPDATER_ADDRESS],
    },
    {
      artifact: OZTransparentAdapterArtifact,
      expectedAddress: OZ_TRANSPARENT_ADAPTER_ADDRESS,
      constructorArgs: [DEFAULT_UPDATER_ADDRESS],
    },
    {
      artifact: DefaultUpdaterArtifact,
      expectedAddress: DEFAULT_UPDATER_ADDRESS,
      constructorArgs: [],
    },
    {
      artifact: OZUUPSUpdaterArtifact,
      expectedAddress: OZ_UUPS_UPDATER_ADDRESS,
      constructorArgs: [],
    },
    {
      artifact: DefaultCreate3Artifact,
      expectedAddress: DEFAULT_CREATE3_ADDRESS,
      constructorArgs: [],
    },
    {
      artifact: ManagedServiceArtifact,
      expectedAddress: getManagedServiceAddress(),
      constructorArgs: [getOwnerAddress()],
    },
    {
      artifact: SphinxManagerProxyArtifact,
      expectedAddress: REFERENCE_SPHINX_MANAGER_PROXY_ADDRESS,
      constructorArgs: [getSphinxRegistryAddress(), getSphinxRegistryAddress()],
    },
    {
      artifact: ProxyArtifact,
      expectedAddress: REFERENCE_PROXY_ADDRESS,
      constructorArgs: [getSphinxRegistryAddress()],
    },
    {
      artifact: AuthArtifact,
      expectedAddress: AUTH_IMPL_V1_ADDRESS,
      constructorArgs: [[1, 0, 0]],
    },
    {
      artifact: AuthFactoryArtifact,
      expectedAddress: AUTH_FACTORY_ADDRESS,
      constructorArgs: [getSphinxRegistryAddress(), getOwnerAddress()],
    },
  ]

  // Add any network-specific contracts to the array.
  const { chainId } = await provider.getNetwork()
  if (chainId === 10 || chainId === 420) {
    // These are contracts that only exist on Optimism Mainnet (chain ID 10) and Optimism Goerli
    // (chain ID 420).
    const balanceFactoryAddress = getBalanceFactoryAddress(chainId)
    const usdcAddress = USDC_ADDRESSES[chainId]
    const escrowAddress = getReferenceEscrowContractAddress(chainId)
    const optimismContractInfo = [
      {
        artifact: BalanceFactoryArtifact,
        expectedAddress: balanceFactoryAddress,
        constructorArgs: [usdcAddress, getManagedServiceAddress()],
      },
      {
        artifact: BalanceArtifact,
        expectedAddress: getReferenceBalanceContractAddress(chainId),
        constructorArgs: getReferenceBalanceConstructorArgs(chainId),
      },
      {
        artifact: EscrowArtifact,
        expectedAddress: escrowAddress,
        constructorArgs: getReferenceEscrowConstructorArgs(chainId),
      },
    ]
    contractInfo.push(...optimismContractInfo)
  }

  return contractInfo
}
