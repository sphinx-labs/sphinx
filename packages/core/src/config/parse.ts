/* Imports: External */
import * as path from 'path'

import * as Handlebars from 'handlebars'
import { BigNumber, ethers, providers } from 'ethers'
import { astDereferencer, ASTDereferencer } from 'solidity-ast/utils'
import { CompilerOutput } from 'hardhat/types'
import { remove0x } from '@eth-optimism/core-utils'

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
} from '../utils'
import {
  UserChugSplashConfig,
  ParsedChugSplashConfig,
  ProxyType,
  ParsedConfigVariable,
  UserContractConfig,
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

/**
 * Reads a ChugSplash config file synchronously.
 *
 * @param configPath Path to the ChugSplash config file.
 * @returns The parsed ChugSplash config file.
 */
export const readParsedChugSplashConfig = async (
  provider: providers.Provider,
  configPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration
): Promise<ParsedChugSplashConfig> => {
  const userConfig = await readUserChugSplashConfig(configPath)
  return parseAndValidateChugSplashConfig(
    provider,
    userConfig,
    artifactPaths,
    integration
  )
}

export const readUserChugSplashConfig = async (
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

  assertValidUserConfigFields(config)
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
  array: any[],
  storageObj: SolidityStorageObj,
  storageTypes: {
    [name: string]: SolidityStorageType
  },
  nestedSlotOffset: string,
  dereferencer: ASTDereferencer
): Array<any> => {
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
  const parsedArray: any[] = []
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
export const parseInplaceArray: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  const { storageObj, variable, storageTypes, nestedSlotOffset, dereferencer } =
    props
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
export const parseInplaceAddress: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  const { variable } = props

  if (!ethers.utils.isAddress(variable)) {
    throw new Error(`invalid address type: ${variable}`)
  }

  return variable
}

/**
 * Handles parsing and validating booleans.
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceBool: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  let { variable } = props

  // Do some light parsing here to make sure "true" and "false" are recognized.
  if (typeof variable === 'string') {
    if (variable === 'false') {
      variable = false
    }
    if (variable === 'true') {
      variable = true
    }
  }

  if (typeof variable !== 'boolean') {
    throw new Error(`invalid bool type: ${variable}`)
  }

  return variable
}

/**
 * Handles parsing and validating fixed size bytes
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceBytes: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  const { variable, variableType } = props

  // Check that the user entered a valid bytes array or string
  if (typeof variable === 'string' && !ethers.utils.isBytesLike(variable)) {
    throw new Error(
      `invalid bytes string for bytes${variableType.numberOfBytes} variable: ${variable}`
    )
  }

  // Convert the bytes object, which may be an array, into a hex-encoded string
  const hexStringVariable = ethers.utils.hexlify(variable)
  // Check that the hex string is the correct length
  if (
    !ethers.utils.isHexString(hexStringVariable, variableType.numberOfBytes)
  ) {
    throw new Error(
      `invalid length for bytes${variableType.numberOfBytes} variable: ${variable}`
    )
  }

  return variable
}

/**
 * Handles parsing and validating uints
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceUint: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  const { variable, variableType } = props

  if (
    remove0x(BigNumber.from(variable).toHexString()).length / 2 >
    variableType.numberOfBytes
  ) {
    throw new Error(`provided ${variableType.label} is too big: ${variable}`)
  }

  return BigNumber.from(variable).toString()
}

/**
 * Handles parsing and validating ints
 *
 * @param props standard VariableHandler props. See ./iterator.ts for more information.
 * @returns
 */
export const parseInplaceInt: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  const { variable, variableType } = props

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
      `provided ${variableType.label} size is too big: ${variable}`
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
export const parseInplaceStruct: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  const {
    variable,
    variableType,
    nestedSlotOffset,
    storageTypes,
    dereferencer,
  } = props

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
export const parseBytes: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  const { variable, storageObj } = props

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
export const parseMapping: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
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
export const parseDynamicArray: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
  const { variable, storageObj, storageTypes, nestedSlotOffset, dereferencer } =
    props
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
export const parsePreserve: VariableHandler<ParsedConfigVariable> = (
  props: VariableHandlerProps<ParsedConfigVariable>
) => {
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
  variable: any,
  storageObj: SolidityStorageObj,
  storageTypes: {
    [name: string]: SolidityStorageType
  },
  nestedSlotOffset: string,
  dereferencer: ASTDereferencer
): ParsedConfigVariable => {
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
  const errors: string[] = []
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

  for (const variableName of Object.keys(contractConfig.variables)) {
    const existsInLayout = extendedLayout.storage.some(
      (storageObj) => storageObj.configVarName === variableName
    )

    if (existsInLayout === false) {
      // Complain very loudly if attempting to set a variable that doesn't exist within this layout.
      throw new Error(
        `Variable "${variableName}" was defined in the ChugSplash config file for ${contractConfig.contract} but\n` +
          `does not exist as a mutable variable in the contract. If "${variableName}" is immutable, please remove\n` +
          `its definition in the 'variables' section of the ChugSplash config file and use the 'constructorArgs' field\n` +
          `instead. If this variable is not meant to be immutable, please remove this variable definition in the\n` +
          `ChugSplash config file. If this problem persists, delete your cache folder then try again.`
      )
    }
  }

  for (const storageObj of Object.values(extendedLayout.storage)) {
    const configVarValue = contractConfig.variables[storageObj.configVarName]
    if (configVarValue === undefined) {
      throw new Error(
        `Detected a variable "${storageObj.configVarName}" from the contract "${contractConfig.contract}" (or one\n` +
          `of its parent contracts), but could not find a corresponding variable definition in your ChugSplash config.\n` +
          `file. Every variable defined in your contracts must be assigned a value in your ChugSplash config file.\n` +
          `Please define the variable in your ChugSplash config file then run this command again.\n` +
          `If this problem persists, delete your cache folder then try again.`
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
      errors.push((e as Error).message)
    }
  }

  if (errors.length > 0) {
    let message = `We detected some issues in your ChugSplash config file, please resolve them and try again.\n\n`
    for (const error of errors) {
      message += `${error} \n`
    }
    throw new Error(message)
  }

  return parsedConfigVariables
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
  integration: Integration
): Promise<ParsedChugSplashConfig> => {
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

    parsedConfig.contracts[referenceName] = {
      contract: contractFullyQualifiedName,
      proxy,
      proxyType,
      variables: parsedVariables,
      constructorArgs: constructorArgs ?? {},
    }

    contracts[referenceName] = proxy
  }

  return JSON.parse(
    Handlebars.compile(JSON.stringify(parsedConfig))({
      ...contracts,
    })
  )
}
