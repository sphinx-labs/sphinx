import { GnosisSafeContractArtifact } from './types'
import { parseFoundryContractArtifact } from './utils'

/* eslint-disable @typescript-eslint/no-var-requires */
export const PermissionlessRelayArtifact = parseFoundryContractArtifact(
  require('../contract-artifacts/sphinx/PermissionlessRelay.sol/PermissionlessRelay.json')
)
export const SphinxModuleArtifact = parseFoundryContractArtifact(
  require('../contract-artifacts/sphinx/SphinxModule.sol/SphinxModule.json')
)
export const SphinxModuleProxyFactoryArtifact = parseFoundryContractArtifact(
  require('../contract-artifacts/sphinx/SphinxModuleProxyFactory.sol/SphinxModuleProxyFactory.json')
)

export const ManagedServiceABI = PermissionlessRelayArtifact.abi
export const SphinxModuleABI = SphinxModuleArtifact.abi
export const SphinxModuleProxyFactoryABI = SphinxModuleProxyFactoryArtifact.abi

export const sphinxBuildInfo = require(`../contract-artifacts/sphinx/build-info.json`)
export const permissionlessRelayBuildInfo = require(`../contract-artifacts/sphinx/permissionless-relay-build-info.json`)

// Gnosis Safe contract artifacts. This is the exhaustive list of contracts that are deployed in the
// deployment scripts of Gnosis Safe v1.3.0-libs.0 (commit 767ef36).
export const SimulateTxAccessorArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/accessors/SimulateTxAccessor.sol/SimulateTxAccessor.json')
export const GnosisSafeProxyFactoryArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json')
export const DefaultCallbackHandlerArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/handler/DefaultCallbackHandler.sol/DefaultCallbackHandler.json')
export const CompatibilityFallbackHandlerArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json')
export const CreateCallArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/libraries/CreateCall.sol/CreateCall.json')
export const MultiSendArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/libraries/MultiSend.sol/MultiSend.json')
export const MultiSendCallOnlyArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json')
export const SignMessageLibArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/libraries/SignMessageLib.sol/SignMessageLib.json')
export const GnosisSafeL2Artifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/GnosisSafeL2.sol/GnosisSafeL2.json')
export const GnosisSafeArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/GnosisSafe.sol/GnosisSafe.json')
// This contract isn't deployed in Gnosis Safe's deployment scripts, but we need its bytecode in the
// plugins package, so we include it here.
export const GnosisSafeProxyArtifact: GnosisSafeContractArtifact = require('../contract-artifacts/gnosis-safe/v1.3.0/proxies/GnosisSafeProxy.sol/GnosisSafeProxy.json')

// Get the build info file that corresponds to the Gnosis Safe contract artifacts. We'll need it to
// verify these contracts on Etherscan.
export const gnosisSafeBuildInfo = require('../contract-artifacts/gnosis-safe/v1.3.0/build-info.json')

// Drippie contract artifacts from Optimism's repo. These are copied from the commit:
// https://github.com/ethereum-optimism/optimism/tree/3a62bccd6c5464891d0d6282264022d240d05b60
export const DrippieArtifact = require('../contract-artifacts/optimism/Drippie.json')
export const CheckBalanceLowArtifact = require('../contract-artifacts/optimism/CheckBalanceLow.json')
// Get the build info file that corresponds to the Drippie contract artifacts. We'll need it to
// verify the Drippie contracts on Etherscan.
export const optimismPeripheryBuildInfo = require('../contract-artifacts/optimism/build-info.json')
