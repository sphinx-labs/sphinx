/* Imports: External */
import * as path from 'path'

import * as Handlebars from 'handlebars'
import { BigNumber, ethers, providers } from 'ethers'
import { astDereferencer, ASTDereferencer } from 'solidity-ast/utils'
import { CompilerOutput } from 'hardhat/types'
import { remove0x } from '@eth-optimism/core-utils'
import { Fragment } from 'ethers/lib/utils'
import {
  assertStorageUpgradeSafe,
  StorageLayout,
} from '@openzeppelin/upgrades-core'
import { OZ_UUPS_UPDATER_ADDRESS, ProxyABI } from '@chugsplash/contracts'
import { getDetailedLayout } from '@openzeppelin/upgrades-core/dist/storage/layout'
import yesno from 'yesno'
import { ContractDefinition } from 'solidity-ast'

import {
  ArtifactPaths,
  SolidityStorageLayout,
  SolidityStorageObj,
  SolidityStorageType,
} from '../languages/solidity/types'
import {
  getDefaultProxyAddress,
  isExternalProxyType,
  readContractArtifact,
  assertValidContractReferences,
  readBuildInfo,
  getChugSplashManagerProxyAddress,
  getEIP1967ProxyAdminAddress,
  getPreviousStorageLayoutOZFormat,
  getOpenZeppelinStorageLayout,
  isEqualType,
  getOpenZeppelinValidationOpts,
  getParentContractASTNodes,
} from '../utils'
import {
  UserChugSplashConfig,
  ParsedChugSplashConfig,
  ProxyType,
  ParsedConfigVariable,
  UserContractConfig,
  UserConfigVariable,
  UserConfigVariables,
  ParsedConfigVariables,
  ParsedContractConfig,
} from './types'
import { Integration } from '../constants'
import {
  variableContainsPreserveKeyword,
  getStorageType,
  extendStorageLayout,
} from '../languages'
import {
  recursiveLayoutIterator,
  VariableHandlers,
  VariableHandler,
  VariableHandlerProps,
  buildMappingStorageObj,
} from '../languages/solidity/iterator'
import { ChugSplashRuntimeEnvironment } from '../types'

class InputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InputError'
  }
}

/**
 * Reads a ChugSplash config file and completes full parsing and validation on it.
 *
 * @param configPath Path to the ChugSplash config file.
 * @returns The parsed ChugSplash config file.
 */
export const readValidatedChugSplashConfig = async (
  provider: providers.Provider,
  configPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
): Promise<ParsedChugSplashConfig> => {
  const userConfig = await readUnvalidatedChugSplashConfig(configPath)
  return parseAndValidateChugSplashConfig(
    provider,
    userConfig,
    artifactPaths,
    integration,
    cre
  )
}

export const readUnvalidatedChugSplashConfig = async (
  configPath: string
): Promise<UserChugSplashConfig> => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  let config
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let exported = require(path.resolve(configPath))
  exported = exported.default || exported
  if (typeof exported === 'function') {
    config = await exported()
  } else if (typeof exported === 'object') {
    config = exported
  } else {
    throw new Error(
      'Config file must export either a config object, or a function which resolves to one.'
    )
  }
  return config
}

export const isEmptyChugSplashConfig = (configFileName: string): boolean => {
  delete require.cache[require.resolve(path.resolve(configFileName))]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.resolve(configFileName))
  return Object.keys(config).length === 0
}

/**
 * Validates a ChugSplash config file.
 *
 * @param config Config file to validate.
 */
export const assertValidUserConfigFields = (config: UserChugSplashConfig) => {
  if (config.contracts === undefined) {
    throw new Error('contracts field must be defined in ChugSplash config')
  }

  const referenceNames: string[] = Object.keys(config.contracts)

  for (const [referenceName, contractConfig] of Object.entries(
    config.contracts
  )) {
    // Block people from accidentally using templates in contract names.
    if (referenceName.includes('{') || referenceName.includes('}')) {
      throw new Error(
        `cannot use template strings in reference names: ${referenceName}`
      )
    }

    // Block people from accidentally using templates in contract names.
    if (
      contractConfig.contract.includes('{') ||
      contractConfig.contract.includes('}')
    ) {
      throw new Error(
        `cannot use template strings in contract names: ${contractConfig.contract}`
      )
    }

    // Make sure addresses are fixed and are actually addresses.
    if (
      contractConfig.externalProxy !== undefined &&
      !ethers.utils.isAddress(contractConfig.externalProxy)
    ) {
      throw new Error(
        `external proxy address is not a valid address: ${contractConfig.externalProxy}`
      )
    }

    // Make sure that the external proxy type is valid.
    if (
      contractConfig.externalProxyType !== undefined &&
      isExternalProxyType(contractConfig.externalProxyType) === false
    ) {
      throw new Error(
        `External proxy type is not valid: ${contractConfig.externalProxyType}`
      )
    }

    // The user must include both an `externalProxy` and `externalProxyType` field, or neither.
    if (
      contractConfig.externalProxy !== undefined &&
      contractConfig.externalProxyType === undefined
    ) {
      throw new Error(
        `User included an 'externalProxy' field for ${contractConfig.contract} in ${config.options.projectName},\n` +
          `but did not include an 'externalProxyType' field. Please include both or neither.`
      )
    } else if (
      contractConfig.externalProxy === undefined &&
      contractConfig.externalProxyType !== undefined
    ) {
      throw new Error(
        `User included an 'externalProxyType' field for ${contractConfig.contract} in ${config.options.projectName},\n` +
          `but did not include an 'externalProxy' field. Please include both or neither.`
      )
    }

    if (
      contractConfig.previousBuildInfo !== undefined &&
      contractConfig.previousFullyQualifiedName === undefined
    ) {
      throw new Error(
        `User included a 'previousBuildInfo' field in the ChugSplash config file for ${contractConfig.contract}, but\n` +
          `did not include a 'previousFullyQualifiedName' field. Please include both or neither.`
      )
    } else if (
      contractConfig.previousBuildInfo === undefined &&
      contractConfig.previousFullyQualifiedName !== undefined
    ) {
      throw new Error(
        `User included a 'previousFullyQualifiedName' field in the ChugSplash config file for ${contractConfig.contract}, but\n` +
          `did not include a 'previousBuildInfo' field. Please include both or neither.`
      )
    }

    if (contractConfig.variables !== undefined) {
      // Check that all contract references are valid.
      assertValidContractReferences(contractConfig.variables, referenceNames)
    }

    if (contractConfig.constructorArgs !== undefined) {
      // Check that the user did not use the 'preserve' keyword for constructor args.
      if (variableContainsPreserveKeyword(contractConfig.constructorArgs)) {
        throw new Error(
          `Detected the '{preserve}' keyword in the 'constructorArgs' field of your ChugSplash config file. This \n` +
            `keyword can only be used in the 'variables' field. Please remove all instances of it in 'constructorArgs'.`
        )
      }
    }
  }
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
 * @returns Array with it's elements converted into the correct type for the parsed chugsplash config.
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
    throw new InputError(
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
    throw new InputError(
      `Failed to parse expected array size for ${storageObj.label}, this should never happen please report this error to the developers.`
    )
  }

  if (
    sizes[sizes.length - 1] !== variable.length &&
    storageObj.label !== '__gap'
  ) {
    throw new InputError(
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
 * Handles encoding an addresses and contracts.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceAddress: VariableHandler<
  UserConfigVariable,
  string
> = (props: VariableHandlerProps<UserConfigVariable, string>): string => {
  const { variable, storageObj } = props

  if (typeof variable !== 'string') {
    throw new InputError(
      `invalid input type for ${
        storageObj.label
      }: ${variable}, expected address string but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  if (!ethers.utils.isAddress(variable)) {
    throw new Error(`invalid address for ${storageObj.label}: ${variable}`)
  }

  // convert to checksum address
  return ethers.utils.getAddress(variable)
}

/**
 * Handles parsing and validating booleans.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceBool: VariableHandler<UserConfigVariable, boolean> = (
  props: VariableHandlerProps<UserConfigVariable, boolean>
): boolean => {
  const { variable, storageObj } = props

  if (typeof variable !== 'boolean') {
    throw new InputError(
      `invalid input type for variable ${
        storageObj.label
      }, expected boolean but got ${stringifyVariableType(variable)}`
    )
  }

  return variable
}

/**
 * Handles parsing and validating fixed size bytes
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceBytes: VariableHandler<UserConfigVariable, string> = (
  props: VariableHandlerProps<string, string>
): string => {
  const { variable, variableType, storageObj } = props

  // Check that the user entered a string
  if (typeof variable !== 'string') {
    throw new InputError(
      `invalid input type for ${
        storageObj.label
      }: ${variable}, expected DataHexString but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  if (variableType.label.startsWith('bytes')) {
    // hexDataLength returns null if the input is not a valid hex string.
    if (ethers.utils.hexDataLength(variable) === null) {
      throw new InputError(
        `invalid input format for variable ${storageObj.label}, expected DataHexString but got ${variable}`
      )
    }

    // Check that the DataHexString is the correct length
    if (!ethers.utils.isHexString(variable, variableType.numberOfBytes)) {
      throw new Error(
        `invalid length for bytes${variableType.numberOfBytes} variable ${storageObj.label}: ${variable}`
      )
    }
  }

  return variable
}

/**
 * Handles parsing and validating uints
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceUint: VariableHandler<UserConfigVariable, string> = (
  props: VariableHandlerProps<UserConfigVariable, string>
): string => {
  const { variable, variableType, storageObj } = props

  if (
    typeof variable !== 'number' &&
    typeof variable !== 'string' &&
    !(
      typeof variable === 'object' &&
      'type' in variable &&
      variable.type === 'BigNumber'
    )
  ) {
    throw new InputError(
      `invalid input type for variable ${
        storageObj.label
      } expected number, string, or BigNumber but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  const maxValue = BigNumber.from(2)
    .pow(8 * variableType.numberOfBytes)
    .sub(1)

  if (
    remove0x(BigNumber.from(variable).toHexString()).length / 2 >
    variableType.numberOfBytes
  ) {
    throw new Error(
      `invalid value for ${storageObj.label}: ${variable}, outside valid range: [0:${maxValue}]`
    )
  }

  return BigNumber.from(variable).toString()
}

/**
 * Handles parsing and validating ints
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceInt: VariableHandler<UserConfigVariable, string> = (
  props: VariableHandlerProps<UserConfigVariable, string>
): string => {
  const { variable, variableType, storageObj } = props

  if (
    typeof variable !== 'number' &&
    typeof variable !== 'string' &&
    !(
      typeof variable === 'object' &&
      'type' in variable &&
      variable.type === 'BigNumber'
    )
  ) {
    throw new InputError(
      `invalid input type for variable ${
        storageObj.label
      } expected number, string, or BigNumber but got ${stringifyVariableType(
        variable
      )}`
    )
  }

  // Calculate the minimum and maximum values of the int to ensure that the variable fits within
  // these bounds.
  const minValue = BigNumber.from(2)
    .pow(8 * variableType.numberOfBytes)
    .div(2)
    .mul(-1)
  const maxValue = BigNumber.from(2)
    .pow(8 * variableType.numberOfBytes)
    .div(2)
    .sub(1)
  if (
    BigNumber.from(variable).lt(minValue) ||
    BigNumber.from(variable).gt(maxValue)
  ) {
    throw new Error(
      `invalid value for ${storageObj.label}: ${variable}, outside valid range: [${minValue}:${maxValue}]`
    )
  }

  return BigNumber.from(variable).toString()
}

/**
 * Handles parsing and validating structs
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceStruct: VariableHandler<
  UserConfigVariable,
  {
    [name: string]: ParsedConfigVariable
  }
> = (
  props: VariableHandlerProps<
    UserConfigVariable,
    {
      [name: string]: ParsedConfigVariable
    }
  >
): {
  [name: string]: ParsedConfigVariable
} => {
  const {
    variable,
    variableType,
    nestedSlotOffset,
    storageTypes,
    storageObj,
    dereferencer,
  } = props

  if (typeof variable !== 'object') {
    throw new InputError(
      `invalid input type for variable ${
        storageObj.label
      } expected object but got ${stringifyVariableType(variable)}`
    )
  }

  // Structs are encoded recursively, as defined by their `members` field.
  const parsedVariable: {
    [name: string]: ParsedConfigVariable
  } = {}
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
      throw new Error(
        `User entered incorrect member in ${variableType.label}: ${varName}`
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

  return parsedVariable
}

/**
 * Handles parsing and validating dynamic bytes
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseBytes: VariableHandler<UserConfigVariable, string> = (
  props: VariableHandlerProps<UserConfigVariable, string>
): string => {
  const { variable, variableType, storageObj } = props

  if (typeof variable !== 'string') {
    throw new InputError(
      `invalid input type for ${
        storageObj.label
      }, expected DataHexString but got ${stringifyVariableType(variable)}`
    )
  }

  if (variableType.label.startsWith('bytes')) {
    // hexDataLength returns null if the input is not a valid hex string.
    if (ethers.utils.hexDataLength(variable) === null) {
      throw new InputError(
        `invalid input type for variable ${storageObj.label}, expected DataHexString but got ${variable}`
      )
    }
  }

  // The Solidity compiler uses the "bytes" encoding for strings and dynamic bytes.
  // ref: https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#bytes-and-string
  if (storageObj.offset !== 0) {
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
  {
    [name: string]: ParsedConfigVariable
  }
> = (
  props: VariableHandlerProps<
    UserConfigVariable,
    {
      [name: string]: ParsedConfigVariable
    }
  >
): {
  [name: string]: ParsedConfigVariable
} => {
  const {
    variable,
    storageObj,
    storageTypes,
    variableType,
    nestedSlotOffset,
    dereferencer,
  } = props

  // Iterate over every key/value in the mapping to get the storage slot pair for each one.
  const mapping: {
    [name: string]: ParsedConfigVariable
  } = {}
  for (const [mappingKey, mappingVal] of Object.entries(variable)) {
    const mappingValStorageObj = buildMappingStorageObj(
      storageTypes,
      variableType,
      mappingKey,
      '0x00',
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
    throw new InputError(
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

/**
 * Parses and validates a single variable. Works recursively with complex data types using the recursiveLayoutIterator.
 * See ./iterator.ts for more information on the recursive iterator pattern.
 *
 * @param variable Variable to encode as key/value slot pairs.
 * @param storageObj Solidity compiler JSON output describing the layout for this variable.
 * @param storageTypes Full list of storage types allowed for this encoding.
 * @param nestedSlotOffset Not used, only included here because of the shared recursiveLayoutIterator structure.
 * @returns Variable parsed into the format expected by the parsed chugsplash config.
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
    bytes: parseBytes,
    mapping: parseMapping,
    dynamic_array: parseDynamicArray,
    preserve: parsePreserve,
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
 * @param contractConfig Unparsed User-defined contract definition in a ChugSplash config.
 * @param storageLayout Storage layout returned by the solidity compiler for the relevant contract.
 * @param compilerOutput Complete compiler output.
 * @returns complete set of variables parsed into the format expected by the parsed chugsplash config.
 */
const parseContractVariables = (
  contractConfig: UserContractConfig,
  storageLayout: SolidityStorageLayout,
  compilerOutput: CompilerOutput
): {
  [name: string]: ParsedConfigVariable
} => {
  const parsedConfigVariables: {
    [name: string]: ParsedConfigVariable
  } = {}
  if (!contractConfig.variables) {
    return {}
  }

  // Create an AST Dereferencer. We must convert the CompilerOutput type to `any` here because
  // because a type error will be thrown otherwise. Coverting to `any` is harmless because we use
  // Hardhat's default `CompilerOutput`, which is what OpenZeppelin expects.
  const dereferencer = astDereferencer(compilerOutput as any)
  const extendedLayout = extendStorageLayout(storageLayout, dereferencer)

  const inputErrors: string[] = []
  const unnecessarilyDefinedVariables: string[] = []
  const missingVariables: string[] = []

  for (const variableName of Object.keys(contractConfig.variables)) {
    const existsInLayout = extendedLayout.storage.some(
      (storageObj) => storageObj.configVarName === variableName
    )

    if (existsInLayout === false) {
      unnecessarilyDefinedVariables.push(variableName)
    }
  }

  for (const storageObj of Object.values(extendedLayout.storage)) {
    const configVarValue = contractConfig.variables[storageObj.configVarName]
    if (configVarValue === undefined) {
      missingVariables.push(storageObj.configVarName)
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
      inputErrors.push((e as Error).message)
    }
  }

  if (
    inputErrors.length > 0 ||
    unnecessarilyDefinedVariables.length > 0 ||
    missingVariables.length > 0
  ) {
    let message = `We detected some issues in your ChugSplash config file, please resolve them and try again.\n\n`

    if (inputErrors.length > 0) {
      message += `The following variables were defined incorrectly:\n`
      for (const error of inputErrors) {
        message += `${error} \n`
      }
      message += '\n'
    }

    if (unnecessarilyDefinedVariables.length > 0) {
      message += `The following variables were defined in the ChugSplash config file but do not exist in the contract ${contractConfig.contract}:\n`
      for (const variable of unnecessarilyDefinedVariables) {
        message += `${variable} \n`
      }
      message += `- If any of these variables are immutable, please remove their definition in the 'variables' section of the ChugSplash config file and use the 'constructorArgs' field instead.\n`
      message += `- If any of these variables are meant to be mutable, please remove their definition in the ChugSplash config file.\n`
      message += `- If this problem persists, delete your cache folder then try again.\n\n`
    }

    if (missingVariables.length > 0) {
      message += `The following variables were defined in the contract ${contractConfig.contract} (or one of its parent contracts) but were not defined in the ChugSplash config file:\n`
      for (const variable of missingVariables) {
        message += `${variable} \n`
      }
      message += `- Every variable defined in your contracts must be assigned a value in your ChugSplash config file.\n`
      message += `- Please define the variable in your ChugSplash config file then run this command again.\n`
      message += `- If this problem persists, delete your cache folder then try again.\n\n`
    }

    throw new InputError(message)
  }

  return parsedConfigVariables
}

/**
 * Parses and validates constructor args in a config file.
 *
 * TODO - Improve this function so that the parsing and validation is on par with that of variables.
 *
 * @param contractConfig Unparsed User-defined contract definition in a ChugSplash config.
 * @param storageLayout Storage layout returned by the solidity compiler for the relevant contract.
 * @param compilerOutput Complete compiler output.
 * @returns complete set of variables parsed into the format expected by the parsed chugsplash config.
 */
export const parseAndValidateConstructorArgs = (
  userConstructorArgs: UserConfigVariables,
  referenceName: string,
  abi: Array<Fragment>
): ParsedConfigVariables => {
  const parsedConstructorArgs: ParsedConfigVariables = {}

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )

  if (constructorFragment === undefined) {
    if (Object.keys(userConstructorArgs).length > 0) {
      throw new InputError(
        `User entered constructor arguments in the ChugSplash config file for ${referenceName}, but\n` +
          `no constructor exists in the contract.`
      )
    } else {
      return parsedConstructorArgs
    }
  }

  const constructorArgNames = constructorFragment.inputs.map(
    (input) => input.name
  )
  const incorrectConstructorArgNames = Object.keys(userConstructorArgs).filter(
    (argName) => !constructorArgNames.includes(argName)
  )
  const undefinedConstructorArgNames: string[] = []

  constructorFragment.inputs.forEach((input) => {
    const constructorArgValue = userConstructorArgs[input.name]
    if (constructorArgValue === undefined) {
      undefinedConstructorArgNames.push(input.name)
      return
    }

    // TODO - implement input validation and parsing on par with the rest of the variables
    if (typeof constructorArgValue !== 'boolean') {
      parsedConstructorArgs[input.name] = constructorArgValue.toString()
    } else {
      parsedConstructorArgs[input.name] = constructorArgValue
    }
  })

  if (
    incorrectConstructorArgNames.length > 0 ||
    undefinedConstructorArgNames.length > 0
  ) {
    let message = `We detected some issues in your ChugSplash config file, please resolve them and try again.\n\n`
    if (incorrectConstructorArgNames.length > 0) {
      message += `The following constructor arguments were found in your config for ${referenceName}, but are not present in the contract constructor:\n`
      message += `${incorrectConstructorArgNames.map(
        (argName) => `${argName}`
      )}\n`
      message += '\n'
    }

    if (undefinedConstructorArgNames.length > 0) {
      message += `The following constructor arguments are required by the constructor for ${referenceName}, but were not found in your config:\n`
      message += `${undefinedConstructorArgNames.map(
        (argName) => `${argName}`
      )}\n`
      message += '\n'
    }

    throw new InputError(message)
  }

  return parsedConstructorArgs
}

export const assertStorageCompatiblePreserveKeywords = (
  contractConfig: ParsedContractConfig,
  prevStorageLayout: StorageLayout,
  newStorageLayout: StorageLayout
) => {
  const prevDetailedLayout = getDetailedLayout(prevStorageLayout)
  const newDetailedLayout = getDetailedLayout(newStorageLayout)

  const errorMessages: Array<string> = []
  for (const newStorageObj of newDetailedLayout) {
    if (
      variableContainsPreserveKeyword(
        contractConfig.variables[newStorageObj.label]
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
        errorMessages.push(
          `The variable "${newStorageObj.label}" contains the preserve keyword, but does not exist in the previous\n` +
            `storage layout at the same slot position with the same variable type. Please fix this or remove\n` +
            `the preserve keyword from this variable.`
        )
      }
    }
  }

  if (errorMessages.length > 0) {
    throw new Error(`${errorMessages.join('\n\n')}`)
  }
}

export const assertValidParsedChugSplashFile = async (
  provider: providers.Provider,
  parsedConfig: ParsedChugSplashConfig,
  userConfig: UserChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const {
    canonicalConfigPath,
    remoteExecution,
    autoConfirm,
    openzeppelinStorageLayouts,
  } = cre

  // Determine if the deployment is an upgrade
  const projectName = parsedConfig.options.projectName

  const chugSplashManagerAddress = getChugSplashManagerProxyAddress(
    parsedConfig.options.projectName
  )

  const requiresOwnershipTransfer: {
    name: string
    proxyAddress: string
    currentAdminAddress: string
  }[] = []
  let isUpgrade: boolean = false
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    if ((await provider.getCode(contractConfig.proxy)) !== '0x') {
      isUpgrade = true

      if (
        contractConfig.proxyType === 'oz-ownable-uups' ||
        contractConfig.proxyType === 'oz-access-control-uups'
      ) {
        // We must manually check that the ChugSplashManager can call the UUPS proxy's `upgradeTo`
        // function because OpenZeppelin UUPS proxies can implement arbitrary access control
        // mechanisms.
        const chugsplashManager = new ethers.VoidSigner(
          chugSplashManagerAddress,
          provider
        )
        const UUPSProxy = new ethers.Contract(
          contractConfig.proxy,
          ProxyABI,
          chugsplashManager
        )
        try {
          // Attempt to staticcall the `upgradeTo` function on the proxy from the
          // ChugSplashManager's address. Note that it's necessary for us to set the proxy's
          // implementation to an OpenZeppelin UUPS ProxyUpdater contract to ensure that:
          // 1. The new implementation is deployed on every network. Otherwise, the call will revert
          //    due to this check:
          //    https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/ERC1967/ERC1967Upgrade.sol#L44
          // 2. The new implementation has a public `proxiableUUID()` function. Otherwise, the call
          //    will revert due to this check:
          //    https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/dd8ca8adc47624c5c5e2f4d412f5f421951dcc25/contracts/proxy/ERC1967/ERC1967UpgradeUpgradeable.sol#L91
          await UUPSProxy.callStatic.upgradeTo(OZ_UUPS_UPDATER_ADDRESS)
        } catch (e) {
          // The ChugSplashManager does not have permission to call the `upgradeTo` function on the
          // proxy, which means the user must grant it permission via whichever access control
          // mechanism the UUPS proxy uses.
          requiresOwnershipTransfer.push({
            name: referenceName,
            proxyAddress: contractConfig.proxy,
            currentAdminAddress: 'unknown',
          })
        }
      } else {
        const proxyAdmin = await getEIP1967ProxyAdminAddress(
          provider,
          contractConfig.proxy
        )

        if (proxyAdmin !== chugSplashManagerAddress) {
          requiresOwnershipTransfer.push({
            name: referenceName,
            proxyAddress: contractConfig.proxy,
            currentAdminAddress: proxyAdmin,
          })
        }
      }
    }
  }

  if (requiresOwnershipTransfer.length > 0) {
    throw new Error(
      `Detected proxy contracts which are not managed by ChugSplash:` +
        `${requiresOwnershipTransfer.map(
          ({ name, proxyAddress, currentAdminAddress }) =>
            `\n${name}: ${proxyAddress} | Current admin: ${currentAdminAddress}`
        )}

If you are using any Transparent proxies, you must transfer ownership of each to ChugSplash using the following command:
npx hardhat chugsplash-transfer-ownership --network <network> --config-path <path> --proxy <proxyAddress>

If you are using any UUPS proxies, you must give your ChugSplashManager contract ${chugSplashManagerAddress}
permission to call the 'upgradeTo' function on each of them.
      `
    )
  }

  if (isUpgrade) {
    for (const [referenceName, contractConfig] of Object.entries(
      parsedConfig.contracts
    )) {
      const isProxyDeployed =
        (await provider.getCode(contractConfig.proxy)) !== '0x'
      if (isProxyDeployed && canonicalConfigPath) {
        const userContractConfig = userConfig.contracts[referenceName]
        const previousStorageLayout = await getPreviousStorageLayoutOZFormat(
          provider,
          referenceName,
          contractConfig,
          userContractConfig,
          remoteExecution,
          canonicalConfigPath,
          openzeppelinStorageLayouts
        )

        const { input, output } = readBuildInfo(
          artifactPaths[referenceName].buildInfoPath
        )
        const newStorageLayout = getOpenZeppelinStorageLayout(
          contractConfig.contract,
          input,
          output,
          contractConfig.proxyType
        )

        assertStorageCompatiblePreserveKeywords(
          contractConfig,
          previousStorageLayout,
          newStorageLayout
        )

        // We could check for the `skipStorageCheck` in the outer for-loop, but this makes it easy to
        // support more granular storage layout config options in the future.
        if (parsedConfig.options.skipStorageCheck !== true) {
          // Run OpenZeppelin's storage slot checker.
          assertStorageUpgradeSafe(
            previousStorageLayout,
            newStorageLayout,
            getOpenZeppelinValidationOpts(contractConfig.proxyType)
          )
        }
      }

      // Check new UUPS implementations include a public `upgradeTo` function. This ensures that the
      // user will be able to upgrade the proxy in the future.
      if (
        contractConfig.proxyType === 'oz-ownable-uups' ||
        contractConfig.proxyType === 'oz-access-control-uups'
      ) {
        const artifact = readContractArtifact(
          artifactPaths[referenceName].contractArtifactPath,
          integration
        )
        const containsPublicUpgradeTo = artifact.abi.some(
          (fragment) =>
            fragment.name === 'upgradeTo' &&
            fragment.inputs.length === 1 &&
            fragment.inputs[0].type === 'address'
        )
        if (!containsPublicUpgradeTo) {
          throw new Error(
            `Contract ${referenceName} proxy type is marked as UUPS, but the new implementation\n` +
              `no longer has a public 'upgradeTo(address)' function. You must include this function \n` +
              `or you will no longer be able to upgrade this contract.`
          )
        }
      }
    }

    if (!autoConfirm) {
      // Confirm upgrade with user
      const userConfirmed = await yesno({
        question: `Prior deployment(s) detected for project ${projectName}. Would you like to perform an upgrade? (y/n)`,
      })
      if (!userConfirmed) {
        throw new Error(`User denied upgrade.`)
      }
    }
  } else {
    for (const contractConfig of Object.values(parsedConfig.contracts)) {
      // Throw an error if the 'preserve' keyword is set to a variable's value in the
      // ChugSplash config file. This keyword is only allowed for upgrades.
      if (variableContainsPreserveKeyword(contractConfig.variables)) {
        throw new Error(
          `Detected the '{preserve}' keyword in a fresh deployment. This keyword is reserved for\n` +
            `upgrades only. Please remove all instances of it in your ChugSplash config file.`
        )
      }
    }
  }
}

export const assertValidContracts = (
  parsedConfig: ParsedChugSplashConfig,
  artifactPaths: ArtifactPaths
) => {
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    // Get the source name and contract name from its fully qualified name
    const [sourceName, contractName] = contractConfig.contract.split(':')

    const buildInfoPath = artifactPaths[referenceName].buildInfoPath
    const buildInfo = readBuildInfo(buildInfoPath)
    const outputSource = buildInfo.output.sources[sourceName]

    const childContractNode = outputSource.ast.nodes.find(
      (node): node is ContractDefinition =>
        node.nodeType === 'ContractDefinition' && node.name === contractName
    )

    if (childContractNode === undefined) {
      throw new Error(
        `Could not find the child contract node for "${referenceName}"`
      )
    }

    const parentContractNodeAstIds =
      childContractNode.linearizedBaseContracts.filter(
        (astId) => astId !== childContractNode.id
      )
    const parentContractNodes = getParentContractASTNodes(
      buildInfo.output.sources,
      parentContractNodeAstIds
    )

    // TODO: type
    const constructorNodes: Array<any> = []
    const immutableVarAstIds: { [astId: number]: boolean } = {}
    // Create a mapping of constructor node AST IDs to the corresponding contract's name. This is only used
    // for error messages when we parse the constructor nodes later.
    const constructorNodeContractNames: { [astId: number]: string } = {}
    for (const contractNode of parentContractNodes.concat([
      childContractNode,
    ])) {
      for (const node of contractNode.nodes) {
        if (node.kind === 'constructor') {
          constructorNodes.push(node)
          constructorNodeContractNames[node.id] = contractNode.name
        } else if (node.nodeType === 'VariableDeclaration') {
          if (node.mutability === 'mutable' && node.value !== undefined) {
            throw new Error(
              `User attempted to assign a value to a non-immutable state variable '${node.name}' in\n` +
                `the contract: ${contractNode.name}. This is not allowed because the value will not exist in\n` +
                `the upgradeable contract. Please remove the value in the contract and define it in your ChugSplash\n` +
                `file instead. Alternatively, can also set '${node.name} to be a constant or immutable variable.`
            )
          }

          if (
            node.mutability === 'immutable' &&
            node.value !== undefined &&
            node.value.kind === 'functionCall'
          ) {
            throw new Error(
              `User attempted to assign the immutable variable '${node.name}' to the return value of a function call in\n` +
                `the contract: ${contractNode.name}. This is not allowed to ensure that ChugSplash is\n` +
                `deterministic. Please remove the function call.`
            )
          }

          if (node.mutability === 'immutable' && node.value === undefined) {
            immutableVarAstIds[node.id] = true
          }
        }
      }
    }

    for (const node of constructorNodes) {
      for (const statement of node.body.statements) {
        if (statement.nodeType !== 'ExpressionStatement') {
          throw new Error(
            `Detected an unallowed expression, '${statement.nodeType}', in the constructor of the\n` +
              `contract: ${
                constructorNodeContractNames[node.id]
              }. Only immutable variable assignments are allowed in\n` +
              `the constructor to ensure that ChugSplash can deterministically deploy your contracts.`
          )
        }

        if (statement.expression.nodeType !== 'Assignment') {
          const unallowedOperation: string =
            statement.expression.expression.name ?? statement.expression.kind
          throw new Error(
            `Detected an unallowed operation, '${unallowedOperation}', in the constructor of the\n` +
              `contract: ${
                constructorNodeContractNames[node.id]
              }. Only immutable variable assignments are allowed in\n` +
              `the constructor to ensure that ChugSplash can deterministically deploy your contracts.`
          )
        }

        if (
          immutableVarAstIds[
            statement.expression.leftHandSide.referencedDeclaration
          ] !== true
        ) {
          throw new Error(
            `Detected an assignment to a non-immutable variable, '${statement.expression.leftHandSide.name}', in the\n` +
              `constructor of the contract: ${
                constructorNodeContractNames[node.id]
              }. Only immutable variable assignments are allowed in\n` +
              `the constructor to ensure that ChugSplash can deterministically deploy your contracts.`
          )
        }

        if (statement.expression.rightHandSide.kind === 'functionCall') {
          throw new Error(
            `User attempted to assign the immutable variable '${statement.expression.leftHandSide.name}' to the return \n` +
              `value of a function call in the contract: ${
                constructorNodeContractNames[node.id]
              }. This is not allowed to ensure that\n` +
              `ChugSplash is deterministic. Please remove the function call.`
          )
        }
      }
    }
  }
}

/**
 * Parses a ChugSplash config file from the config file given by the user.
 *
 * @param userConfig Unparsed config file to parse.
 * @param env Environment variables to inject into the file.
 * @return Parsed config file with template variables replaced.
 */
const parseAndValidateChugSplashConfig = async (
  provider: providers.Provider,
  userConfig: UserChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
): Promise<ParsedChugSplashConfig> => {
  assertValidUserConfigFields(userConfig)

  const parsedConfig: ParsedChugSplashConfig = {
    options: userConfig.options,
    contracts: {},
  }

  const contracts = {}
  for (const [referenceName, userContractConfig] of Object.entries(
    userConfig.contracts
  )) {
    if (
      userContractConfig.externalProxy !== undefined &&
      (await provider.getCode(userContractConfig.externalProxy)) === '0x'
    ) {
      throw new Error(
        `User entered a proxy address that does not exist: ${userContractConfig.externalProxy}`
      )
    }

    const { externalProxy, externalProxyType, constructorArgs } =
      userContractConfig

    // Change the `contract` fields to be a fully qualified name. This ensures that it's easy for the
    // executor to create the `CanonicalConfigArtifacts` when it eventually compiles the canonical
    // config.
    const { sourceName, contractName } = readContractArtifact(
      artifactPaths[referenceName].contractArtifactPath,
      integration
    )
    const contractFullyQualifiedName = `${sourceName}:${contractName}`

    // Set the proxy address to the user-defined value if it exists, otherwise set it to the default proxy
    // used by ChugSplash.
    const proxy =
      externalProxy ||
      getDefaultProxyAddress(userConfig.options.projectName, referenceName)

    let proxyType: ProxyType
    if (externalProxyType) {
      proxyType = externalProxyType
    } else {
      proxyType = 'internal-default'
    }

    const { output: compilerOutput } = readBuildInfo(
      artifactPaths[referenceName].buildInfoPath
    )
    const storageLayout =
      compilerOutput.contracts[sourceName][contractName].storageLayout

    const parsedVariables = parseContractVariables(
      JSON.parse(
        Handlebars.compile(JSON.stringify(userContractConfig))({
          ...contracts,
        })
      ),
      storageLayout,
      compilerOutput
    )

    const args = parseAndValidateConstructorArgs(
      constructorArgs ?? {},
      referenceName,
      compilerOutput.contracts[sourceName][contractName].abi
    )

    parsedConfig.contracts[referenceName] = {
      contract: contractFullyQualifiedName,
      proxy,
      proxyType,
      variables: parsedVariables,
      constructorArgs: args,
    }

    contracts[referenceName] = proxy
  }

  assertValidContracts(parsedConfig, artifactPaths)
  assertValidParsedChugSplashFile(
    provider,
    parsedConfig,
    userConfig,
    artifactPaths,
    integration,
    cre
  )

  return JSON.parse(
    Handlebars.compile(JSON.stringify(parsedConfig))({
      ...contracts,
    })
  )
}
