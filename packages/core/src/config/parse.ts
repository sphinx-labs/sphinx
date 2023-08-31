/* Imports: External */
import * as path from 'path'

import * as Handlebars from 'handlebars'
import { ConstructorFragment, ethers } from 'ethers'
import { BigNumber as EthersV5BigNumber } from '@ethersproject/bignumber'
import {
  astDereferencer,
  ASTDereferencer,
  srcDecoder,
  isNodeType,
  findAll,
} from 'solidity-ast/utils'
import {
  assertStorageUpgradeSafe,
  StorageLayout,
  UpgradeableContractErrorReport,
} from '@openzeppelin/upgrades-core'
import {
  ProxyABI,
  SphinxManagerABI,
  SphinxRegistryABI,
} from '@sphinx-labs/contracts'
import { getDetailedLayout } from '@openzeppelin/upgrades-core/dist/storage/layout'
import { ContractDefinition, Expression } from 'solidity-ast'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

import {
  SolidityStorageLayout,
  SolidityStorageObj,
  SolidityStorageType,
  CompilerOutput,
} from '../languages/solidity/types'
import {
  isUserContractKind,
  getEIP1967ProxyAdminAddress,
  getOpenZeppelinUpgradableContract,
  isEqualType,
  getOpenZeppelinValidationOpts,
  sphinxLog,
  isDataHexString,
  getCreationCodeWithConstructorArgs,
  getPreviousConfigUri,
  readBuildInfo,
  fetchAndCacheCompilerConfig,
  getConfigArtifactsRemote,
  getDuplicateElements,
  getNetworkType,
  resolveNetwork,
  sortHexStrings,
  remove0x,
  getCallHash,
  findReferenceNameForAddress,
  isUserConstructorArgOverride,
  getFunctionArgValueArray,
  getCallActionAddressForNetwork,
  isSupportedChainId,
  getNetworkNameForChainId,
} from '../utils'
import { SphinxJsonRpcProvider } from '../provider'
import {
  ParsedConfigVariable,
  UserContractConfig,
  UserConfigVariable,
  UserConfigVariables,
  ParsedConfigVariables,
  ParsedContractConfig,
  ContractConfigCache,
  ContractKindEnum,
  DeploymentRevert,
  ImportCache,
  GetConfigArtifacts,
  ConfigArtifacts,
  UserSphinxConfig,
  ParsedConfigWithOptions,
  UserConfigOptions,
  ParsedContractConfigs,
  ParsedConfig,
  UserConfigWithOptions,
  ParsedConfigOptions,
  ParsedOwnerConfig,
  UserConfig,
  MinimalConfigCache,
  ConfigCache,
  ParsedFunctionArgsPerChain,
  ParsedCallAction,
  UserCallAction,
  ParsedCallActionsPerChain,
  UserArgOverride,
} from './types'
import { CONTRACT_SIZE_LIMIT, Keyword, keywords } from '../constants'
import {
  getStorageType,
  extendStorageLayout,
  isKeyword,
  variableContainsKeyword,
  getMinimumCompilerInput,
  getMinimumCompilerOutput,
} from '../languages'
import {
  recursiveLayoutIterator,
  VariableHandlers,
  VariableHandler,
  VariableHandlerProps,
  buildMappingStorageObj,
} from '../languages/solidity/iterator'
import { SphinxRuntimeEnvironment, FailureAction } from '../types'
import { getStorageLayout } from '../actions/artifacts'
import {
  OZ_UUPS_UPDATER_ADDRESS,
  getSphinxManagerAddress,
  getSphinxRegistryAddress,
} from '../addresses'
import { getTargetAddress, getTargetSalt, toContractKindEnum } from './utils'
import {
  SUPPORTED_LOCAL_NETWORKS,
  SUPPORTED_MAINNETS,
  SUPPORTED_NETWORKS,
  SUPPORTED_TESTNETS,
  SupportedChainId,
} from '../networks'
import {
  contractInstantiatedWithDuplicatedNetworkOverrides,
  contractInstantiatedWithInvalidAbi,
  contractInstantiatedWithInvalidAddress,
  contractInstantiatedWithInvalidNetworkOverrides,
  contractInstantiatedWithInvalidOverridingAddresses,
  externalContractMustIncludeAbi,
  externalContractsMustBeDeployed,
  failedToEncodeFunctionCall,
  functionTypeArgumentsAreNotAllowed,
} from './validation-error-messages'

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

/**
 * Reads a Sphinx config file, then parses and validates the selected projects inside of it.
 * This is meant to be used for configs that contain an 'options' field. Configs that contain only a
 * single owner for the purpose of deploying locally should call `getParsedConfigWithOptions` instead of
 * this function.
 *
 * @param configPath Path to the Sphinx config file.
 * @param projects The project name(s) to parse. This function will only validate these projects.
 * The returned parsed config will not include any other projects in the config file.
 * @param managerAddress Address of the SphinxManager. Note that this may not be calculable
 * based on the config file because the owners may have changed after the
 * SphinxManager was deployed, which would alter its Create2 address. However, if the
 * owners haven't changed, then this address can be calculated locally.
 * @param authAddress Address of the SphinxAuth contract. Note that the same caveat applies
 * here as for the `managerAddress` parameter.
 *
 * @returns The parsed Sphinx config file.
 */
export const getParsedConfigWithOptions = async (
  userConfig: UserConfigWithOptions,
  managerAddress: string,
  isTestnet: boolean,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  cre: SphinxRuntimeEnvironment,
  getConfigArtifacts: GetConfigArtifacts,
  failureAction: FailureAction = FailureAction.EXIT
): Promise<{
  parsedConfig: ParsedConfigWithOptions
  configArtifacts: ConfigArtifacts
  configCache: ConfigCache
}> => {
  // Just in case, we reset the global validation errors flag before parsing
  validationErrors = false

  if (!userConfig.projectName) {
    logValidationError(
      'error',
      `Config is missing a 'project' field.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  // Validate top level config, contracts, and post-deployment actions.
  assertValidUserConfig(userConfig, cre, failureAction)

  assertValidConfigOptions(userConfig.options, cre, failureAction)

  const parsedConfigOptions = parseConfigOptions(userConfig.options, isTestnet)

  const configArtifacts = await getConfigArtifacts(userConfig.contracts)

  const { resolvedUserConfig, contractAddresses } = resolveContractReferences(
    userConfig,
    managerAddress
  )

  const networks = [
    ...userConfig.options.mainnets,
    ...userConfig.options.testnets,
  ]
  const contractConfigs = getUnvalidatedContractConfigs(
    resolvedUserConfig,
    networks,
    configArtifacts,
    contractAddresses,
    cre,
    failureAction
  )

  if (resolvedUserConfig.postDeploy) {
    assertValidPostDeploymentActions(
      resolvedUserConfig.postDeploy,
      contractConfigs,
      failureAction,
      cre
    )
  }

  const postDeployActions = resolvedUserConfig.postDeploy
    ? parsePostDeploymentActions(
        resolvedUserConfig.postDeploy,
        contractConfigs,
        networks,
        configArtifacts,
        cre,
        failureAction
      )
    : {}

  const parsedConfig: ParsedConfigWithOptions = {
    manager: managerAddress,
    options: parsedConfigOptions,
    contracts: contractConfigs,
    projectName: resolvedUserConfig.projectName,
    postDeploy: postDeployActions,
  }

  const configCache = await getConfigCache(
    provider,
    parsedConfig,
    configArtifacts,
    getSphinxRegistryAddress(),
    managerAddress
  )

  await postParsingValidation(
    parsedConfig,
    configArtifacts,
    cre,
    configCache,
    failureAction
  )

  return { parsedConfig, configArtifacts, configCache }
}

/**
 * Gets a Sphinx config file, then parses and validates the selected projects inside of it.
 * This is meant to be used for configs that are only using Sphinx to deploy locally. Configs
 * that contain options should call `getParsedConfigWithOptions` instead.
 *
 * @param configPath Path to the Sphinx config file.
 * @param projects The project name(s) to parse. This function will only validate these projects.
 * The returned parsed config will not include any other projects in the config file.
 * @returns The parsed Sphinx config file.
 */
export const getParsedConfig = async (
  userConfig: UserConfig,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  cre: SphinxRuntimeEnvironment,
  getConfigArtifacts: GetConfigArtifacts,
  ownerAddress: string,
  failureAction: FailureAction = FailureAction.EXIT
): Promise<{
  parsedConfig: ParsedConfig
  configArtifacts: ConfigArtifacts
  configCache: ConfigCache
}> => {
  // Just in case, we reset the global validation errors flag before parsing
  validationErrors = false

  if (!userConfig.projectName) {
    logValidationError(
      'error',
      `Config is missing a 'project' field.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  if (userConfig.options) {
    logValidationError(
      'error',
      `Config with an 'options' field cannot be used with this function.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  if (!ethers.isAddress(ownerAddress)) {
    logValidationError(
      'error',
      `The owner address is invalid: ${ownerAddress}.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  // Validate top level config, contracts, and post-deployment actions.
  assertValidUserConfig(userConfig, cre, failureAction)

  const managerAddress = getSphinxManagerAddress(
    ownerAddress,
    userConfig.projectName
  )

  const configArtifacts = await getConfigArtifacts(userConfig.contracts)

  const chainId = await provider.getNetwork().then((n) => n.chainId)

  const networkArray = Object.entries(SUPPORTED_NETWORKS).find(
    (entry) => BigInt(entry[1]) === chainId
  )
  if (!networkArray) {
    throw new ValidationError(
      `Network with ID ${chainId} is not supported by Sphinx.`
    )
  }
  const network = [networkArray[0]]

  const { resolvedUserConfig, contractAddresses } = resolveContractReferences(
    userConfig,
    managerAddress
  )

  const contractConfigs = getUnvalidatedContractConfigs(
    resolvedUserConfig,
    network,
    configArtifacts,
    contractAddresses,
    cre,
    failureAction
  )

  if (resolvedUserConfig.postDeploy) {
    assertValidPostDeploymentActions(
      resolvedUserConfig.postDeploy,
      contractConfigs,
      failureAction,
      cre
    )
  }

  const postDeployActions = resolvedUserConfig.postDeploy
    ? parsePostDeploymentActions(
        resolvedUserConfig.postDeploy,
        contractConfigs,
        network,
        configArtifacts,
        cre,
        failureAction
      )
    : {}

  const parsedConfig: ParsedOwnerConfig = {
    owner: ownerAddress,
    contracts: contractConfigs,
    projectName: resolvedUserConfig.projectName,
    manager: managerAddress,
    postDeploy: postDeployActions,
  }

  const configCache = await getConfigCache(
    provider,
    parsedConfig,
    configArtifacts,
    getSphinxRegistryAddress(),
    managerAddress
  )

  await postParsingValidation(
    parsedConfig,
    configArtifacts,
    cre,
    configCache,
    failureAction
  )

  return { parsedConfig, configArtifacts, configCache }
}

export const isEmptySphinxConfig = (configFileName: string): boolean => {
  delete require.cache[require.resolve(path.resolve(configFileName))]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.resolve(configFileName))
  return Object.keys(config).length === 0
}

/**
 * Validates a Sphinx config file.
 *
 * @param config Config file to validate.
 */
export const assertValidUserConfig = (
  config: UserSphinxConfig,
  cre: SphinxRuntimeEnvironment,
  failureAction: FailureAction
) => {
  const validReferenceNames = Object.keys(config.contracts)

  for (const [referenceName, contractConfig] of Object.entries(
    config.contracts
  )) {
    // Block people from accidentally using templates in contract names.
    if (referenceName.includes('{') || referenceName.includes('}')) {
      logValidationError(
        'error',
        `Cannot use template strings in reference names: ${referenceName}`,
        [],
        cre.silent,
        cre.stream
      )
    }

    // Block people from accidentally using templates in contract names.
    if (
      contractConfig.contract.includes('{') ||
      contractConfig.contract.includes('}')
    ) {
      logValidationError(
        'error',
        `Cannot use template strings in contract name: ${contractConfig.contract}`,
        [],
        cre.silent,
        cre.stream
      )
    }

    // Make sure addresses are valid.
    if (
      contractConfig.address !== undefined &&
      !ethers.isAddress(contractConfig.address)
    ) {
      logValidationError(
        'error',
        `Address for ${referenceName} is not valid: ${contractConfig.address}`,
        [],
        cre.silent,
        cre.stream
      )
    }

    // Make sure that the user-defined contract kind is valid.
    if (
      contractConfig.kind !== undefined &&
      isUserContractKind(contractConfig.kind) === false
    ) {
      logValidationError(
        'error',
        `Contract kind for ${referenceName} is not valid ${contractConfig.kind}`,
        [],
        cre.silent,
        cre.stream
      )
    }

    if (
      contractConfig.address !== undefined &&
      contractConfig.kind === undefined
    ) {
      logValidationError(
        'error',
        `User included an 'address' field for ${referenceName}, but did not include a 'kind' field.\nPlease include both or neither.`,
        [],
        cre.silent,
        cre.stream
      )
    } else if (
      contractConfig.address === undefined &&
      contractConfig.kind !== undefined &&
      contractConfig.kind !== 'immutable' &&
      contractConfig.kind !== 'proxy'
    ) {
      logValidationError(
        'error',
        `User included an external proxy 'kind' field for ${referenceName}, but did not include an 'address' field.\nPlease include both or neither.`,
        [],
        cre.silent,
        cre.stream
      )
    }

    if (
      contractConfig.previousBuildInfo !== undefined &&
      contractConfig.previousFullyQualifiedName === undefined
    ) {
      logValidationError(
        'error',
        `User included a 'previousBuildInfo' field in the Sphinx config file for ${contractConfig.contract}, but\ndid not include a 'previousFullyQualifiedName' field. Please include both or neither.`,
        [],
        cre.silent,
        cre.stream
      )
    } else if (
      contractConfig.previousBuildInfo === undefined &&
      contractConfig.previousFullyQualifiedName !== undefined
    ) {
      logValidationError(
        'error',
        `User included a 'previousFullyQualifiedName' field in the Sphinx config file for ${contractConfig.contract}, but\ndid not include a 'previousBuildInfo' field. Please include both or neither.`,
        [],
        cre.silent,
        cre.stream
      )
    }

    if (contractConfig.variables !== undefined) {
      // Check that all contract references in variables are valid.
      assertValidContractReferences(
        contractConfig.variables,
        validReferenceNames,
        cre
      )
    }

    if (contractConfig.constructorArgs !== undefined) {
      // Check that all contract references in constructor args are valid.
      assertValidContractReferences(
        contractConfig.constructorArgs,
        validReferenceNames,
        cre
      )
    }

    if (contractConfig.overrides !== undefined) {
      for (const override of contractConfig.overrides) {
        // Check that all contract references are valid in the constructor arg overrides.
        assertValidContractReferences(
          override.constructorArgs,
          validReferenceNames,
          cre
        )
      }
    }

    if (contractConfig.constructorArgs !== undefined) {
      // Check that the user did not use the 'preserve' keyword for constructor args.
      if (
        variableContainsKeyword(
          contractConfig.constructorArgs,
          keywords.preserve
        )
      ) {
        logValidationError(
          'error',
          `Detected the '{preserve}' keyword in the 'constructorArgs' field of your Sphinx config file. This \nkeyword can only be used in the 'variables' field. Please remove all instances of it in 'constructorArgs'.`,
          [],
          cre.silent,
          cre.stream
        )
      }
    }

    if (
      contractConfig.unsafeAllow?.flexibleConstructor === true &&
      contractConfig.kind !== 'immutable'
    ) {
      logValidationError(
        'error',
        `Detected the 'unsafeAllow.flexibleConstructor' field set to true in the Sphinx config file for proxied contract ${contractConfig.contract}. This field can only be used for non-proxied contracts. Please remove this field or set it to false.`,
        [],
        cre.silent,
        cre.stream
      )
    }

    if (contractConfig.kind !== 'immutable' && contractConfig.salt) {
      logValidationError(
        'error',
        `Detected a 'salt' field for the proxied contract ${referenceName} in the Sphinx config file. This field can only be used for non-proxied contracts.`,
        [],
        cre.silent,
        cre.stream
      )
    } else if (
      contractConfig.salt &&
      typeof contractConfig.salt !== 'string' &&
      typeof contractConfig.salt !== 'number'
    ) {
      logValidationError(
        'error',
        `The 'salt' field for ${referenceName} in the Sphinx config file must be a string or number.`,
        [],
        cre.silent,
        cre.stream
      )
    }
  }

  if (config.postDeploy) {
    for (const callAction of config.postDeploy) {
      // Check that the default address is a valid contract reference, if applicable.
      assertValidContractReferences(
        callAction.address,
        validReferenceNames,
        cre
      )
      // Check that all contract references in the address overrides are valid.
      if (callAction.addressOverrides) {
        for (const override of Object.values(callAction.addressOverrides)) {
          assertValidContractReferences(
            override.address,
            validReferenceNames,
            cre
          )
        }
      }

      // Check that all contract references are valid in the function args.
      assertValidContractReferences(
        callAction.functionArgs,
        validReferenceNames,
        cre
      )
      // Check that all contract references are valid in the function arg overrides.
      if (callAction.functionArgOverrides) {
        for (const override of Object.values(callAction.functionArgOverrides)) {
          assertValidContractReferences(override.args, validReferenceNames, cre)
        }
      }
    }
  }

  assertNoValidationErrors(failureAction)
}

const stringifyVariableType = (variable: UserConfigVariable) => {
  return Array.isArray(variable) ? 'array' : typeof variable
}

/**
 * Parses and validates the elements of an array. This function is used whenever the encoding of
 * the array is `inplace` (for fixed size arrays) or `dynamic_array`, but not `bytes`, which is
 * used for dynamic bytes and strings. Works recursively with the `parseAndValidateVariable` function.
 *
 * @param array Array to parse and validate.
 * @param storageObj Solidity compiler JSON output describing the layout for this array.
 * @param storageTypes Full list of storage types allowed.
 * @param nestedSlotOffset Not used, only included here because of the shared recursiveLayoutIterator structure.
 * @returns Array with it's elements converted into the correct type for the parsed sphinx config.
 */
export const parseArrayElements = (
  array: Array<UserConfigVariable>,
  storageObj: SolidityStorageObj,
  storageTypes: {
    [name: string]: SolidityStorageType
  },
  nestedSlotOffset: string,
  dereferencer: ASTDereferencer
): Array<ParsedConfigVariable> => {
  const elementType = getStorageType(
    storageObj.type,
    storageTypes,
    dereferencer
  ).base

  if (elementType === undefined) {
    throw new Error(
      `Could not encode array elements for: ${storageObj.label}. Please report this error to the developers, this should never happen.`
    )
  }

  // Arrays always start at a new storage slot with an offset of zero.
  const bytesOffset = 0

  // Iterate over the array and encode each element in it.
  const parsedArray: Array<ParsedConfigVariable> = []
  for (const element of array) {
    parsedArray.push(
      parseAndValidateVariable(
        element,
        {
          astId: storageObj.astId,
          contract: storageObj.contract,
          label: storageObj.label,
          offset: bytesOffset,
          slot: '0',
          type: elementType,
        },
        storageTypes,
        nestedSlotOffset,
        dereferencer
      )
    )
  }
  return parsedArray
}

/**
 * Handles parsing and validating fixed-size arrays
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceArray: VariableHandler<
  UserConfigVariable,
  Array<ParsedConfigVariable>
> = (
  props: VariableHandlerProps<UserConfigVariable, Array<ParsedConfigVariable>>
): Array<ParsedConfigVariable> => {
  const { storageObj, variable, storageTypes, nestedSlotOffset, dereferencer } =
    props

  if (!Array.isArray(variable)) {
    throw new ValidationError(
      `Expected array for ${storageObj.label} but got ${typeof variable}`
    )
  }

  // array object types come in the format: t_array(t_<type>)<size>_storage)
  // when nested, the format is repeated: t_array(t_array(t_<type>)<size>_storage)<size>_storage)
  // So to get the size of the array, we split on the ')' character, remove the first element (which is the type),
  // remove the _storage suffix, and parse the remaining element as an integer.
  let stringSizes = storageObj.type.split(')')
  stringSizes = stringSizes.map((el) => el.replace('_storage', ''))
  stringSizes.shift()
  const sizes = stringSizes.map((el) => parseInt(el, 10))

  if (sizes.length === 0) {
    throw new ValidationError(
      `Failed to parse expected array size for ${storageObj.label}, this should never happen please report this error to the developers.`
    )
  }

  if (sizes[sizes.length - 1] !== variable.length) {
    throw new ValidationError(
      `Expected array of size ${sizes[sizes.length - 1]} for ${
        storageObj.label
      } but got ${JSON.stringify(variable)}`
    )
  }

  return parseArrayElements(
    variable,
    storageObj,
    storageTypes,
    nestedSlotOffset,
    dereferencer
  )
}

/**
 * Interface for parsing addresses and contracts during variable validation.
 * Calls the generic `parseAddress` function below which has a more slimmed down interface
 * to make it usable for both variables and constructor args.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceAddress: VariableHandler<
  UserConfigVariable,
  string
> = (props: VariableHandlerProps<UserConfigVariable, string>): string => {
  const { variable, storageObj } = props

  // convert to checksum address
  return parseAddress(variable, storageObj.label)
}

/**
 * Handles parsing addresses and contracts for both variables and constructor args.
 *
 * @param variable Variable to parse.
 * @param label Label to use in error messages.
 * @returns parsed variable string
 */
const parseAddress = (variable: UserConfigVariable, label: string) => {
  if (typeof variable !== 'string') {
    throw new ValidationError(
      `invalid input type for ${label}: ${variable}, expected address string but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  if (!ethers.isAddress(variable)) {
    throw new Error(`invalid address for ${label}: ${variable}`)
  }

  // convert to checksum address
  return ethers.getAddress(variable)
}

/**
 * Interface for parsing booleans during variable validation. Calls the generic `parseAddress`
 * function below which has a more slimmed down interface to make it usable for both variables
 * and constructor args.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceBool: VariableHandler<UserConfigVariable, boolean> = (
  props: VariableHandlerProps<UserConfigVariable, boolean>
): boolean => {
  const { variable, storageObj } = props

  return parseBool(variable, storageObj.label)
}

/**
 * Handles parsing and validating booleans for both variables and constructor args.
 *
 * @param variable Variable to parse.
 * @param label Label to use in error messages.
 * @returns true or false
 */
const parseBool = (variable: UserConfigVariable, label: string) => {
  if (typeof variable !== 'boolean') {
    throw new ValidationError(
      `invalid input type for variable ${label}, expected boolean but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  return variable
}

/**
 * Interface for parsing in place bytes during variable validation. Calls the generic `parseFixedBytes`
 * function below which has a more slimmed down interface to make it usable for both variables
 * and constructor args.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceBytes: VariableHandler<UserConfigVariable, string> = (
  props: VariableHandlerProps<string, string>
): string => {
  const { variable, variableType, storageObj } = props

  return parseFixedBytes(
    variable,
    variableType.label,
    storageObj.label,
    variableType.numberOfBytes
  )
}

/**
 * Handles parsing and validating fixed size bytes for both variables and constructor args.
 *
 * @param variable Variable to parse.
 * @param label Label to use in error messages.
 * @returns DataHexString
 */
const parseFixedBytes = (
  variable: UserConfigVariable,
  variableType: string,
  label: string,
  numberOfBytes: string
) => {
  // Check that the user entered a string
  if (typeof variable !== 'string') {
    throw new ValidationError(
      `invalid input type for ${label}: ${variable}, expected DataHexString but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  if (variableType.startsWith('bytes')) {
    if (!ethers.isHexString(variable)) {
      throw new ValidationError(
        `invalid input format for variable ${label}, expected DataHexString but got ${variable}`
      )
    }

    // Check that the HexString is the correct length
    if (!ethers.isHexString(variable, Number(numberOfBytes))) {
      throw new Error(
        `invalid length for bytes${numberOfBytes} variable ${label}: ${variable}`
      )
    }
  }

  return variable
}

/**
 * Interface for parsing uints during variable validation. Calls the generic `parseUnsignedInteger`
 * function below which has a more slimmed down interface to make it usable for both
 * variables and constructor args.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceUint: VariableHandler<UserConfigVariable, string> = (
  props: VariableHandlerProps<UserConfigVariable, string>
): string => {
  const { variable, variableType, storageObj } = props

  return parseUnsignedInteger(
    variable,
    storageObj.label,
    variableType.numberOfBytes
  )
}

/**
 * Handles parsing and validating uints
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
const parseUnsignedInteger = (
  variable: UserConfigVariable,
  label: string,
  numberOfBytes: string
) => {
  if (
    typeof variable !== 'number' &&
    typeof variable !== 'string' &&
    !EthersV5BigNumber.isBigNumber(variable) &&
    // The check below is necessary because the ethers.js V5 BigNumber object is mutated by
    // Handlebars when resolving contract references.
    !(
      typeof variable === 'object' &&
      'type' in variable &&
      variable.type === 'BigNumber'
    )
  ) {
    throw new ValidationError(
      `invalid input type for variable ${label} expected number, string, or BigNumber but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  const maxValue = 2n ** (8n * BigInt(numberOfBytes)) - 1n

  try {
    if (
      remove0x(EthersV5BigNumber.from(variable).toHexString()).length / 2 >
      Number(numberOfBytes)
    ) {
      throw new Error(
        `invalid value for ${label}: ${variable}, outside valid range: [0:${maxValue}]`
      )
    }
  } catch (e) {
    if (e.message.includes('invalid BigNumber string')) {
      throw new Error(
        `invalid value for ${label}, expected a valid number but got: ${variable}`
      )
    } else {
      throw e
    }
  }

  return EthersV5BigNumber.from(variable).toString()
}

/**
 * Interface for parsing ints during variable validation. Calls the generic `parseInteger`
 * function below which has a more slimmed down interface to make it usable for both
 * variables and constructor args.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceInt: VariableHandler<UserConfigVariable, string> = (
  props: VariableHandlerProps<UserConfigVariable, string>
): string => {
  const { variable, variableType, storageObj } = props

  return parseInteger(variable, storageObj.label, variableType.numberOfBytes)
}

/**
 * Handles parsing integers for both variables and constructor args.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
const parseInteger = (
  variable: UserConfigVariable,
  label: string,
  numberOfBytes: string
) => {
  if (
    typeof variable !== 'number' &&
    typeof variable !== 'string' &&
    !EthersV5BigNumber.isBigNumber(variable) &&
    // The check below is necessary because the ethers.js V5 BigNumber object is mutated by
    // Handlebars when resolving contract references.
    !(
      typeof variable === 'object' &&
      'type' in variable &&
      variable.type === 'BigNumber'
    )
  ) {
    throw new ValidationError(
      `invalid input type for variable ${label} expected number, string, or BigNumber but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  // Calculate the minimum and maximum values of the int to ensure that the variable fits within
  // these bounds.
  const minValue = (2n ** (8n * BigInt(numberOfBytes)) / 2n) * -1n
  const maxValue = 2n ** (8n * BigInt(numberOfBytes)) / 2n - 1n

  try {
    if (
      EthersV5BigNumber.from(variable).lt(minValue) ||
      EthersV5BigNumber.from(variable).gt(maxValue)
    ) {
      throw new Error(
        `invalid value for ${label}: ${variable}, outside valid range: [${minValue}:${maxValue}]`
      )
    }
  } catch (e) {
    if (e.message.includes('invalid BigNumber string')) {
      throw new Error(
        `invalid value for ${label}, expected a valid number but got: ${variable}`
      )
    } else {
      throw e
    }
  }

  return EthersV5BigNumber.from(variable).toString()
}

/**
 * Handles parsing and validating structs
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceStruct: VariableHandler<
  UserConfigVariable,
  ParsedConfigVariables
> = (
  props: VariableHandlerProps<UserConfigVariable, ParsedConfigVariables>
): ParsedConfigVariables => {
  const {
    variable,
    variableType,
    nestedSlotOffset,
    storageTypes,
    storageObj,
    dereferencer,
  } = props

  if (typeof variable !== 'object') {
    throw new ValidationError(
      `invalid input type for variable ${
        storageObj.label
      } expected object but got ${stringifyVariableType(variable)}`
    )
  }

  // Structs are encoded recursively, as defined by their `members` field.
  const parsedVariable: ParsedConfigVariables = {}
  if (variableType.members === undefined) {
    // The Solidity compiler prevents defining structs without any members, so this should
    // never occur.
    throw new Error(
      `Could not find any members in ${variableType.label}. Should never happen.`
    )
  }
  for (const [varName, varVal] of Object.entries(variable)) {
    const memberStorageObj = variableType.members.find((member) => {
      return member.label === varName
    })
    if (memberStorageObj === undefined) {
      throw new ValidationError(
        `Extra member(s) detected in ${variableType.label}, ${storageObj.label}: ${varName}`
      )
    }
    parsedVariable[varName] = parseAndValidateVariable(
      varVal,
      memberStorageObj,
      storageTypes,
      nestedSlotOffset,
      dereferencer
    )
  }

  // Find any members missing from the struct
  const missingMembers: string[] = []
  for (const member of variableType.members) {
    if (parsedVariable[member.label] === undefined) {
      missingMembers.push(member.label)
    }
  }

  if (missingMembers.length > 0) {
    throw new ValidationError(
      `Missing member(s) in struct ${variableType.label}, ${storageObj.label}: ` +
        missingMembers.join(', ')
    )
  }

  return parsedVariable
}

/**
 * Interface for parsing dynamic bytes during variable validation. Calls the generic `parseBytes`
 * function below which has a more slimmed down interface to make it usable for both variables
 * and constructor args.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseDynamicBytes: VariableHandler<UserConfigVariable, string> = (
  props: VariableHandlerProps<UserConfigVariable, string>
): string => {
  const { variable, variableType, storageObj } = props

  return parseBytes(
    variable,
    storageObj.label,
    variableType.label,
    storageObj.offset
  )
}

/**
 * Handles parsing and validating dynamically sized bytes for both variables and constructor args.
 *
 * @param variable Variable to parse.
 * @param label Label to use in error messages.
 * @param offset Offset of the variable in the slot.
 * @returns DataHexString
 */
const parseBytes = (
  variable: UserConfigVariable,
  label: string,
  type: string,
  offset: number
) => {
  if (typeof variable !== 'string') {
    throw new ValidationError(
      `invalid input type for ${label}, expected DataHexString but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  if (type.startsWith('bytes')) {
    if (!isDataHexString(variable)) {
      throw new ValidationError(
        `invalid input type for variable ${label}, expected DataHexString but got ${variable}`
      )
    }
  }

  // The Solidity compiler uses the "bytes" encoding for strings and dynamic bytes.
  // ref: https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#bytes-and-string
  if (offset !== 0) {
    // Strings and dynamic bytes are *not* packed by Solidity.
    throw new Error(
      `Got offset for string/bytes type, should never happen. Please report this to the developers.`
    )
  }

  return variable
}

/**
 * Handles parsing and validating mappings
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseMapping: VariableHandler<
  UserConfigVariable,
  ParsedConfigVariables
> = (
  props: VariableHandlerProps<UserConfigVariable, ParsedConfigVariables>
): ParsedConfigVariables => {
  const {
    variable,
    storageObj,
    storageTypes,
    variableType,
    nestedSlotOffset,
    dereferencer,
  } = props

  // Iterate over every key/value in the mapping to get the storage slot pair for each one.
  const mapping: ParsedConfigVariables = {}
  for (const [mappingKey, mappingVal] of Object.entries(variable)) {
    const mappingValStorageObj = buildMappingStorageObj(
      storageTypes,
      variableType,
      mappingKey,
      '0x',
      storageObj,
      dereferencer
    )
    // Encode the storage slot key/value for the mapping value. Note that we set
    // `nestedSlotOffset` to '0' because it isn't used when calculating the storage slot
    // key (we already calculated the storage slot key above).
    mapping[mappingKey] = parseAndValidateVariable(
      mappingVal,
      mappingValStorageObj,
      storageTypes,
      nestedSlotOffset,
      dereferencer
    )
  }
  return mapping
}

/**
 * Handles parsing and validating dynamically-sized arrays
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseDynamicArray: VariableHandler<
  UserConfigVariable,
  Array<ParsedConfigVariable>
> = (
  props: VariableHandlerProps<UserConfigVariable, Array<ParsedConfigVariable>>
): Array<ParsedConfigVariable> => {
  const { variable, storageObj, storageTypes, nestedSlotOffset, dereferencer } =
    props

  if (!Array.isArray(variable)) {
    throw new ValidationError(
      `invalid array ${variable}, expected array but got ${typeof variable}`
    )
  }

  // For dynamic arrays, the current storage slot stores the number of elements in the array (byte
  // arrays and strings are an exception since they use the encoding 'bytes').
  const array: any[] = parseArrayElements(
    variable,
    storageObj,
    storageTypes,
    nestedSlotOffset,
    dereferencer
  )

  return array
}

/**
 * Handles parsing and validating preserved variables
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parsePreserve: VariableHandler<string, string> = (
  props: VariableHandlerProps<string, string>
): string => {
  const { variable } = props

  return variable
}

export const parseGap = (
  storageObj: SolidityStorageObj,
  variableType: SolidityStorageType
): [] => {
  if (
    variableType.encoding === 'inplace' &&
    storageObj.type.startsWith('t_array')
  ) {
    return []
  }

  throw new ValidationError(
    `invalid use of { gap } keyword, only allowed for fixed-size arrays`
  )
}

/**
 * Handles parsing and validating functions, in practice this function does nothing because
 * functions should not be defined in the Sphinx config.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns undefined
 */
export const parseFunction: VariableHandler<string, string> = (
  props: VariableHandlerProps<string, string>
): string => {
  return props.variable
}

export const handleParseOnlyKeywords = (
  storageObj: SolidityStorageObj,
  variableType: SolidityStorageType,
  keyword: Keyword
): ParsedConfigVariable => {
  switch (keyword) {
    case keywords.gap:
      return parseGap(storageObj, variableType)
    case keywords.preserve:
      return keywords.preserve
    default:
      throw Error(`parsing for keyword ${keyword} not implemented`)
  }
}

/**
 * Parses and validates a single variable. Works recursively with complex data types using the recursiveLayoutIterator.
 * See ./iterator.ts for more information on the recursive iterator pattern.
 *
 * @param variable Variable to encode as key/value slot pairs.
 * @param storageObj Solidity compiler JSON output describing the layout for this variable.
 * @param storageTypes Full list of storage types allowed for this encoding.
 * @param nestedSlotOffset Not used, only included here because of the shared recursiveLayoutIterator structure.
 * @returns Variable parsed into the format expected by the parsed sphinx config.
 */
export const parseAndValidateVariable = (
  variable: UserConfigVariable,
  storageObj: SolidityStorageObj,
  storageTypes: {
    [name: string]: SolidityStorageType
  },
  nestedSlotOffset: string,
  dereferencer: ASTDereferencer
): ParsedConfigVariable => {
  if (variable === undefined) {
    return variable
  }

  const typeHandlers: VariableHandlers<ParsedConfigVariable> = {
    inplace: {
      array: parseInplaceArray,
      address: parseInplaceAddress,
      bool: parseInplaceBool,
      bytes: parseInplaceBytes,
      uint: parseInplaceUint,
      int: parseInplaceInt,
      struct: parseInplaceStruct,
    },
    bytes: parseDynamicBytes,
    mapping: parseMapping,
    dynamic_array: parseDynamicArray,
    preserve: parsePreserve,
    function: parseFunction,
  }

  // Handle any keywords that are only used for parsing, not encoding.
  for (const keyword of Object.values(keywords)) {
    if (isKeyword(variable, keyword)) {
      const variableType = getStorageType(
        storageObj.type,
        storageTypes,
        dereferencer
      )

      return handleParseOnlyKeywords(storageObj, variableType, keyword)
    }
  }

  return recursiveLayoutIterator<ParsedConfigVariable>(
    variable,
    storageObj,
    storageTypes,
    nestedSlotOffset,
    typeHandlers,
    dereferencer
  )
}

/**
 * Parses and validates all variables in a config file.
 *
 * @param contractConfig Unparsed User-defined contract definition in a Sphinx config.
 * @param storageLayout Storage layout returned by the solidity compiler for the relevant contract.
 * @param compilerOutput Complete compiler output.
 * @returns complete set of variables parsed into the format expected by the parsed sphinx config.
 */
const parseContractVariables = (
  contractConfig: UserContractConfig,
  storageLayout: SolidityStorageLayout,
  compilerOutput: CompilerOutput,
  cre: SphinxRuntimeEnvironment
): ParsedConfigVariables => {
  const parsedConfigVariables: ParsedConfigVariables = {}

  const userConfigVariables: UserConfigVariables =
    contractConfig.variables ?? {}

  const dereferencer = astDereferencer(compilerOutput)
  const extendedLayout = extendStorageLayout(storageLayout, dereferencer)

  const parsingErrors: string[] = []
  const unnecessarilyDefinedVariables: string[] = []
  const missingVariables: string[] = []

  for (const variableName of Object.keys(userConfigVariables)) {
    const existsInLayout = extendedLayout.storage.some(
      (storageObj) => storageObj.configVarName === variableName
    )

    if (existsInLayout === false) {
      unnecessarilyDefinedVariables.push(variableName)
    }
  }

  for (const storageObj of Object.values(extendedLayout.storage)) {
    const configVarValue = userConfigVariables[storageObj.configVarName]
    if (
      configVarValue === undefined &&
      !storageObj.type.startsWith('t_function')
    ) {
      missingVariables.push(storageObj.configVarName)
    } else if (
      configVarValue !== undefined &&
      storageObj.type.startsWith('t_function')
    ) {
      parsingErrors.push(
        `Detected value for ${storageObj.configVarName} which is a function. Function variables should be ommitted from your Sphinx config.`
      )
    }

    try {
      parsedConfigVariables[storageObj.configVarName] =
        parseAndValidateVariable(
          configVarValue,
          storageObj,
          extendedLayout.types,
          '0',
          dereferencer
        )
    } catch (e) {
      parsingErrors.push((e as Error).message)
    }
  }

  if (
    parsingErrors.length > 0 ||
    unnecessarilyDefinedVariables.length > 0 ||
    missingVariables.length > 0
  ) {
    if (parsingErrors.length > 0) {
      const lines: string[] = []

      for (const error of parsingErrors) {
        lines.push(error)
      }

      logValidationError(
        'error',
        'Detected incorrectly defined variables:',
        lines,
        cre.silent,
        cre.stream
      )
    }

    if (unnecessarilyDefinedVariables.length > 0) {
      const lines: string[] = []

      for (const variable of unnecessarilyDefinedVariables) {
        lines.push(`${variable}`)
      }
      lines.push(
        `- If any of these variables are immutable, please remove their definition in the 'variables' section of the Sphinx config file and use the 'constructorArgs' field instead.`
      )
      lines.push(
        `- If any of these variables are meant to be mutable, please remove their definition in the Sphinx config file.`
      )
      lines.push(
        `- If this problem persists, delete your cache folder then try again.`
      )

      logValidationError(
        'error',
        `Detected variables defined in the Sphinx config file which do not exist in the contract ${contractConfig.contract}:`,
        lines,
        cre.silent,
        cre.stream
      )
    }

    if (missingVariables.length > 0) {
      const lines: string[] = []

      for (const variable of missingVariables) {
        lines.push(variable)
      }
      lines.push(
        '- Every variable defined in your contracts must be assigned a value in your Sphinx config file.'
      )
      lines.push(
        '- Please define the variable in your Sphinx config file then run this command again.'
      )
      lines.push(
        '- If this problem persists, delete your cache folder then try again.'
      )

      logValidationError(
        'error',
        `The following variables were defined in the contract ${contractConfig.contract} (or one of its parent contracts) but were not defined in the Sphinx config file:`,
        lines,
        cre.silent,
        cre.stream
      )
    }
  }

  return parsedConfigVariables
}

const parseArrayArg = (
  input: ethers.ParamType,
  name: string,
  argValue: UserConfigVariable,
  cre: SphinxRuntimeEnvironment
): ParsedConfigVariable[] => {
  if (!Array.isArray(argValue)) {
    throw new ValidationError(
      `Expected array for ${input.name} but got ${typeof argValue}`
    )
  }

  if (input.arrayChildren === null) {
    throw new ValidationError(
      `The 'arrayChildren' member is undefiend for the array '${input.name}'. Should never happen.`
    )
  }

  if (input.arrayLength !== -1) {
    if (argValue.length !== input.arrayLength) {
      throw new ValidationError(
        `Expected array of length ${input.arrayLength} for ${name} but got array of length ${argValue.length}`
      )
    }
  }

  const parsedValues: ParsedConfigVariable = []
  for (const element of argValue) {
    parsedValues.push(
      parseAndValidateArg(input.arrayChildren, name, element, cre)
    )
  }

  return parsedValues
}

export const parseStructArg = (
  paramType: ethers.ParamType,
  name: string,
  argValue: UserConfigVariable,
  cre: SphinxRuntimeEnvironment
) => {
  if (typeof argValue !== 'object') {
    throw new ValidationError(
      `Expected object for ${paramType.name} but got ${typeof argValue}`
    )
  }

  if (paramType.components === null) {
    throw new ValidationError(
      `The 'components' member is undefiend for the struct '${paramType.name}'. Should never happen.`
    )
  }

  const memberErrors: string[] = []
  const parsedValues: ParsedConfigVariable = {}
  for (const [key, value] of Object.entries(argValue)) {
    const inputChild = paramType.components.find((component) => {
      return component.name === key
    })
    if (inputChild === undefined) {
      memberErrors.push(`Extra member(s) in struct ${paramType.name}: ${key}`)
    } else {
      parsedValues[key] = parseAndValidateArg(
        inputChild,
        `${name}.${key}`,
        value,
        cre
      )
    }
  }

  // Find any members missing from the struct
  const missingMembers: string[] = []
  for (const member of paramType.components) {
    if (parsedValues[member.name] === undefined) {
      missingMembers.push(member.name)
    }
  }

  if (missingMembers.length > 0) {
    memberErrors.push(
      `Missing member(s) in struct ${paramType.name}: ` +
        missingMembers.join(', ')
    )
  }

  if (memberErrors.length > 0) {
    throw new ValidationError(memberErrors.join('\n'))
  }

  return parsedValues
}

const parseAndValidateArg = (
  input: ethers.ParamType,
  name: string,
  argValue: UserConfigVariable,
  cre: SphinxRuntimeEnvironment
): ParsedConfigVariable => {
  const argType = input.type
  // We fetch a new ParamType using the input type even though input is a ParamType object
  // This is b/c input is an incomplete object, so fetching the new ParamType yields
  // an object with more useful information on it
  const paramType =
    input.type === 'tuple' ? input : ethers.ParamType.from(input.type)
  if (
    paramType.baseType &&
    (paramType.baseType.startsWith('uint') ||
      paramType.baseType.startsWith('int'))
  ) {
    // Since the number of bytes is not easily accessible, we parse it from the type string.
    const suffix = argType.replace(/u?int/g, '')
    const bits = parseInt(suffix, 10)
    const numberOfBytes = bits / 8

    if (argType.startsWith('int')) {
      return parseInteger(argValue, name, numberOfBytes.toString())
    } else {
      return parseUnsignedInteger(argValue, name, numberOfBytes.toString())
    }
  } else if (paramType.baseType === 'address') {
    // if the value is a contract reference, then we don't parse it and assume it is correct given
    // that we handle validating contract references elsewhere.
    // Note that references to any proxied contracts will have already been resolved at this point,
    // so any references here will be those to no-proxied contracts which must be resolve separately
    // after we've parsed the constructor args.
    if (
      typeof argValue === 'string' &&
      argValue.startsWith('{{') &&
      argValue.endsWith('}}')
    ) {
      return argValue
    } else {
      return parseAddress(argValue, name)
    }
  } else if (paramType.baseType === 'bool') {
    return parseBool(argValue, name)
  } else if (
    paramType.baseType === 'string' ||
    paramType.baseType === 'bytes'
  ) {
    return parseBytes(argValue, name, paramType.type, 0)
  } else if (paramType.baseType && paramType.baseType.startsWith('bytes')) {
    const suffix = argType.replace(/bytes/g, '')
    const numberOfBytes = parseInt(suffix, 10).toString()

    return parseFixedBytes(argValue, argType, name, numberOfBytes)
  } else if (paramType.baseType === 'array') {
    return parseArrayArg(paramType, name, argValue, cre)
  } else if (paramType.type === 'tuple') {
    return parseStructArg(paramType, name, argValue, cre)
  } else {
    // throw or log error
    throw new ValidationError(
      `Unsupported argument type: ${paramType.type} for argument ${name}`
    )
  }
}

// TODO(md): update constructor-args.md -> chain-specific overrides b/c the user must specify all of
// their default constructor args now.

// TODO(md): the `constructor-args.md` doc should probably be named something else, since it now
// applies to function calls too. if you do this, make sure you change the file name, all reference
// to the file name, and the main readme.

// TODO(md): the supported networks in config-file.md are not up-to-date

const parseDefaultConstructorArgs = (
  fragmentLogName: string,
  cre: SphinxRuntimeEnvironment,
  userConstructorArgs: UserConfigVariables = {},
  fragment?: ethers.ConstructorFragment
): ParsedConfigVariables => {
  const fragmentInputs = fragment ? fragment.inputs : []

  const argNames = fragmentInputs
    .filter((el) => el.type !== 'function')
    .map((input) => input.name)

  const functionTypeArgs: Array<string> = []
  const incorrectDefaultArgNames = Object.keys(userConstructorArgs).filter(
    (argName) => !argNames.includes(argName)
  )
  const missingDefaultArgNames: Array<string> = []
  const inputDefaultFormatErrors: string[] = []

  const parsedDefaultArgs: ParsedConfigVariables = {}

  fragmentInputs.forEach((input) => {
    if (input.type === 'function') {
      functionTypeArgs.push(input.name)
    } else {
      const defaultArgValue = userConstructorArgs[input.name]
      if (defaultArgValue === undefined) {
        missingDefaultArgNames.push(input.name)
      } else {
        try {
          parsedDefaultArgs[input.name] = parseAndValidateArg(
            input,
            input.name,
            defaultArgValue,
            cre
          )
        } catch (e) {
          inputDefaultFormatErrors.push((e as Error).message)
        }
      }
    }
  })

  if (functionTypeArgs.length > 0) {
    logValidationError(
      'error',
      `The ${fragmentLogName} contains function type arguments, which are not allowed. Please remove the following fields:`,
      functionTypeArgs,
      cre.silent,
      cre.stream
    )
  }

  if (missingDefaultArgNames.length > 0) {
    logValidationError(
      'error',
      `The config is missing the following arguments for the ${fragmentLogName}:`,
      missingDefaultArgNames,
      cre.silent,
      cre.stream
    )
  }

  if (incorrectDefaultArgNames.length > 0) {
    logValidationError(
      'error',
      `The config contains arguments in the ${fragmentLogName} which do not exist in the contract:`,
      incorrectDefaultArgNames,
      cre.silent,
      cre.stream
    )
  }

  if (inputDefaultFormatErrors.length > 0) {
    logValidationError(
      'error',
      `The config contains incorrectly formatted arguments in the ${fragmentLogName}:`,
      inputDefaultFormatErrors,
      cre.silent,
      cre.stream
    )
  }

  return parsedDefaultArgs
}

/**
 * Parses and validates function arguments and chain-specific overrides for a single contract in a
 * config file.
 *
 * @param userContractConfig Unparsed User-defined contract definition in a Sphinx config.
 * @param referenceName Name of the contract as it appears in the Sphinx config file.
 * @param userDefaultArgs User-defined default function arguments for the contract.
 * @param fragment The fragment for the function being called. This may be undefined if the fragment
 * does not exist in the ABI.
 * @returns complete set of variables parsed into the format expected by the parsed sphinx config.
 */
export const parseFunctionOverrides = (
  fragmentLogName: string,
  networks: string[],
  cre: SphinxRuntimeEnvironment,
  parsedDefaultArgs: ParsedConfigVariables,
  userOverrides: Array<UserArgOverride> = [],
  fragment?: ethers.Fragment
): ParsedFunctionArgsPerChain => {
  const parsedArgsPerChain: ParsedFunctionArgsPerChain = {}

  const fragmentInputs = fragment ? fragment.inputs : []

  const argNames = fragmentInputs
    .filter((el) => el.type !== 'function')
    .map((input) => input.name)

  // Check if there are any variables which have ambiguous overrides (due to fields being listed multiple times for a given network)
  const ambiguousArgOverrides: {
    [key in SupportedChainId]?: {
      [name: string]: UserConfigVariable[]
    }
  } = {}

  for (const override of userOverrides) {
    for (const networkName of override.chains) {
      const overrideArgs = isUserConstructorArgOverride(override)
        ? override.constructorArgs
        : override.args

      for (const [arg, value] of Object.entries(overrideArgs)) {
        if (ambiguousArgOverrides[networkName] === undefined) {
          ambiguousArgOverrides[networkName] = {}
        }

        if (ambiguousArgOverrides[networkName]![arg] === undefined) {
          ambiguousArgOverrides[networkName]![arg] = [value]
        } else {
          ambiguousArgOverrides[networkName]![arg].push(value)
        }
      }
    }
  }

  // fill in the default values for any networks not defined in the overrides
  for (const networkName of networks) {
    if (!ambiguousArgOverrides[networkName]) {
      ambiguousArgOverrides[networkName] = {}
    }
  }

  const inputOverridesFormatErrors: string[] = []
  const incorrectOverrideArgNameErrors: string[] = []

  const ambiguousArgOutput: string[] = []
  for (const [networkName, overrides] of Object.entries(
    ambiguousArgOverrides
  )) {
    // Detect any incorrect override names
    const incorrectOverrideArgNames = Object.keys(overrides).filter(
      (argName) => !argNames.includes(argName)
    )
    incorrectOverrideArgNameErrors.push(
      ...incorrectOverrideArgNames.map(
        (name) => `${name} on network: ${networkName}`
      )
    )

    const chainId = SUPPORTED_NETWORKS[networkName]

    if (parsedArgsPerChain[chainId] === undefined) {
      parsedArgsPerChain[chainId] = {}
    }

    for (const [arg, values] of Object.entries(overrides)) {
      if (values.length > 1) {
        ambiguousArgOutput.push(
          `${arg} is defined multiple times for ${networkName}: ${values
            .map((value) => value.toString())
            .join(', ')}`
        )
      }
      const argValue = values[0]

      const fragmentInput = fragmentInputs.find((input) => input.name === arg)

      // If we can't find the input, then skip b/c this arg isn't valid anyway and will be logged
      if (!fragmentInput) {
        continue
      }

      try {
        parsedArgsPerChain[chainId][fragmentInput.name] = parseAndValidateArg(
          fragmentInput,
          fragmentInput.name,
          argValue,
          cre
        )
      } catch (e) {
        inputOverridesFormatErrors.push((e as Error).message)
      }
    }
  }

  // Fill in default values for anything not overridden.
  for (const [chainId, argOverrides] of Object.entries(parsedArgsPerChain)) {
    argNames.forEach((argName) => {
      const parsedArgValue = argOverrides[argName] ?? parsedDefaultArgs[argName]

      parsedArgsPerChain[chainId][argName] = parsedArgValue
    })
  }

  const invalidOverrideChains = userOverrides.flatMap((el) =>
    el.chains.filter(
      (name) =>
        !Object.keys(SUPPORTED_MAINNETS).includes(name) &&
        !Object.keys(SUPPORTED_TESTNETS).includes(name) &&
        !Object.keys(SUPPORTED_LOCAL_NETWORKS).includes(name)
    )
  )

  if (invalidOverrideChains && invalidOverrideChains.length > 0) {
    logValidationError(
      'error',
      `Detected invalid override network names for the ${fragmentLogName}:`,
      invalidOverrideChains,
      cre.silent,
      cre.stream
    )
  }

  if (ambiguousArgOutput.length > 0) {
    logValidationError(
      'error',
      `The config contains ambiguous argument overrides for the ${fragmentLogName}:`,
      ambiguousArgOutput,
      cre.silent,
      cre.stream
    )
  }

  if (inputOverridesFormatErrors.length > 0) {
    const lines: string[] = []

    for (const error of inputOverridesFormatErrors) {
      lines.push(error)
    }

    logValidationError(
      'error',
      `The config contains incorrectly formatted argument overrides in the ${fragmentLogName}:`,
      lines,
      cre.silent,
      cre.stream
    )
  }

  if (incorrectOverrideArgNameErrors.length > 0) {
    logValidationError(
      'error',
      `The config contains argument overrides in the ${fragmentLogName} which do not exist in the contract.\n` +
        `Allowed overrides:\n` +
        `${argNames.length > 0 ? argNames.join(', ') : 'None'}\n` +
        `Invalid overrides:`,
      incorrectOverrideArgNameErrors,
      cre.silent,
      cre.stream
    )
  }

  return parsedArgsPerChain
}

export const assertStorageCompatiblePreserveKeywords = (
  contractConfig: ParsedContractConfig,
  prevStorageLayout: StorageLayout,
  newStorageLayout: StorageLayout,
  cre: SphinxRuntimeEnvironment
) => {
  const prevDetailedLayout = getDetailedLayout(prevStorageLayout)
  const newDetailedLayout = getDetailedLayout(newStorageLayout)

  const errorMessages: Array<string> = []
  for (const newStorageObj of newDetailedLayout) {
    if (
      variableContainsKeyword(
        contractConfig.variables[newStorageObj.label],
        keywords.preserve
      )
    ) {
      const validPreserveKeyword = prevDetailedLayout.some(
        (prevObj) =>
          prevObj.label === newStorageObj.label &&
          prevObj.slot === newStorageObj.slot &&
          prevObj.offset === newStorageObj.offset &&
          isEqualType(prevObj, newStorageObj)
      )

      if (!validPreserveKeyword) {
        errorMessages.push(newStorageObj.label)
      }
    }
  }

  if (errorMessages.length > 0) {
    logValidationError(
      'error',
      'Invalid use of preserve keyword.',
      [
        'The following variables contain the preserve keyword, but do not exist in the previous',
        'storage layout at the same slot position with the same variable type. Please fix this',
        'or remove the preserve keyword from these variables:',
        ...errorMessages,
      ],
      cre.silent,
      cre.stream
    )
  }
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

    if (!validReferenceNames.includes(contractReference)) {
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

export const assertValidParsedSphinxFile = async (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts,
  cre: SphinxRuntimeEnvironment,
  contractConfigCache: ContractConfigCache,
  managerAddress: string,
  failureAction: FailureAction
): Promise<void> => {
  const { projectName } = parsedConfig
  const { compilerConfigPath } = cre

  // Check that all user-defined contract addresses have already been deployed.
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    if (
      contractConfig.isUserDefinedAddress &&
      !contractConfigCache[referenceName].isTargetDeployed
    ) {
      logValidationError(
        'error',
        `User entered a contract address that is not deployed: ${contractConfig.address}`,
        [],
        cre.silent,
        cre.stream
      )
    }
  }

  // Exit if any validation errors were detected up to this point. This ensures that all proxies are
  // deployed before we run OpenZeppelin's safety checks.
  assertNoValidationErrors(failureAction)

  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { kind, address, variables, contract, unsafeAllow } = contractConfig
    const { input, output } = configArtifacts[referenceName].buildInfo
    const { previousConfigUri, importCache, isTargetDeployed } =
      contractConfigCache[referenceName]

    if (importCache.requiresImport) {
      if (kind === 'oz-ownable-uups' || kind === 'oz-access-control-uups') {
        logValidationError(
          'error',
          `The UUPS proxy ${referenceName} at ${address} must give your SphinxManager contract\n` +
            `permission to call the 'upgradeTo' function. SphinxManager address: ${managerAddress}.\n`,
          [],
          cre.silent,
          cre.stream
        )
      } else if (
        kind === 'external-transparent' ||
        kind === 'proxy' ||
        kind === 'oz-transparent'
      ) {
        const currProxyAdmin = importCache.currProxyAdmin
        if (!currProxyAdmin) {
          throw new Error(
            `ConfigCache does not contain current admin. Should never happen.`
          )
        }

        logValidationError(
          'error',
          `The Transparent proxy ${referenceName} at ${address} is not owned by Sphinx.\n` +
            `Please import this proxy into Sphinx. Current proxy admin: ${currProxyAdmin}\n`,
          [],
          cre.silent,
          cre.stream
        )
      }
    }

    if (kind === 'immutable') {
      if (variableContainsKeyword(variables, keywords.preserve)) {
        logValidationError(
          'error',
          'Detected the "{preserve}" keyword in a fresh deployment.',
          [
            'This keyword is reserved for upgrades only. Please remove all instances of it in your Sphinx config file.',
          ],
          cre.silent,
          cre.stream
        )
      }
    } else if (isTargetDeployed) {
      const minimumCompilerInput = getMinimumCompilerInput(
        input,
        output.contracts,
        configArtifacts[referenceName].artifact.sourceName,
        configArtifacts[referenceName].artifact.contractName
      )

      const minimumCompilerOutput = getMinimumCompilerOutput(
        output,
        output.contracts,
        configArtifacts[referenceName].artifact.sourceName,
        configArtifacts[referenceName].artifact.contractName
      )

      // Run the proxy through OpenZeppelin's safety checks.
      const upgradeableContract = getOpenZeppelinUpgradableContract(
        contract,
        minimumCompilerInput,
        minimumCompilerOutput,
        contractConfig
      )

      if (upgradeableContract.errors.length > 0) {
        logValidationError(
          'error',
          `Contract ${contract} is not upgrade safe`,
          [
            new UpgradeableContractErrorReport(
              upgradeableContract.errors
            ).explain(),
          ],
          false,
          cre.stream
        )
      }

      const previousStorageLayout = await getPreviousStorageLayoutOZFormat(
        projectName,
        referenceName,
        contractConfig,
        compilerConfigPath,
        cre,
        previousConfigUri
      )

      assertStorageCompatiblePreserveKeywords(
        contractConfig,
        previousStorageLayout,
        upgradeableContract.layout,
        cre
      )

      if (unsafeAllow.skipStorageCheck !== true) {
        assertStorageUpgradeSafe(
          previousStorageLayout,
          upgradeableContract.layout,
          getOpenZeppelinValidationOpts(contractConfig)
        )
      }
    }
  }
}

export const assertValidSourceCode = (
  contractConfigs: ParsedContractConfigs,
  configArtifacts: ConfigArtifacts,
  cre: SphinxRuntimeEnvironment
) => {
  for (const [referenceName, contractConfig] of Object.entries(
    contractConfigs
  )) {
    // Get the source name and contract name from its fully qualified name
    const [sourceName, contractName] = contractConfig.contract.split(':')

    const { buildInfo } = configArtifacts[referenceName]

    const sourceUnit = buildInfo.output.sources[sourceName].ast
    const decodeSrc = srcDecoder(buildInfo.input, buildInfo.output)
    const dereferencer = astDereferencer(buildInfo.output)

    // Get the ContractDefinition node for this `contractName`. There should only be one
    // ContractDefinition since we filter by the `contractName`, which is unique within a SourceUnit.
    const childContractDefs = sourceUnit.nodes
      .filter(isNodeType('ContractDefinition'))
      .filter((contractDef: ContractDefinition) => {
        return contractDef.name === contractName
      })

    if (childContractDefs.length !== 1) {
      throw new Error(
        `Found ${childContractDefs.length} ContractDefinition nodes instead of 1 for ${contractName}. Should never happen.`
      )
    }

    const childContractDef = childContractDefs[0]

    // Get the base (i.e. parent) ContractDefinition nodes for the child contract.
    const baseContractDefs = childContractDef.linearizedBaseContracts
      .map(dereferencer('ContractDefinition'))
      // Filter out the child ContractDefinition node, which is included in `linearizedBaseContracts`
      .filter((node: ContractDefinition) => node.id !== childContractDef.id)

    // Iterate over the child ContractDefinition node and its parent ContractDefinition nodes.
    for (const contractDef of baseContractDefs.concat(childContractDef)) {
      if (!contractConfig.unsafeAllow.flexibleConstructor) {
        for (const node of contractDef.nodes) {
          if (
            isNodeType('FunctionDefinition', node) &&
            node.kind === 'constructor' &&
            node?.body?.statements
          ) {
            for (const statementNode of node.body.statements) {
              if (
                !isNodeType('ExpressionStatement', statementNode) ||
                !isNodeType('Assignment', statementNode.expression) ||
                !isNodeType(
                  'Identifier',
                  statementNode.expression.leftHandSide
                ) ||
                typeof statementNode.expression.leftHandSide
                  .referencedDeclaration !== 'number' ||
                dereferencer(
                  'VariableDeclaration',
                  statementNode.expression.leftHandSide.referencedDeclaration
                ).mutability !== 'immutable' ||
                containsFunctionCall(statementNode.expression.rightHandSide)
              ) {
                logValidationError(
                  'error',
                  `Detected an unallowed expression in the constructor at: ${decodeSrc(
                    node
                  )}.`,
                  [
                    'Only immutable variable assignments are allowed in the constructor to ensure that Sphinx',
                    'can deterministically deploy your contracts.',
                  ],
                  cre.silent,
                  cre.stream
                )
              }
            }
          } else if (isNodeType('VariableDeclaration', node)) {
            if (node.mutability === 'mutable' && node.value) {
              logValidationError(
                'error',
                `Attempted to assign a value to a non-immutable state variable '${
                  node.name
                }' at: ${decodeSrc(node)}`,
                [
                  'This is not allowed because the value will not exist in the upgradeable contract.',
                  'Please remove the value in the contract and define it in your Sphinx config file instead',
                  `Alternatively, you can also set '${node.name}' to be a constant or immutable variable.`,
                ],
                cre.silent,
                cre.stream
              )
            } else if (
              node.mutability === 'immutable' &&
              node.value &&
              containsFunctionCall(node.value)
            ) {
              logValidationError(
                'error',
                `Attempted to assign the immutable variable '${
                  node.name
                }' to the return value of a function call at: ${decodeSrc(
                  node
                )}.`,
                [
                  'This is not allowed to ensure that Sphinx is deterministic. Please remove the function call.',
                ],
                cre.silent,
                cre.stream
              )
            }
          }
        }
      }

      if (
        !contractConfig.unsafeAllow.emptyPush &&
        contractConfig.kind !== 'immutable'
      ) {
        for (const memberAccessNode of findAll('MemberAccess', contractDef)) {
          const typeIdentifier =
            memberAccessNode.expression.typeDescriptions.typeIdentifier
          const isDynamicBytesOrArray =
            typeof typeIdentifier === 'string' &&
            (typeIdentifier === 't_bytes_storage' ||
              typeIdentifier.endsWith('dyn_storage'))

          // Log an error if calling `push()` with no parameters on a dynamic array or dynamic bytes.
          if (
            isDynamicBytesOrArray &&
            memberAccessNode.memberName === 'push' &&
            memberAccessNode.argumentTypes &&
            memberAccessNode.argumentTypes.length === 0
          ) {
            logValidationError(
              'error',
              `Detected the member function 'push()' at ${decodeSrc(
                memberAccessNode
              )}.`,
              [`Please use 'push(x)' instead.`],
              cre.silent,
              cre.stream
            )
          }
        }
      }
    }
  }
}

/**
 * Returns a boolean indicating if the AST node contains a function call. This function does NOT
 * return true for casting expressions, e.g. address(0), which have a `nodeType` of `FunctionCall`.
 */
const containsFunctionCall = (node: Expression): boolean => {
  for (const childNode of findAll('FunctionCall', node)) {
    if (childNode.kind === 'functionCall') {
      return true
    }
  }
  return false
}

const logUnsafeOptions = (
  userConfig: UserSphinxConfig,
  silent: boolean,
  stream: NodeJS.WritableStream
) => {
  for (const [referenceName, contractConfig] of Object.entries(
    userConfig.contracts
  )) {
    if (!contractConfig.unsafeAllow) {
      continue
    }

    const {
      delegatecall,
      selfdestruct,
      missingPublicUpgradeTo,
      renames,
      skipStorageCheck,
    } = contractConfig.unsafeAllow

    const lines: string[] = []
    if (delegatecall) {
      lines.push(`- delegatecall`)
    }
    if (selfdestruct) {
      lines.push(`- selfdestruct`)
    }
    if (missingPublicUpgradeTo) {
      lines.push(`- missingPublicUpgradeTo`)
    }
    if (renames) {
      lines.push(`- renames`)
    }
    if (skipStorageCheck) {
      lines.push(`- skipStorageCheck`)
    }

    if (lines.length > 0) {
      sphinxLog(
        'warning',
        `Allowing the following potentially unsafe options for ${referenceName}:`,
        lines,
        silent,
        stream
      )
    }
  }
}

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
      ...contractAddresses,
    })
  )

  return { resolvedUserConfig, contractAddresses }
}

export const assertValidConstructorArgs = (
  userConfig: UserSphinxConfig,
  networks: string[],
  configArtifacts: ConfigArtifacts,
  cre: SphinxRuntimeEnvironment,
  failureAction: FailureAction
): { [referenceName: string]: ParsedConfigVariables } => {
  // We cache the compiler output, constructor args, and other artifacts so we don't have to read them multiple times.
  const cachedConstructorArgs = {}

  // Parse and validate all the constructor arguments.
  for (const [referenceName, userContractConfig] of Object.entries(
    userConfig.contracts
  )) {
    const { abi } = configArtifacts[referenceName].artifact
    const iface = new ethers.Interface(abi)

    const constructorFragment = iface.fragments.find(
      ConstructorFragment.isFragment
    )
    const fragmentLogName = `constructor of ${referenceName}`

    const parsedDefaultArgs = parseDefaultConstructorArgs(
      fragmentLogName,
      cre,
      userContractConfig.constructorArgs,
      constructorFragment
    )
    // We continue to the next contract config if the `parseDefaultConstructorArgs` above resulted
    // in any validation errors. We do this because the rest of the function assumes that the
    // default user-defined constructor arguments are valid. We don't exit the process here because
    // this allows us to display more validation errors to the user in one run of the parsing logic.
    if (validationErrors) {
      continue
    }

    const args = parseFunctionOverrides(
      fragmentLogName,
      networks,
      cre,
      parsedDefaultArgs,
      userContractConfig.overrides,
      constructorFragment
    )
    cachedConstructorArgs[referenceName] = args
  }

  // Exit if any validation errors were detected up to this point. We exit early here because invalid
  // constructor args can cause the rest of the parsing logic to fail with cryptic errors
  assertNoValidationErrors(failureAction)

  // We return the cached values so we can use them in later steps without rereading the files
  return cachedConstructorArgs
}

const assertValidContractVariables = (
  userConfig: UserSphinxConfig,
  configArtifacts: ConfigArtifacts,
  cre: SphinxRuntimeEnvironment
): { [referenceName: string]: ParsedConfigVariables } => {
  const parsedVariables: { [referenceName: string]: ParsedConfigVariables } = {}
  for (const [referenceName, userContractConfig] of Object.entries(
    userConfig.contracts
  )) {
    if (userContractConfig.kind === 'immutable') {
      if (
        userContractConfig.variables &&
        Object.entries(userContractConfig.variables).length > 0
      ) {
        logValidationError(
          'error',
          `Detected variables for contract '${referenceName}', but variables are not supported for non-proxied contracts.`,
          [],
          cre.silent,
          cre.stream
        )
      }
      parsedVariables[referenceName] = {}
    } else {
      const { artifact, buildInfo } = configArtifacts[referenceName]
      const { sourceName, contractName } = artifact

      const storageLayout = getStorageLayout(
        buildInfo.output,
        sourceName,
        contractName
      )

      const parsedContractVariables = parseContractVariables(
        userContractConfig,
        storageLayout,
        buildInfo.output,
        cre
      )

      parsedVariables[referenceName] = parsedContractVariables
    }
  }

  return parsedVariables
}

const parseContractConfigs = (
  userConfig: UserSphinxConfig,
  configArtifacts: ConfigArtifacts,
  contractReferences: { [referenceName: string]: string },
  parsedVariables: { [referenceName: string]: ParsedConfigVariables },
  cachedConstructorArgs: { [referenceName: string]: ParsedConfigVariables },
  cre: SphinxRuntimeEnvironment
): ParsedContractConfigs => {
  const contractConfigs: ParsedContractConfigs = {}

  for (const [referenceName, userContractConfig] of Object.entries(
    userConfig.contracts
  )) {
    const constructorArgs = cachedConstructorArgs[referenceName]
    // Change the `contract` fields to be a fully qualified name. This ensures that it's easy for the
    // executor to create the `ConfigArtifacts` when it eventually compiles the canonical
    // config.
    const { sourceName, contractName } = configArtifacts[referenceName].artifact
    const contractFullyQualifiedName = `${sourceName}:${contractName}`

    if (!userContractConfig.kind) {
      logValidationError(
        'error',
        `Missing contract 'kind' field for ${referenceName}`,
        [],
        cre.silent,
        cre.stream
      )
    }

    const parsedContractKind = userContractConfig.kind ?? 'proxy'

    const targetSalt = getTargetSalt(referenceName, userContractConfig.salt)

    contractConfigs[referenceName] = {
      contract: contractFullyQualifiedName,
      address: contractReferences[referenceName],
      kind: parsedContractKind,
      variables: parsedVariables[referenceName],
      constructorArgs,
      salt: targetSalt,
      unsafeAllow: userContractConfig.unsafeAllow ?? {},
      previousBuildInfo: userContractConfig.previousBuildInfo,
      previousFullyQualifiedName: userContractConfig.previousFullyQualifiedName,
      isUserDefinedAddress: !!userContractConfig.address,
    }
  }

  return contractConfigs
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

/**
 * Parses a Sphinx config file from the config file given by the user. This function is called by
 * `getParsedConfigWithOptions` and `getParsedConfig`.
 *
 * @param userConfig Unparsed config file to parse.
 * @param env Environment variables to inject into the file.
 * @return Parsed config file with template variables replaced.
 */
export const getUnvalidatedContractConfigs = (
  userConfig: UserSphinxConfig,
  networks: string[],
  configArtifacts: ConfigArtifacts,
  contractAddresses: { [referenceName: string]: string },
  cre: SphinxRuntimeEnvironment,
  failureAction: FailureAction
): ParsedContractConfigs => {
  // If the user disabled some safety checks, log warnings related to that
  logUnsafeOptions(userConfig, cre.silent, cre.stream)

  const configWithDefaultContractFields = setDefaultContractFields(userConfig)

  // Parse and validate contract constructor args
  // We also cache the parsed constructor args so we don't have to re-read them later
  const cachedConstructorArgs = assertValidConstructorArgs(
    configWithDefaultContractFields,
    networks,
    configArtifacts,
    cre,
    failureAction
  )

  // Parse and validate contract variables
  const parsedVariables = assertValidContractVariables(
    userConfig,
    configArtifacts,
    cre
  )

  const parsedContractConfigs = parseContractConfigs(
    userConfig,
    configArtifacts,
    contractAddresses,
    parsedVariables,
    cachedConstructorArgs,
    cre
  )

  assertValidSourceCode(parsedContractConfigs, configArtifacts, cre)

  return parsedContractConfigs
}

export const assertNoUpgradableContracts = (
  parsedConfig: ParsedConfig,
  cre: SphinxRuntimeEnvironment
) => {
  for (const contractConfig of Object.values(parsedConfig.contracts)) {
    if (
      contractConfig.kind !== 'immutable' &&
      process.env.SPHINX_ALLOW_UPGRADABLE_CONTRACTS !== 'true'
    ) {
      logValidationError(
        'error',
        `Detected upgradeable contract '${contractConfig.contract}', but upgradeable contracts are not officially supported yet. If you would like to use upgradable contracts please reach out to us in the Discord.`,
        [],
        cre.silent,
        cre.stream
      )
    }
  }
}

export const postParsingValidation = async (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts,
  cre: SphinxRuntimeEnvironment,
  configCache: MinimalConfigCache,
  failureAction: FailureAction
) => {
  const { blockGasLimit, contractConfigCache, chainId } = configCache
  const { contracts, manager } = parsedConfig

  assertNoUpgradableContracts(parsedConfig, cre)

  assertValidBlockGasLimit(blockGasLimit)

  assertSupportedChainId(chainId, cre)

  assertExternalContractsAreDeployed(configCache, cre)

  assertImmutableDeploymentsDoNotRevert(cre, contractConfigCache)

  if (!cre.allowUnlimitedContractSize) {
    assertContractsBelowSizeLimit(contracts, configArtifacts, cre)
  }

  assertValidDeploymentSize(contracts, cre, configCache)

  // Complete misc pre-deploy validation
  // I.e run storage slot checker + other safety checks, detect if the deployment is an upgrade, etc
  await assertValidParsedSphinxFile(
    parsedConfig,
    configArtifacts,
    cre,
    contractConfigCache,
    manager,
    failureAction
  )

  assertNoValidationErrors(failureAction)
}

/**
 * Asserts that the Sphinx config can be initiated in a single transaction.
 */
export const assertValidDeploymentSize = (
  parsedContractConfigs: ParsedContractConfigs,
  cre: SphinxRuntimeEnvironment,
  configCache: MinimalConfigCache
): void => {
  const { blockGasLimit } = configCache

  const numTargets = Object.values(parsedContractConfigs).filter(
    (contract) => contract.kind !== 'immutable'
  ).length
  const initiationGasCost = BigInt(100_000) * BigInt(numTargets)

  const costWithBuffer = (initiationGasCost * 12n) / 10n

  if (costWithBuffer > blockGasLimit) {
    logValidationError(
      'error',
      `Too many contracts in your Sphinx config.`,
      [],
      cre.silent,
      cre.stream
    )
  }
}

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

/**
 * Asserts that the contracts in the parsed config are below the contract size limit (24576 bytes).
 */
export const assertContractsBelowSizeLimit = (
  parsedContractConfigs: ParsedContractConfigs,
  configArtifacts: ConfigArtifacts,
  cre: SphinxRuntimeEnvironment
) => {
  const tooLarge: string[] = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedContractConfigs
  )) {
    const { deployedBytecode } = configArtifacts[referenceName].artifact

    const numBytes = (deployedBytecode.length - 2) / 2
    if (numBytes > CONTRACT_SIZE_LIMIT) {
      tooLarge.push(contractConfig.contract)
    }
  }

  if (tooLarge.length > 0) {
    const uniqueNames = [...new Set(tooLarge)]
    logValidationError(
      'error',
      `The following contracts are too large to be deployed on a live network:`,
      uniqueNames.map((name) => `  - ${name}`),
      cre.silent,
      cre.stream
    )
  }
}

export const assertImmutableDeploymentsDoNotRevert = (
  cre: SphinxRuntimeEnvironment,
  contractConfigCache: ContractConfigCache
): void => {
  const revertStrings: { [referenceName: string]: string } = {}

  for (const [referenceName, contractCache] of Object.entries(
    contractConfigCache
  )) {
    const { deploymentReverted, revertString } = contractCache.deploymentRevert

    if (deploymentReverted) {
      revertStrings[referenceName] = revertString
        ? `Reason: ${revertString}`.replace(
            'VM Exception while processing transaction: reverted with reason string ',
            ''
          )
        : 'No error message found.'
    }
  }

  if (
    Object.keys(revertStrings).length > 0 &&
    !process.env.SPHINX_INTERNAL__ALLOW_REVERTING_CONSTRUCTORS
  ) {
    logValidationError(
      'error',
      `The following constructors will revert:`,
      Object.entries(revertStrings).map(([referenceName, reason]) => {
        return `  - ${referenceName}. ${reason}`
      }),
      cre.silent,
      cre.stream
    )
  }
}

export const getConfigCache = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts,
  registryAddress: string,
  managerAddress: string
): Promise<ConfigCache> => {
  const block = await provider.getBlock('latest')
  if (!block) {
    throw new Error('Failed to get latest block.')
  }
  const registry = new ethers.Contract(
    registryAddress,
    SphinxRegistryABI,
    provider
  )
  const blockGasLimit = block.gasLimit
  const networkType = await getNetworkType(provider)
  const { networkName, chainId } = await resolveNetwork(
    await provider.getNetwork(),
    networkType
  )
  const isManagerDeployed_ = await registry.isManagerDeployed(managerAddress)

  const contractConfigCache: ContractConfigCache = {}
  for (const [referenceName, parsedContractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { abi, bytecode } = configArtifacts[referenceName].artifact
    const { address, constructorArgs } = parsedContractConfig
    const kind = toContractKindEnum(parsedContractConfig.kind)
    const creationCodeWithConstructorArgs = getCreationCodeWithConstructorArgs(
      bytecode,
      constructorArgs[chainId],
      abi
    )

    const isTargetDeployed = (await provider.getCode(address)) !== '0x'

    const previousConfigUri =
      isTargetDeployed && kind !== ContractKindEnum.IMMUTABLE
        ? await getPreviousConfigUri(provider, registry, address)
        : undefined

    let deploymentRevert: DeploymentRevert | undefined
    // Here we attempt to deploy non-proxy contracts. We do not attempt to deploy the implementation
    // contracts behind proxies because we check that they have deterministic constructors elsewhere
    // (in `assertValidSourceCode`).
    if (kind === ContractKindEnum.IMMUTABLE) {
      try {
        // Attempt to estimate the gas of the deployment.
        await provider.estimateGas({
          from: managerAddress,
          data: creationCodeWithConstructorArgs,
        })
      } catch (e) {
        // This should only throw an error if the constructor reverts.
        deploymentRevert = {
          deploymentReverted: true,
          revertString: e.message,
        }
      }
    }

    let importCache: ImportCache | undefined
    if (isTargetDeployed) {
      if (
        kind === ContractKindEnum.OZ_OWNABLE_UUPS ||
        kind === ContractKindEnum.OZ_ACCESS_CONTROL_UUPS
      ) {
        // We must manually check that the SphinxManager can call the UUPS proxy's `upgradeTo`
        // function because OpenZeppelin UUPS proxies can implement arbitrary access control
        // mechanisms.
        const managerVoidSigner = new ethers.VoidSigner(
          managerAddress,
          provider
        )
        const UUPSProxy = new ethers.Contract(
          address,
          ProxyABI,
          managerVoidSigner
        )
        try {
          // Attempt to staticcall the `upgradeTo` function on the proxy from the
          // SphinxManager's address. Note that it's necessary for us to set the proxy's
          // implementation to an OpenZeppelin UUPS ProxyUpdater contract to ensure that:
          // 1. The new implementation is deployed on every network. Otherwise, the call will revert
          //    due to this check:
          //    https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/ERC1967/ERC1967Upgrade.sol#L44
          // 2. The new implementation has a public `proxiableUUID()` function. Otherwise, the call
          //    will revert due to this check:
          //    https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/dd8ca8adc47624c5c5e2f4d412f5f421951dcc25/contracts/proxy/ERC1967/ERC1967UpgradeUpgradeable.sol#L91
          await UUPSProxy.upgradeTo.staticCall(OZ_UUPS_UPDATER_ADDRESS)
        } catch (e) {
          // The SphinxManager does not have permission to call the `upgradeTo` function on the
          // UUPS proxy, which means the user must grant it permission via whichever access control
          // mechanism the UUPS proxy uses.
          importCache = {
            requiresImport: true,
            // We leave the `currProxyAdmin` blank because the UUPS proxy may use AccessControl,
            // which prevents us from knowing which permission the SphinxManager needs to
            // call the 'upgradeTo' function.
          }
        }
      } else if (
        kind === ContractKindEnum.EXTERNAL_DEFAULT ||
        kind === ContractKindEnum.INTERNAL_DEFAULT ||
        kind === ContractKindEnum.OZ_TRANSPARENT
      ) {
        // Check that the SphinxManager is the owner of the Transparent proxy.
        const currProxyAdmin = await getEIP1967ProxyAdminAddress(
          provider,
          address
        )

        if (currProxyAdmin !== managerAddress) {
          importCache = {
            requiresImport: true,
            currProxyAdmin,
          }
        }
      }
    }

    contractConfigCache[referenceName] = {
      isTargetDeployed,
      deploymentRevert: deploymentRevert ?? {
        deploymentReverted: false,
      },
      importCache: importCache ?? {
        requiresImport: false,
      },
      previousConfigUri,
    }
  }

  const postDeployActions: Array<ParsedCallAction> =
    parsedConfig.postDeploy[chainId] ?? []

  // Get an array of undeployed external contracts.
  const undeployedExternalContracts: Array<string> = []
  const uniquePostDeployAddresses = Array.from(
    new Set(postDeployActions.map((e) => e.to))
  )
  for (const address of uniquePostDeployAddresses) {
    const isExternalAddress =
      findReferenceNameForAddress(address, parsedConfig.contracts) === undefined

    if (isExternalAddress && (await provider.getCode(address)) === '0x') {
      undeployedExternalContracts.push(address)
    }
  }

  const SphinxManager = new ethers.Contract(
    managerAddress,
    SphinxManagerABI,
    provider
  )

  // Get a mapping of call hashes to their current nonces. We'll use this later to determine which
  // call actions to skip in the deployment, if any.
  const callNonces: { [callHash: string]: number } = {}
  for (const callAction of postDeployActions) {
    const { to, data } = callAction
    const callHash = getCallHash(to, data)
    if (!isManagerDeployed_) {
      callNonces[callHash] = 0
    } else {
      const currentNonce = await SphinxManager.callNonces(callHash)
      callNonces[callHash] = currentNonce
    }
  }

  return {
    isManagerDeployed: isManagerDeployed_,
    chainId,
    networkType,
    blockGasLimit,
    networkName,
    contractConfigCache,
    callNonces,
    undeployedExternalContracts,
  }
}

const assertNoValidationErrors = (failureAction: FailureAction): void => {
  if (validationErrors) {
    if (failureAction === FailureAction.EXIT) {
      process.exit(1)
    } else if (failureAction === FailureAction.THROW) {
      throw new ValidationError('')
    }
  }
}

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
export const getPreviousStorageLayoutOZFormat = async (
  projectName: string,
  referenceName: string,
  parsedContractConfig: ParsedContractConfig,
  compilerConfigFolderPath: string,
  cre: SphinxRuntimeEnvironment,
  previousConfigUri?: string
): Promise<StorageLayout> => {
  const prevCompilerConfig = previousConfigUri
    ? await fetchAndCacheCompilerConfig(
        previousConfigUri,
        compilerConfigFolderPath
      )
    : undefined

  const { previousFullyQualifiedName, previousBuildInfo } = parsedContractConfig
  if (
    previousFullyQualifiedName !== undefined &&
    previousBuildInfo !== undefined
  ) {
    const { input, output } = readBuildInfo(previousBuildInfo)

    if (prevCompilerConfig !== undefined) {
      logValidationError(
        'warning',
        `Using the "previousBuildInfo" and "previousFullyQualifiedName" field to get the storage layout for\n` +
          `the contract: ${referenceName}. If you'd like to use the storage layout from your most recent\n` +
          `Sphinx deployment instead, please remove these two fields from your Sphinx config file.`,
        [],
        cre.silent,
        cre.stream
      )
    }

    return getOpenZeppelinUpgradableContract(
      previousFullyQualifiedName,
      input,
      output,
      parsedContractConfig
    ).layout
  } else if (prevCompilerConfig !== undefined) {
    const prevConfigArtifacts = await getConfigArtifactsRemote(
      prevCompilerConfig
    )
    const { buildInfo, artifact } = prevConfigArtifacts[referenceName]
    const { sourceName, contractName } = artifact
    return getOpenZeppelinUpgradableContract(
      `${sourceName}:${contractName}`,
      buildInfo.input,
      buildInfo.output,
      parsedContractConfig
    ).layout
    // TODO(upgrades): uncomment when we enable importing OpenZeppelin contracts
    // } else if (cre.hre !== undefined && isOpenZeppelinContractKind(kind)) {
    //   const openzeppelinStorageLayout = await cre.importOpenZeppelinStorageLayout(
    //     cre.hre,
    //     parsedContractConfig
    //   )
    //   return openzeppelinStorageLayout
  } else {
    throw new Error(
      `Could not find the previous storage layout for the contract: ${referenceName}. Please include\n` +
        `a "previousBuildInfo" and "previousFullyQualifiedName" field for this contract in your Sphinx config file.`
    )
  }
}

export const assertValidConfigOptions = (
  options: UserConfigOptions,
  cre: SphinxRuntimeEnvironment,
  failureAction: FailureAction
): void => {
  const { mainnets, testnets, orgId, owners, ownerThreshold, proposers } =
    options

  if (orgId === '') {
    logValidationError(
      'error',
      `The 'orgId' cannot be an empty string.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  if (ownerThreshold === 0) {
    logValidationError(
      'error',
      `The 'ownerThreshold' must be greater than 0.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  if (ownerThreshold > owners.length) {
    logValidationError(
      'error',
      `The 'ownerThreshold' must be less than or equal to the number of owners.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  const duplicatedOwners = getDuplicateElements(owners)
  const duplicatedProposers = getDuplicateElements(proposers)
  const duplicatedNetworks = getDuplicateElements(mainnets)
  const duplicatedTestnets = getDuplicateElements(testnets)
  if (duplicatedOwners.length > 0) {
    logValidationError(
      'error',
      `The following owners are duplicated:`,
      duplicatedOwners,
      cre.silent,
      cre.stream
    )
  }
  if (duplicatedProposers.length > 0) {
    logValidationError(
      'error',
      `The following proposers are duplicated:`,
      duplicatedProposers,
      cre.silent,
      cre.stream
    )
  }
  if (duplicatedNetworks.length > 0) {
    logValidationError(
      'error',
      `The following networks are duplicated:`,
      duplicatedNetworks,
      cre.silent,
      cre.stream
    )
  }
  if (duplicatedTestnets.length > 0) {
    logValidationError(
      'error',
      `The following testnets are duplicated:`,
      duplicatedTestnets,
      cre.silent,
      cre.stream
    )
  }

  const invalidOwnerAddresses = owners.filter(
    (address) => !ethers.isAddress(address)
  )
  const invalidProposerAddresses = proposers.filter(
    (address) => !ethers.isAddress(address)
  )
  const invalidMainnets = mainnets.filter(
    (network) => !SUPPORTED_MAINNETS[network]
  )
  const invalidTestnets = testnets.filter(
    (testnet) => !SUPPORTED_TESTNETS[testnet]
  )
  if (invalidOwnerAddresses.length > 0) {
    logValidationError(
      'error',
      `The following owners are not valid addresses:`,
      invalidOwnerAddresses,
      cre.silent,
      cre.stream
    )
  }
  if (invalidProposerAddresses.length > 0) {
    logValidationError(
      'error',
      `The following proposers are not valid addresses:`,
      invalidProposerAddresses,
      cre.silent,
      cre.stream
    )
  }
  if (invalidMainnets.length > 0) {
    logValidationError(
      'error',
      `The following networks in your Sphinx config are not supported: ${invalidMainnets.join(
        ', '
      )}.\nSupported networks are:`,
      Object.keys(SUPPORTED_MAINNETS).map((n) => `- ${n}`),
      cre.silent,
      cre.stream
    )
  }
  if (invalidTestnets.length > 0) {
    logValidationError(
      'error',
      `The following testnets in your Sphinx config are not supported: ${invalidTestnets.join(
        ', '
      )}.\nSupported testnets are:`,
      Object.keys(SUPPORTED_TESTNETS).map((n) => `- ${n}`),
      cre.silent,
      cre.stream
    )
  }

  if (proposers.length === 0) {
    logValidationError(
      'error',
      `There must be at least one proposer or manager.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  if (mainnets.length === 0 && testnets.length === 0) {
    logValidationError(
      'error',
      `There must be at least one network or testnet in your Sphinx config.`,
      [],
      cre.silent,
      cre.stream
    )
  }

  assertNoValidationErrors(failureAction)
}

export const parseConfigOptions = (
  options: UserConfigOptions,
  isTestnet: boolean
): ParsedConfigOptions => {
  const { mainnets, testnets, orgId, ownerThreshold } = options

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
    proposers,
  }
}

/**
 * @notice Parses the post-deployment actions in the Sphinx config file. Note that
 * contract references have already been resolved before calling this function.
 */
export const parsePostDeploymentActions = (
  userActions: Array<UserCallAction>,
  contractConfigs: ParsedContractConfigs,
  networks: Array<string>,
  configArtifacts: ConfigArtifacts,
  cre: SphinxRuntimeEnvironment,
  failureAction: FailureAction
): ParsedCallActionsPerChain => {
  const parsedActionsPerChain: ParsedCallActionsPerChain = {}
  for (const network of networks) {
    const callNonces: { [payload: string]: number } = {}

    // We'll attempt to parse every call action even if an error is caught midway. This allows us to
    // display more validation errors to the user in one run of the parsing logic. If any validation
    // errors are caught, we'll exit immediately after this loop.
    for (const callAction of userActions) {
      // Contract reference was already resolved before this function, so we know that this will
      // return an address.
      const address = getCallActionAddressForNetwork(network, callAction)

      const referenceName = findReferenceNameForAddress(
        address,
        contractConfigs
      )

      let abi: Array<any>
      if (callAction.abi) {
        abi = callAction.abi
      } else {
        if (referenceName) {
          abi = configArtifacts[referenceName].artifact.abi
        } else {
          logValidationError(
            'error',
            externalContractMustIncludeAbi(address),
            [],
            cre.silent,
            cre.stream
          )
          // We continue to the next action because the rest of this logic won't work properly if
          // there isn't a valid ABI.
          continue
        }
      }

      // This is used for logging purposes only. It's a convenient way to share error messages
      // between logic that handles constructor and function calls.
      const functionLogName = referenceName
        ? `function '${referenceName}.${callAction.functionName}'`
        : `function '${callAction.functionName}' at ${address}`

      const iface = new ethers.Interface(abi)

      try {
        iface.encodeFunctionData(
          callAction.functionName,
          callAction.functionArgs
        )
      } catch (e) {
        logValidationError(
          'error',
          failedToEncodeFunctionCall(e.message, callAction, referenceName),
          [],
          cre.silent,
          cre.stream
        )

        continue // TODO(docs): we continue b/c the rest of this function won't work properly without a valid default function call
      }

      // TODO(docs)
      const fragment = iface.getFunction(
        callAction.functionName,
        callAction.functionArgs
      )
      // We check for the null case to narrow the TypeScript type. The fragment should never be null
      // since we already successfully encoded the function data above.
      if (fragment === null) {
        logValidationError(
          'error',
          `Failed to get the fragment for the ${functionLogName}. Should never happen.`,
          [],
          cre.silent,
          cre.stream
        )
        continue
      }

      const functionTypeArgs: Array<string> = []
      const incorrectlyFormattedArgs: Array<string> = []
      const parsedDefaultArgs: ParsedConfigVariables = {}
      fragment.inputs.forEach((input, index) => {
        if (input.type === 'function') {
          functionTypeArgs.push(input.name)
        } else {
          const defaultArgValue = callAction.functionArgs[index]
          // TODO(docs): this will catch any variables that are correctly formatted in ethers,
          // but incorrectly formatted in sphinx
          try {
            parsedDefaultArgs[input.name] = parseAndValidateArg(
              input,
              input.name,
              defaultArgValue,
              cre
            )
          } catch (e) {
            incorrectlyFormattedArgs.push(e.message)
          }
        }
      })

      if (functionTypeArgs.length > 0) {
        logValidationError(
          'error',
          functionTypeArgumentsAreNotAllowed(functionLogName),
          functionTypeArgs,
          cre.silent,
          cre.stream
        )
      }

      // TODO(docs): include link to constructor-args.md, since this is the error array that catches params valid in ethers but not sphinx
      if (incorrectlyFormattedArgs.length > 0) {
        logValidationError(
          'error',
          `The config contains incorrectly formatted arguments in the ${functionLogName}:`,
          incorrectlyFormattedArgs,
          cre.silent,
          cre.stream
        )
      }

      // TODO(docs): the rest of the function relies on the parsed default params being correct, so we
      // continue to the next action if any validation errors have occurred.
      if (validationErrors) {
        continue
      }

      const argsPerChain = parseFunctionOverrides(
        functionLogName,
        [network], // TODO(docs)
        cre,
        parsedDefaultArgs,
        callAction.functionArgOverrides,
        fragment
      )

      // TODO(docs): the rest of the function relies on the parsed overridden params being correct,
      // so we continue to the next action if any validation errors occurred in the previous call.
      if (validationErrors) {
        continue
      }

      const chainId = SUPPORTED_NETWORKS[network]
      const parsedArgs: ParsedConfigVariables = argsPerChain[chainId]

      const argValues = getFunctionArgValueArray(parsedArgs, fragment)

      const data = iface.encodeFunctionData(callAction.functionName, argValues)

      const payload = ethers.concat([address, data])

      const nonce = callNonces[payload] ?? 0

      const parsedAction = {
        to: address,
        data,
        nonce,
      }

      const parsedActions: Array<ParsedCallAction> | undefined =
        parsedActionsPerChain[chainId]

      if (parsedActions) {
        parsedActions.push(parsedAction)
      } else {
        parsedActionsPerChain[chainId] = [parsedAction]
      }

      // Update the salt.
      callNonces[payload] = nonce + 1
    }
  }

  assertNoValidationErrors(failureAction)

  return parsedActionsPerChain
}

/**
 * @notice This function assumes that the contract references in the post-deployment actions have
 * already been validated and parsed into addresses.
 */
export const assertValidPostDeploymentActions = (
  postDeployActions: Array<UserCallAction>,
  contractConfigs: ParsedContractConfigs,
  failureAction: FailureAction,
  cre: SphinxRuntimeEnvironment
) => {
  for (const action of postDeployActions) {
    // First, we TODO(docs): validate the fields that were passed into the Contract constructor.

    if (!ethers.isAddress(action.address)) {
      logValidationError(
        'error',
        // TODO(docs): we know that the user explicitly specified an address and not a contract
        // reference because we would've already thrown an error for an invalid contract reference
        // earlier in the parsing logic.
        contractInstantiatedWithInvalidAddress(action.address),
        [],
        cre.silent,
        cre.stream
      )
      // We continue to the next action because the rest of this function relies on the address
      // being valid.
      continue
    }

    const referenceName = findReferenceNameForAddress(
      action.address,
      contractConfigs
    )

    if (action.abi) {
      try {
        action.abi.forEach((fragment) => ethers.Fragment.from(fragment))
      } catch (e) {
        logValidationError(
          'error',
          contractInstantiatedWithInvalidAbi(
            e.message,
            action.address,
            referenceName
          ),
          [],
          cre.silent,
          cre.stream
        )
      }
    }

    const allNetworkNamesForAddressOverrides: Array<string> = []
    if (action.addressOverrides) {
      action.addressOverrides.forEach((override) =>
        allNetworkNamesForAddressOverrides.push(...override.chains)
      )
    }

    const invalidNetworksForAddressOverrides =
      allNetworkNamesForAddressOverrides.filter(
        (network) => !SUPPORTED_NETWORKS[network]
      )

    if (invalidNetworksForAddressOverrides.length > 0) {
      logValidationError(
        'error',
        contractInstantiatedWithInvalidNetworkOverrides(
          invalidNetworksForAddressOverrides,
          action.address,
          referenceName
        ),
        [],
        cre.silent,
        cre.stream
      )
    }

    const duplicatedNetworks = getDuplicateElements(
      allNetworkNamesForAddressOverrides
    )
    if (duplicatedNetworks.length > 0) {
      logValidationError(
        'error',
        contractInstantiatedWithDuplicatedNetworkOverrides(
          action.address,
          referenceName
        ),
        duplicatedNetworks,
        cre.silent,
        cre.stream
      )
    }

    const invalidAddressOverrides = []
    if (action.addressOverrides) {
      for (const override of action.addressOverrides) {
        if (!ethers.isAddress(override.address)) {
          invalidAddressOverrides.push(override.address)
        }
      }
    }

    if (invalidAddressOverrides.length > 0) {
      logValidationError(
        'error',
        // TODO(docs): contract references were validated + parsed in a previous step
        contractInstantiatedWithInvalidOverridingAddresses(
          action.address,
          referenceName
        ),
        invalidAddressOverrides,
        cre.silent,
        cre.stream
      )
    }
  }

  assertNoValidationErrors(failureAction)
}

const assertExternalContractsAreDeployed = (
  configCache: MinimalConfigCache,
  cre: SphinxRuntimeEnvironment
): void => {
  if (configCache.undeployedExternalContracts.length > 0) {
    logValidationError(
      'error',
      externalContractsMustBeDeployed(configCache.chainId),
      configCache.undeployedExternalContracts,
      cre.silent,
      cre.stream
    )
  }
}
