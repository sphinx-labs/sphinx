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
  DefaultGasPriceCalculatorArtifact,
  SphinxManagerProxyArtifact,
  ProxyArtifact,
  FactoryArtifact,
  AuthArtifact,
} from '@sphinx/contracts'

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
  DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
  getManagedServiceAddress,
  REFERENCE_SPHINX_MANAGER_PROXY_ADDRESS,
  REFERENCE_PROXY_ADDRESS,
  FACTORY_ADDRESS,
  AUTH_IMPL_V1_ADDRESS,
} from './addresses'

export const getSphinxConstants = (): Array<{
  artifact: ContractArtifact
  expectedAddress: string
  constructorArgs: any[]
}> => {
  return [
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
      artifact: FactoryArtifact,
      expectedAddress: FACTORY_ADDRESS,
      constructorArgs: [getSphinxRegistryAddress(), getOwnerAddress()],
    },
  ]
}
