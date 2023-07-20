import fs from 'fs'
import path from 'path'

/* eslint-disable @typescript-eslint/no-var-requires */
export const SphinxRegistryArtifact = require('../artifacts/contracts/SphinxRegistry.sol/SphinxRegistry.json')
export const SphinxManagerArtifact = require('../artifacts/contracts/SphinxManager.sol/SphinxManager.json')
export const SphinxManagerProxyArtifact = require('../artifacts/contracts/SphinxManagerProxy.sol/SphinxManagerProxy.json')
export const ManagedServiceArtifact = require('../artifacts/contracts/ManagedService.sol/ManagedService.json')
export const ProxyArtifact = require('../artifacts/@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol/Proxy.json')
export const DefaultUpdaterArtifact = require('../artifacts/contracts/updaters/DefaultUpdater.sol/DefaultUpdater.json')
export const OZUUPSUpdaterArtifact = require('../artifacts/contracts/updaters/OZUUPSUpdater.sol/OZUUPSUpdater.json')
export const DefaultAdapterArtifact = require('../artifacts/contracts/adapters/DefaultAdapter.sol/DefaultAdapter.json')
export const OZUUPSOwnableAdapterArtifact = require('../artifacts/contracts/adapters/OZUUPSOwnableAdapter.sol/OZUUPSOwnableAdapter.json')
export const OZUUPSAccessControlAdapterArtifact = require('../artifacts/contracts/adapters/OZUUPSAccessControlAdapter.sol/OZUUPSAccessControlAdapter.json')
export const OZTransparentAdapterArtifact = require('../artifacts/contracts/adapters/OZTransparentAdapter.sol/OZTransparentAdapter.json')
export const DefaultGasPriceCalculatorArtifact = require('../artifacts/contracts/DefaultGasPriceCalculator.sol/DefaultGasPriceCalculator.json')
export const DefaultCreate3Artifact = require('../artifacts/contracts/DefaultCreate3.sol/DefaultCreate3.json')
export const LZSenderArtifact = require('../artifacts/contracts/SphinxLZSender.sol/SphinxLZSender.json')
export const AuthArtifact = require('../artifacts/contracts/SphinxAuth.sol/SphinxAuth.json')
export const FactoryArtifact = require('../artifacts/contracts/SphinxFactory.sol/SphinxFactory.json')
export const AuthProxyArtifact = require('../artifacts/contracts/SphinxAuthProxy.sol/SphinxAuthProxy.json')
export const LZReceiverArtifact = require('../artifacts/contracts/SphinxLZReceiver.sol/SphinxLZReceiver.json')
export const LZEndpointMockArtifact = require('../artifacts/@layerzerolabs/solidity-examples/contracts/mocks/LZEndpointMock.sol/LZEndpointMock.json')

const directoryPath = path.join(__dirname, '../artifacts/build-info')
const fileNames = fs.readdirSync(directoryPath)
if (fileNames.length !== 1) {
  throw new Error('Did not find exactly one Sphinx contracts build info file.')
}

export const buildInfo = require(`../artifacts/build-info/${fileNames[0]}`)

export const SphinxRegistryABI = SphinxRegistryArtifact.abi
export const SphinxManagerABI = SphinxManagerArtifact.abi
export const SphinxManagerProxyABI = SphinxManagerProxyArtifact.abi
export const ManagedServiceABI = ManagedServiceArtifact.abi
export const ProxyABI = ProxyArtifact.abi
export const DefaultUpdaterABI = DefaultUpdaterArtifact.abi
export const DefaultAdapterABI = DefaultAdapterArtifact.abi
export const OZUUPSUpdaterABI = OZUUPSUpdaterArtifact.abi
export const OZUUPSOwnableAdapterABI = OZUUPSOwnableAdapterArtifact.abi
export const OZUUPSAccessControlAdapterABI =
  OZUUPSAccessControlAdapterArtifact.abi
export const OZTransparentAdapterABI = OZTransparentAdapterArtifact.abi
export const DefaultGasPriceCalculatorABI =
  DefaultGasPriceCalculatorArtifact.abi
export const DefaultCreate3ABI = DefaultCreate3Artifact.abi
export const LZSenderABI = LZSenderArtifact.abi
export const AuthABI = AuthArtifact.abi
export const FactoryABI = FactoryArtifact.abi
export const AuthProxyABI = AuthProxyArtifact.abi
export const LZReceiverABI = LZReceiverArtifact.abi
export const LZEndpointMockABI = LZEndpointMockArtifact.abi
