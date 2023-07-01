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
  FunderArtifact,
  LZReceiverArtifact,
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
  MANAGED_SERVICE_ADDRESS,
  REFERENCE_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
  REFERENCE_PROXY_ADDRESS,
  getFunderAddress,
  getLZReceiverAddress,
  getMockEndPointAddress,
} from './addresses'
import { LAYERZERO_ENDPOINT_ADDRESSES } from './constants'

export const getChugSplashConstants = (
  chainId: number
): Array<{
  artifact: ContractArtifact
  expectedAddress: string
  constructorArgs: any[]
}> => {
  const lzEndpointAddress =
    LAYERZERO_ENDPOINT_ADDRESSES[chainId]?.address ??
    getMockEndPointAddress(chainId)
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
      expectedAddress: MANAGED_SERVICE_ADDRESS,
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
      artifact: FunderArtifact,
      expectedAddress: getFunderAddress(lzEndpointAddress),
      constructorArgs: [lzEndpointAddress],
    },
    {
      artifact: LZReceiverArtifact,
      expectedAddress: getLZReceiverAddress(lzEndpointAddress),
      constructorArgs: [lzEndpointAddress],
    },
  ]
}
