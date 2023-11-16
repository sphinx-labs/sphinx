import { parseFoundryArtifact } from './utils'

/* eslint-disable @typescript-eslint/no-var-requires */
export const ManagedServiceArtifact = parseFoundryArtifact(
  require('../out/ManagedService.sol/ManagedService.json')
)
export const SphinxModuleArtifact = parseFoundryArtifact(
  require('../out/SphinxModule.sol/SphinxModule.json')
)
export const SphinxModuleProxyFactoryArtifact = parseFoundryArtifact(
  require('../out/SphinxModuleProxyFactory.sol/SphinxModuleProxyFactory.json')
)

// Gnosis Safe contracts:
// TODO - we need to generate these artifacts ourselves using a special build profile that results in exactly the same
//        bytecode that is used to deploy the contracts in the gnosis script.
//        Right now we just import the artifacts, but that only works for 1.3.0 which is the latest version on NPM
export const SimulateTxAccessorArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/accessors/SimulateTxAccessor.sol/SimulateTxAccessor.json')
export const GnosisSafeProxyFactoryArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json')
export const DefaultCallbackHandlerArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/handler/DefaultCallbackHandler.sol/DefaultCallbackHandler.json')
export const CompatibilityFallbackHandlerArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json')
export const CreateCallArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/CreateCall.sol/CreateCall.json')
export const MultiSendArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json')
export const MultiSendCallOnlyArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json')
export const GnosisSafeL2Artifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafeL2.sol/GnosisSafeL2.json')
export const GnosisSafeArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json')
export const GnosisSafeProxyArtifact = require('../node_modules/@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxy.sol/GnosisSafeProxy.json')

export const ManagedServiceABI = ManagedServiceArtifact.abi
export const SphinxModuleABI = SphinxModuleArtifact.abi
export const SphinxModuleProxyFactoryABI = SphinxModuleProxyFactoryArtifact.abi

// TODO - do we need any of this?
// const directoryPath = path.join(__dirname, '../artifacts/build-info')
// const fileNames = fs.readdirSync(directoryPath)
// if (fileNames.length !== 1) {
//   throw new Error('Did not find exactly one Sphinx contracts build info file.')
// }

// export const buildInfo = require(`../artifacts/build-info/${fileNames[0]}`)
// export const prevBuildInfo = require('./prev-build-info.json')

/* eslint-disable @typescript-eslint/no-var-requires */
// export const SphinxRegistryArtifact = require('../artifacts/contracts/SphinxRegistry.sol/SphinxRegistry.json')
// export const SphinxManagerArtifact = require('../artifacts/contracts/SphinxManager.sol/SphinxManager.json')
// export const SphinxManagerProxyArtifact = require('../artifacts/contracts/SphinxManagerProxy.sol/SphinxManagerProxy.json')
// export const ManagedServiceArtifact = require('../artifacts/contracts/ManagedService.sol/ManagedService.json')
// export const ProxyArtifact = require('../artifacts/contracts/Proxy.sol/Proxy.json')
// export const DefaultUpdaterArtifact = require('../artifacts/contracts/updaters/DefaultUpdater.sol/DefaultUpdater.json')
// export const OZUUPSUpdaterArtifact = require('../artifacts/contracts/updaters/OZUUPSUpdater.sol/OZUUPSUpdater.json')
// export const DefaultAdapterArtifact = require('../artifacts/contracts/adapters/DefaultAdapter.sol/DefaultAdapter.json')
// export const OZUUPSOwnableAdapterArtifact = require('../artifacts/contracts/adapters/OZUUPSOwnableAdapter.sol/OZUUPSOwnableAdapter.json')
// export const OZUUPSAccessControlAdapterArtifact = require('../artifacts/contracts/adapters/OZUUPSAccessControlAdapter.sol/OZUUPSAccessControlAdapter.json')
// export const OZTransparentAdapterArtifact = require('../artifacts/contracts/adapters/OZTransparentAdapter.sol/OZTransparentAdapter.json')
// export const DefaultCreate3Artifact = require('../artifacts/contracts/SphinxDefaultCreate3.sol/SphinxDefaultCreate3.json')
// export const AuthArtifact = require('../artifacts/contracts/SphinxAuth.sol/SphinxAuth.json')
// export const AuthFactoryArtifact = require('../artifacts/contracts/SphinxAuthFactory.sol/SphinxAuthFactory.json')
// export const AuthProxyArtifact = require('../artifacts/contracts/SphinxAuthProxy.sol/SphinxAuthProxy.json')
// export const BalanceFactoryArtifact = require('../artifacts/contracts/SphinxBalanceFactory.sol/SphinxBalanceFactory.json')
// export const BalanceArtifact = require('../artifacts/contracts/SphinxBalance.sol/SphinxBalance.json')
// export const EscrowArtifact = require('../artifacts/contracts/SphinxEscrow.sol/SphinxEscrow.json')
// export const ERC20Artifact = require('../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json')

// export const SphinxRegistryABI = SphinxRegistryArtifact.abi
// export const SphinxManagerABI = SphinxManagerArtifact.abi
// export const SphinxManagerProxyABI = SphinxManagerProxyArtifact.abi
// export const ManagedServiceABI = ManagedServiceArtifact.abi
// export const ProxyABI = ProxyArtifact.abi
// export const DefaultUpdaterABI = DefaultUpdaterArtifact.abi
// export const DefaultAdapterABI = DefaultAdapterArtifact.abi
// export const OZUUPSUpdaterABI = OZUUPSUpdaterArtifact.abi
// export const OZUUPSOwnableAdapterABI = OZUUPSOwnableAdapterArtifact.abi
// export const OZUUPSAccessControlAdapterABI =
//   OZUUPSAccessControlAdapterArtifact.abi
// export const OZTransparentAdapterABI = OZTransparentAdapterArtifact.abi
// export const DefaultCreate3ABI = DefaultCreate3Artifact.abi
// export const AuthABI = AuthArtifact.abi
// export const AuthFactoryABI = AuthFactoryArtifact.abi
// export const AuthProxyABI = AuthProxyArtifact.abi
// export const BalanceFactoryABI = BalanceFactoryArtifact.abi
// export const BalanceABI = BalanceArtifact.abi
// export const EscrowABI = EscrowArtifact.abi
// export const ERC20ABI = ERC20Artifact.abi
