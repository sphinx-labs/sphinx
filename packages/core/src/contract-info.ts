import {
  getOwnerAddress,
  ManagedServiceArtifact,
  ChugSplashRegistryArtifact,
  ChugSplashManagerArtifact,
  DefaultAdapterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  DefaultCreate3Artifact,
  DefaultGasPriceCalculatorArtifact,
  ChugSplashManagerProxyArtifact,
  ProxyArtifact,
  LZSenderArtifact,
  LZReceiverArtifact,
  AuthFactoryArtifact,
  AuthArtifact,
  LZEndpointMockArtifact,
} from '@chugsplash/contracts'

import { ContractArtifact } from './languages/solidity/types'
import {
  getManagerConstructorValues,
  OZ_UUPS_UPDATER_ADDRESS,
  DEFAULT_UPDATER_ADDRESS,
  getChugSplashRegistryAddress,
  getRegistryConstructorValues,
  getChugSplashManagerV1Address,
  DEFAULT_ADAPTER_ADDRESS,
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  DEFAULT_CREATE3_ADDRESS,
  DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
  getManagedServiceAddress,
  REFERENCE_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
  REFERENCE_PROXY_ADDRESS,
  getLZSenderAddress,
  getLZReceiverAddress,
  getMockEndPointAddress,
  AUTH_FACTORY_ADDRESS,
  AUTH_IMPL_V1_ADDRESS,
  getDestinationChains,
} from './addresses'
import { SUPPORTED_NETWORKS } from './constants'
import { LAYERZERO_ADDRESSES, SupportedChainId } from './networks'

export const getChugSplashConstants = (
  chainId: number,
  localLZEndpoint: boolean
): Array<{
  artifact: ContractArtifact
  expectedAddress: string
  constructorArgs: any[]
}> => {
  const lzSourceChainAddressInfo =
    chainId !== 31337
      ? LAYERZERO_ADDRESSES[chainId as SupportedChainId]
      : {
          endpointAddress: getMockEndPointAddress(chainId),
          relayerV2Address: '',
          lzChainId: chainId,
        }

  // Get the endpoint address based on if this deployment is on a local node or not
  const lzEndpointAddress =
    localLZEndpoint || 31337
      ? getMockEndPointAddress(lzSourceChainAddressInfo.lzChainId)
      : lzSourceChainAddressInfo.endpointAddress

  // Get the set of destination chains based off the supported networks
  const destinationChains = getDestinationChains(localLZEndpoint)

  // Get the sender using the expected endpoint address for this chain
  const sender = {
    artifact: LZSenderArtifact,
    expectedAddress: getLZSenderAddress(localLZEndpoint, lzEndpointAddress),
    constructorArgs: [lzEndpointAddress, destinationChains, getOwnerAddress()],
  }

  // Get the receiver(s)
  // When running locally, we simulate multichain messaging by sending messages to multiple destination contracts
  // So if we're deploying locally, then we need to deploy a receiver for each chainId we want to send too
  const receivers = localLZEndpoint
    ? Object.values(SUPPORTED_NETWORKS).map((id) => {
        const mockAddress = getMockEndPointAddress(
          LAYERZERO_ADDRESSES[id].lzChainId
        )
        return {
          artifact: LZReceiverArtifact,
          expectedAddress: getLZReceiverAddress(mockAddress),
          constructorArgs: [mockAddress, getOwnerAddress()],
        }
      })
    : [
        {
          artifact: LZReceiverArtifact,
          expectedAddress: getLZReceiverAddress(lzEndpointAddress),
          constructorArgs: [lzEndpointAddress, getOwnerAddress()],
        },
      ]

  // B/c we simulate multichain messaging by sending messages to multiple destination contracts, we need to deploy
  // a mock endpoint contract for each chain id when running locally
  const mockEndpoints = localLZEndpoint
    ? Object.values(SUPPORTED_NETWORKS).map((id) => {
        return {
          artifact: LZEndpointMockArtifact,
          expectedAddress: getMockEndPointAddress(
            LAYERZERO_ADDRESSES[id].lzChainId
          ),
          constructorArgs: [LAYERZERO_ADDRESSES[id].lzChainId],
        }
      })
    : []

  return [
    {
      artifact: ChugSplashRegistryArtifact,
      expectedAddress: getChugSplashRegistryAddress(),
      constructorArgs: getRegistryConstructorValues(),
    },
    {
      artifact: ChugSplashManagerArtifact,
      expectedAddress: getChugSplashManagerV1Address(),
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
      artifact: DefaultGasPriceCalculatorArtifact,
      expectedAddress: DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
      constructorArgs: [],
    },
    {
      artifact: ManagedServiceArtifact,
      expectedAddress: getManagedServiceAddress(),
      constructorArgs: [getOwnerAddress()],
    },
    {
      artifact: ChugSplashManagerProxyArtifact,
      expectedAddress: REFERENCE_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
      constructorArgs: [
        getChugSplashRegistryAddress(),
        getChugSplashRegistryAddress(),
      ],
    },
    {
      artifact: ProxyArtifact,
      expectedAddress: REFERENCE_PROXY_ADDRESS,
      constructorArgs: [getChugSplashRegistryAddress()],
    },
    {
      artifact: AuthArtifact,
      expectedAddress: AUTH_IMPL_V1_ADDRESS,
      constructorArgs: [[1, 0, 0]],
    },
    {
      artifact: AuthFactoryArtifact,
      expectedAddress: AUTH_FACTORY_ADDRESS,
      constructorArgs: [getChugSplashRegistryAddress(), getOwnerAddress()],
    },
    sender,
    ...receivers,
    ...mockEndpoints,
  ]
}
