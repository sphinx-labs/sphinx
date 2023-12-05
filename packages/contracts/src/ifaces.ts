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
export const SimulateTxAccessorArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/accessors/SimulateTxAccessor.sol/SimulateTxAccessor.json')
export const GnosisSafeProxyFactoryArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json')
export const DefaultCallbackHandlerArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/handler/DefaultCallbackHandler.sol/DefaultCallbackHandler.json')
export const CompatibilityFallbackHandlerArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json')
export const CreateCallArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/libraries/CreateCall.sol/CreateCall.json')
export const MultiSendArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/libraries/MultiSend.sol/MultiSend.json')
export const MultiSendCallOnlyArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json')
export const SignMessageLibArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/libraries/SignMessageLib.sol/SignMessageLib.json')
export const GnosisSafeL2Artifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/GnosisSafeL2.sol/GnosisSafeL2.json')
export const GnosisSafeArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/GnosisSafe.sol/GnosisSafe.json')
// This contract isn't deployed in Gnosis Safe's deployment scripts, but we need its bytecode in the
// plugins package, so we include it here.
export const GnosisSafeProxyArtifact: GnosisSafeContractArtifact = require('../safe-artifacts/v1.3.0/proxies/GnosisSafeProxy.sol/GnosisSafeProxy.json')

// Drippie contract artifacts
export const DrippieArtifact = parseFoundryArtifact(
  require('../node_modules/@eth-optimism/contracts-bedrock/forge-artifacts/Drippie.sol/Drippie.json')
)
export const CheckBalanceLowArtifact = parseFoundryArtifact(
  require('../node_modules/@eth-optimism/contracts-bedrock/forge-artifacts/CheckBalanceLow.sol/CheckBalanceLow.json')
)

export const ManagedServiceABI = ManagedServiceArtifact.abi
export const SphinxModuleABI = SphinxModuleArtifact.abi
export const SphinxModuleProxyFactoryABI = SphinxModuleProxyFactoryArtifact.abi
