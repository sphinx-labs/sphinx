import { GnosisSafeContractArtifact } from './types'
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

// Gnosis Safe contract artifacts. This is the exhaustive list of contracts that are deployed in the
// deployment scripts of Gnosis Safe v1.3.0-libs.0 (commit 767ef36).
export const SimulateTxAccessorArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/accessors/SimulateTxAccessor.sol/SimulateTxAccessor.json')
export const GnosisSafeProxyFactoryArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json')
export const DefaultCallbackHandlerArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/handler/DefaultCallbackHandler.sol/DefaultCallbackHandler.json')
export const CompatibilityFallbackHandlerArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json')
export const CreateCallArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/libraries/CreateCall.sol/CreateCall.json')
export const MultiSendArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/libraries/MultiSend.sol/MultiSend.json')
export const MultiSendCallOnlyArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json')
export const SignMessageLibArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/libraries/SignMessageLib.sol/SignMessageLib.json')
export const GnosisSafeL2Artifact: GnosisSafeContractArtifact = require('../safe-artifacts/GnosisSafeL2.sol/GnosisSafeL2.json')
export const GnosisSafeArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/GnosisSafe.sol/GnosisSafe.json')
// This contract isn't deployed in Gnosis Safe's deployment scripts, but we need its bytecode in the
// plugins package, so we include it here.
export const GnosisSafeProxyArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/proxies/GnosisSafeProxy.sol/GnosisSafeProxy.json')

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
