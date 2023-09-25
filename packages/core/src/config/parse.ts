/* Imports: External */
import * as path from 'path'

import * as Handlebars from 'handlebars'
import { ConstructorFragment, ethers } from 'ethers'
import { BigNumber as EthersV5BigNumber } from '@ethersproject/bignumber'
import { ASTDereferencer } from 'solidity-ast/utils'

import {
  SolidityStorageObj,
  SolidityStorageType,
} from '../languages/solidity/types'
import {
  isUserContractKind,
  sphinxLog,
  isDataHexString,
  sortHexStrings,
  remove0x,
  isUserConstructorArgOverride,
  isSupportedChainId,
} from '../utils'
import {
  ParsedConfigVariable,
  UserConfigVariable,
  UserConfigVariables,
  ParsedConfigVariables,
  ConfigArtifacts,
  UserSphinxConfig,
  UserConfigOptions,
  ParsedConfigOptions,
  ParsedFunctionArgsPerChain,
  UserArgOverride,
} from './types'
import { Keyword, keywords } from '../constants'
import { getStorageType } from '../languages'
import { buildMappingStorageObj } from '../languages/solidity/iterator'
import { SphinxRuntimeEnvironment, FailureAction } from '../types'
import { getTargetAddress } from './utils'
import {
  SUPPORTED_LOCAL_NETWORKS,
  SUPPORTED_MAINNETS,
  SUPPORTED_NETWORKS,
  SUPPORTED_TESTNETS,
  SupportedChainId,
} from '../networks'
import { REFERENCE_NAME_CANNOT_BE_SPHINX_MANAGER } from './validation-error-messages'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// TODO(upgrades): TODO(docs)
// export const assertValidParsedSphinxFile = async (
//   parsedConfig: ParsedConfig,
//   configArtifacts: ConfigArtifacts,
//   cre: SphinxRuntimeEnvironment,
//   contractConfigCache: ContractConfigCache,
//   managerAddress: string,
//   failureAction: FailureAction
// ): Promise<void> => {
//   const { projectName } = parsedConfig
//   const { compilerConfigPath } = cre

//   // Exit if any validation errors were detected up to this point. This ensures that all proxies are
//   // deployed before we run OpenZeppelin's safety checks.
//   assertNoValidationErrors(failureAction)

//   for (const [referenceName, contractConfig] of Object.entries(
//     parsedConfig.contracts
//   )) {
//     const { kind, address, variables, contract, unsafeAllow } = contractConfig
//     const { input, output } = configArtifacts[referenceName].buildInfo
//     const { previousConfigUri, importCache, isTargetDeployed } =
//       contractConfigCache[referenceName]

//     if (importCache.requiresImport) {
//       if (kind === 'oz-ownable-uups' || kind === 'oz-access-control-uups') {
//         logValidationError(
//           'error',
//           `The UUPS proxy ${referenceName} at ${address} must give your SphinxManager contract\n` +
//             `permission to call the 'upgradeTo' function. SphinxManager address: ${managerAddress}.\n`,
//           [],
//           cre.silent,
//           cre.stream
//         )
//       } else if (
//         kind === 'external-transparent' ||
//         kind === 'proxy' ||
//         kind === 'oz-transparent'
//       ) {
//         const currProxyAdmin = importCache.currProxyAdmin
//         if (!currProxyAdmin) {
//           throw new Error(
//             `ConfigCache does not contain current admin. Should never happen.`
//           )
//         }

//         logValidationError(
//           'error',
//           `The Transparent proxy ${referenceName} at ${address} is not owned by Sphinx.\n` +
//             `Please import this proxy into Sphinx. Current proxy admin: ${currProxyAdmin}\n`,
//           [],
//           cre.silent,
//           cre.stream
//         )
//       }
//     }

//     if (kind === 'immutable') {
//       if (variableContainsKeyword(variables, keywords.preserve)) {
//         logValidationError(
//           'error',
//           'Detected the "{preserve}" keyword in a fresh deployment.',
//           [
//             'This keyword is reserved for upgrades only. Please remove all instances of it in your Sphinx config file.',
//           ],
//           cre.silent,
//           cre.stream
//         )
//       }
//     } else if (isTargetDeployed) {
//       const minimumCompilerInput = getMinimumCompilerInput(
//         input,
//         output.contracts,
//         configArtifacts[referenceName].artifact.sourceName,
//         configArtifacts[referenceName].artifact.contractName
//       )

//       const minimumCompilerOutput = getMinimumCompilerOutput(
//         output,
//         output.contracts,
//         configArtifacts[referenceName].artifact.sourceName,
//         configArtifacts[referenceName].artifact.contractName
//       )

//       // Run the proxy through OpenZeppelin's safety checks.
//       const upgradeableContract = getOpenZeppelinUpgradableContract(
//         contract,
//         minimumCompilerInput,
//         minimumCompilerOutput,
//         contractConfig
//       )

//       if (upgradeableContract.errors.length > 0) {
//         logValidationError(
//           'error',
//           `Contract ${contract} is not upgrade safe`,
//           [
//             new UpgradeableContractErrorReport(
//               upgradeableContract.errors
//             ).explain(),
//           ],
//           false,
//           cre.stream
//         )
//       }

//       const previousStorageLayout = await getPreviousStorageLayoutOZFormat(
//         projectName,
//         referenceName,
//         contractConfig,
//         compilerConfigPath,
//         cre,
//         previousConfigUri
//       )

//       assertStorageCompatiblePreserveKeywords(
//         contractConfig,
//         previousStorageLayout,
//         upgradeableContract.layout,
//         cre
//       )

//       if (unsafeAllow.skipStorageCheck !== true) {
//         assertStorageUpgradeSafe(
//           previousStorageLayout,
//           upgradeableContract.layout,
//           getOpenZeppelinValidationOpts(contractConfig)
//         )
//       }
//     }
//   }
// }

//   assertNoValidationErrors(failureAction)
// }

// TODO(upgrades): TODO(docs)
// /**
//  * Asserts that the Sphinx config can be initiated in a single transaction.
//  */
// export const assertValidDeploymentSize = (
//   parsedContractConfigs: ParsedContractConfigs,
//   cre: SphinxRuntimeEnvironment,
//   configCache: ConfigCache
// ): void => {
//   const { blockGasLimit } = configCache

//   const numTargets = Object.values(parsedContractConfigs).filter(
//     (contract) => contract.kind !== 'immutable'
//   ).length
//   const initiationGasCost = BigInt(100_000) * BigInt(numTargets)

//   const costWithBuffer = (initiationGasCost * 12n) / 10n

//   if (costWithBuffer > blockGasLimit) {
//     logValidationError(
//       'error',
//       `Too many contracts in your Sphinx config.`,
//       [],
//       cre.silent,
//       cre.stream
//     )
//   }
// }

// TODO(upgrades)
/**
 * Get the most recent storage layout for the given reference name. Uses OpenZeppelin's
 * StorageLayout format for consistency.
 *
 * When retrieving the storage layout, this function uses the following order of priority (from
 * highest to lowest):
 * 1. The 'previousBuildInfo' and 'previousFullyQualifiedName' fields if both have been declared by
 * the user.
 * 2. The latest deployment in the Sphinx system for the proxy address that corresponds to the
 * reference name.
 * 3. OpenZeppelin's Network File if the proxy is an OpenZeppelin proxy type
 *
 * If (1) and (2) above are both satisfied, we log a warning to the user and default to using the
 * storage layout located at 'previousBuildInfo'.
 */
// export const getPreviousStorageLayoutOZFormat = async (
//   projectName: string,
//   referenceName: string,
//   parsedContractConfig: ParsedContractConfig,
//   compilerConfigFolderPath: string,
//   cre: SphinxRuntimeEnvironment,
//   previousConfigUri?: string
// ): Promise<StorageLayout> => {
//   const prevCompilerConfig = previousConfigUri
//     ? await fetchAndCacheCompilerConfig(
//         previousConfigUri,
//         compilerConfigFolderPath
//       )
//     : undefined

//   const { previousFullyQualifiedName, previousBuildInfo } = parsedContractConfig
//   if (
//     previousFullyQualifiedName !== undefined &&
//     previousBuildInfo !== undefined
//   ) {
//     const { input, output } = readBuildInfo(previousBuildInfo)

//     if (prevCompilerConfig !== undefined) {
//       logValidationError(
//         'warning',
//         `Using the "previousBuildInfo" and "previousFullyQualifiedName" field to get the storage layout for\n` +
//           `the contract: ${referenceName}. If you'd like to use the storage layout from your most recent\n` +
//           `Sphinx deployment instead, please remove these two fields from your Sphinx config file.`,
//         [],
//         cre.silent,
//         cre.stream
//       )
//     }

//     return getOpenZeppelinUpgradableContract(
//       previousFullyQualifiedName,
//       input,
//       output,
//       parsedContractConfig
//     ).layout
//   } else if (prevCompilerConfig !== undefined) {
//     const prevConfigArtifacts = await getConfigArtifactsRemote(
//       prevCompilerConfig
//     )
//     const { buildInfo, artifact } = prevConfigArtifacts[referenceName]
//     const { sourceName, contractName } = artifact
//     return getOpenZeppelinUpgradableContract(
//       `${sourceName}:${contractName}`,
//       buildInfo.input,
//       buildInfo.output,
//       parsedContractConfig
//     ).layout
//     // TODO(upgrades): uncomment when we enable importing OpenZeppelin contracts
//     // } else if (cre.hre !== undefined && isOpenZeppelinContractKind(kind)) {
//     //   const openzeppelinStorageLayout = await cre.importOpenZeppelinStorageLayout(
//     //     cre.hre,
//     //     parsedContractConfig
//     //   )
//     //   return openzeppelinStorageLayout
//   } else {
//     throw new Error(
//       `Could not find the previous storage layout for the contract: ${referenceName}. Please include\n` +
//         `a "previousBuildInfo" and "previousFullyQualifiedName" field for this contract in your Sphinx config file.`
//     )
//   }
// }
