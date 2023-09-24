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

let validationErrors = false

const logValidationError = (
  logLevel: 'warning' | 'error',
  title: string,
  lines: string[],
  silent: boolean,
  stream: NodeJS.WritableStream
) => {
  if (logLevel === 'error') {
    validationErrors = true
  }
  sphinxLog(logLevel, title, lines, silent, stream)
}

export const isEmptySphinxConfig = (configFileName: string): boolean => {
  delete require.cache[require.resolve(path.resolve(configFileName))]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.resolve(configFileName))
  return Object.keys(config).length === 0
}

/**
 * Throws an error if the given variable contains any invalid contract references. Specifically,
 * it'll throw an error if any of the following conditions occur:
 *
 * 1. There are any leading spaces before '{{', or any trailing spaces after '}}'. This ensures the
 * template string converts into a valid address when it's parsed. If there are any leading or
 * trailing spaces in an address, `ethers.isAddress` will return false.
 *
 * 2. The contract reference is not included in the array of valid contract references.
 *
 * @param variable Config variable defined by the user.
 * @param validReferenceNames Valid reference names for this Sphinx config file.
 */
export const assertValidContractReferences = (
  variable: UserConfigVariable,
  validReferenceNames: string[],
  cre: SphinxRuntimeEnvironment
) => {
  if (
    typeof variable === 'string' &&
    variable.includes('{{') &&
    variable.includes('}}')
  ) {
    if (!variable.startsWith('{{')) {
      logValidationError(
        'error',
        `Contract reference cannot contain leading spaces before '{{' : ${variable}`,
        [],
        cre.silent,
        cre.stream
      )
    }
    if (!variable.endsWith('}}')) {
      logValidationError(
        'error',
        `Contract reference cannot contain trailing spaces: ${variable}`,
        [],
        cre.silent,
        cre.stream
      )
    }

    const contractReference = variable.substring(2, variable.length - 2).trim()

    if (
      !validReferenceNames.includes(contractReference) &&
      contractReference !== 'SphinxManager'
    ) {
      logValidationError(
        'error',
        `Invalid contract reference: ${variable}.\nDid you misspell this contract reference, or forget to define a contract with this reference name?`,
        [],
        cre.silent,
        cre.stream
      )
    }
  } else if (Array.isArray(variable)) {
    for (const element of variable) {
      assertValidContractReferences(element, validReferenceNames, cre)
    }
  } else if (typeof variable === 'object') {
    for (const [varName, varValue] of Object.entries(variable)) {
      assertValidContractReferences(varName, validReferenceNames, cre)
      assertValidContractReferences(varValue, validReferenceNames, cre)
    }
  } else if (
    typeof variable === 'boolean' ||
    typeof variable === 'number' ||
    typeof variable === 'string'
  ) {
    return
  } else {
    logValidationError(
      'error',
      `Detected unknown variable type, ${typeof variable}, for variable: ${variable}.`,
      [],
      cre.silent,
      cre.stream
    )
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

export const resolveContractReferences = (
  userConfig: UserSphinxConfig,
  managerAddress: string
): {
  resolvedUserConfig: UserSphinxConfig
  contractAddresses: { [referenceName: string]: string }
} => {
  const contractAddresses: { [referenceName: string]: string } = {}

  // Determine the addresses for all contracts.
  for (const [referenceName, userContractConfig] of Object.entries(
    userConfig.contracts
  )) {
    const { address, salt } = userContractConfig

    // Set the address to the user-defined value if it exists, otherwise set it to the
    // Create3 address given to contracts deployed within the Sphinx system.
    contractAddresses[referenceName] =
      address ?? getTargetAddress(managerAddress, referenceName, salt)
  }

  // Resolve all contract references.
  const resolvedUserConfig: UserSphinxConfig = JSON.parse(
    Handlebars.compile(JSON.stringify(userConfig))({
      SphinxManager: managerAddress,
      ...contractAddresses,
    })
  )

  return { resolvedUserConfig, contractAddresses }
}

export const setDefaultContractFields = (
  userConfig: UserSphinxConfig
): UserSphinxConfig => {
  for (const contractConfig of Object.values(userConfig.contracts)) {
    if (contractConfig.unsafeAllow) {
      contractConfig.unsafeAllow.flexibleConstructor =
        contractConfig.unsafeAllow.flexibleConstructor ?? true
    } else {
      contractConfig.unsafeAllow = {
        flexibleConstructor: true,
      }
    }
  }

  return userConfig
}

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

/**
 * Assert that the block gas limit is reasonably high on a network.
 */
export const assertValidBlockGasLimit = (blockGasLimit: bigint): void => {
  // Although we can lower this from 15M to 10M or less, we err on the side of safety for now. This
  //  number should never be lower than 5.5M because it costs ~5.3M gas to deploy the
  //  SphinxManager V1, which is at the contract size limit.
  if (blockGasLimit < 15_000_000n) {
    throw new Error(
      `Block gas limit is too low on this network. Got: ${blockGasLimit.toString()}. Expected: ${
        blockGasLimit.toString
      }`
    )
  }
}

export const assertSupportedChainId = (
  chainId: number,
  cre: SphinxRuntimeEnvironment
): void => {
  if (!isSupportedChainId(chainId)) {
    logValidationError(
      'error',
      `Unsupported chain id: ${chainId}.`,
      [],
      cre.silent,
      cre.stream
    )
  }
}

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

export const parseConfigOptions = (
  options: UserConfigOptions,
  isTestnet: boolean
): ParsedConfigOptions => {
  const { mainnets, testnets, orgId, ownerThreshold, managerVersion } = options

  const chainIds = isTestnet
    ? testnets.map((network) => SUPPORTED_TESTNETS[network])
    : mainnets.map((network) => SUPPORTED_MAINNETS[network])

  // Converts addresses to checksummed addresses and sorts them in ascending order.
  const owners = options.owners.map((address) => ethers.getAddress(address))
  sortHexStrings(owners)

  const proposers = options.proposers.map((address) =>
    ethers.getAddress(address)
  )
  sortHexStrings(proposers)

  return {
    chainIds,
    orgId,
    owners,
    ownerThreshold,
    managerVersion,
    proposers,
  }
}
