import path from 'path'

import * as semver from 'semver'
import { SolidityStorageLayout, ChugSplashConfig } from '@chugsplash/core'
import { remove0x } from '@eth-optimism/core-utils'
import { ethers, utils } from 'ethers'

// TODO
export type ContractArtifact = any
export type BuildInfo = any

/**
 * Retrieves an artifact by name.
 *
 * @param name Name of the artifact.
 * @returns Artifact.
 */
export const getContractArtifact = (name: string): ContractArtifact => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hre = require('hardhat')
  return hre.artifacts.readArtifactSync(name)
}

/**
 * Retrieves contract build info by name.
 *
 * @param sourceName Source file name.
 * @param contractName Contract name.
 * @returns Contract build info.
 */
export const getBuildInfo = async (
  sourceName: string,
  contractName: string
): Promise<BuildInfo> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hre = require('hardhat')

  let buildInfo: BuildInfo
  try {
    buildInfo = await hre.artifacts.getBuildInfo(
      `${sourceName}:${contractName}`
    )
  } catch (err) {
    try {
      // Try also loading with the short source name, necessary when using the foundry
      // hardhat plugin
      const shortSourceName = path.basename(sourceName)
      buildInfo = await hre.artifacts.getBuildInfo(
        `${shortSourceName}:${contractName}`
      )
    } catch {
      // Throwing the original error is probably more helpful here because using the
      // foundry hardhat plugin is not a common usecase.
      throw err
    }
  }

  return buildInfo
}

/**
 * Retrieves the storageLayout portion of the compiler artifact for a given contract by name. This
 * function is hardhat specific.
 *
 * @param hre HardhatRuntimeEnvironment, required for the readArtifactSync function.
 * @param name Name of the contract to retrieve the storage layout for.
 * @return Storage layout object from the compiler output.
 */
export const getStorageLayout = async (
  name: string
): Promise<SolidityStorageLayout> => {
  const { sourceName, contractName } = getContractArtifact(name)
  const buildInfo = await getBuildInfo(sourceName, contractName)
  const output = buildInfo.output.contracts[sourceName][contractName]

  if (!semver.satisfies(buildInfo.solcVersion, '>=0.4.x <0.9.x')) {
    throw new Error(
      `Storage layout for Solidity version ${buildInfo.solcVersion} not yet supported. Sorry!`
    )
  }

  if (!('storageLayout' in output)) {
    throw new Error(
      `Storage layout for ${name} not found. Did you forget to set the storage layout compiler option in your hardhat config? Read more: https://github.com/ethereum-optimism/smock#note-on-using-smoddit`
    )
  }

  return (output as any).storageLayout
}

export const getCreationCode = async (
  parsedConfig: ChugSplashConfig,
  referenceName: string
): Promise<string> => {
  const contractConfig = parsedConfig.contracts[referenceName]

  const { bytecode } = getContractArtifact(contractConfig.contract)

  const { constructorArgTypes, constructorArgValues } =
    await getConstructorArgs(parsedConfig, referenceName)

  const creationCodeWithConstructorArgs = bytecode.concat(
    remove0x(
      utils.defaultAbiCoder.encode(constructorArgTypes, constructorArgValues)
    )
  )

  return creationCodeWithConstructorArgs
}

export const getConstructorArgs = async (
  parsedConfig: ChugSplashConfig,
  referenceName: string
): Promise<{ constructorArgTypes: any[]; constructorArgValues: any[] }> => {
  const contractConfig = parsedConfig.contracts[referenceName]

  const { sourceName, contractName, abi } = getContractArtifact(
    contractConfig.contract
  )

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )
  const constructorArgTypes = []
  const constructorArgValues = []
  if (constructorFragment === undefined) {
    return { constructorArgTypes, constructorArgValues }
  }

  const buildInfo = await getBuildInfo(sourceName, contractName)
  const output = buildInfo.output.contracts[sourceName][contractName]
  const immutableReferences: {
    [astId: number]: {
      length: number
      start: number
    }[]
  } = output.evm.deployedBytecode.immutableReferences

  // Maps a constructor argument name to the corresponding variable name in the ChugSplash config
  const constructorArgNamesToImmutableNames = {}

  for (const source of Object.values(buildInfo.output.sources)) {
    for (const contractNode of (source as any).ast.nodes) {
      if (
        contractNode.nodeType === 'ContractDefinition' &&
        contractNode.nodes !== undefined
      ) {
        for (const node of contractNode.nodes) {
          if (
            node.nodeType === 'VariableDeclaration' &&
            node.mutability === 'immutable' &&
            Object.keys(immutableReferences).includes(node.id.toString(10))
          ) {
            if (contractConfig.variables[node.name] === undefined) {
              throw new Error(
                `Could not find immutable variable "${node.name}" in ${referenceName}. Did you forget to declare it in ${parsedConfig.options.projectName}?`
              )
            }

            const constructorArgName =
              getConstructorArgNameForImmutableVariable(
                contractConfig.contract,
                contractNode.nodes,
                node.name
              )
            constructorArgNamesToImmutableNames[constructorArgName] = node.name
          }
        }
      }
    }
  }

  constructorFragment.inputs.forEach((input) => {
    constructorArgTypes.push(input.type)
    if (constructorArgNamesToImmutableNames.hasOwnProperty(input.name)) {
      constructorArgValues.push(
        contractConfig.variables[
          constructorArgNamesToImmutableNames[input.name]
        ]
      )
    } else {
      throw new Error(
        `Detected a non-immutable constructor argument, "${input.name}", in ${contractConfig.contract}. Please remove it or make the corresponding variable immutable.`
      )
    }
  })

  return { constructorArgTypes, constructorArgValues }
}

export const getDeployedBytecode = async (
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<string> => {
  const deployedBytecode = await provider.getCode(address)
  return deployedBytecode
}

export const getNestedConstructorArg = (variableName: string, args): string => {
  let remainingArguments = args[0]
  while (remainingArguments !== undefined) {
    if (remainingArguments.name !== undefined) {
      return remainingArguments.name
    }
    remainingArguments = remainingArguments.arguments[0]
  }
  throw new Error(
    `Could not find nested constructor argument for the immutable variable ${variableName}. Please report this error.`
  )
}

export const getConstructorArgNameForImmutableVariable = (
  contractName: string,
  nodes: any,
  variableName: string
): string => {
  for (const node of nodes) {
    if (node.kind === 'constructor') {
      for (const statement of node.body.statements) {
        if (statement.expression.nodeType === 'FunctionCall') {
          throw new Error(
            `Please remove the "${statement.expression.expression.name}" call in the constructor for ${contractName}.`
          )
        } else if (statement.expression.nodeType !== 'Assignment') {
          throw new Error(
            `disallowed statement in constructor for ${contractName}: ${statement.expression.nodeType}`
          )
        }
        if (statement.expression.leftHandSide.name === variableName) {
          if (typeof statement.expression.rightHandSide.name === 'string') {
            return statement.expression.rightHandSide.name
          } else if (
            statement.expression.rightHandSide.kind === 'typeConversion'
          ) {
            return getNestedConstructorArg(
              variableName,
              statement.expression.rightHandSide.arguments
            )
          } else {
            throw new Error(
              `The immutable variable "${variableName}" must be assigned directly to a constructor argument inside the body of the constructor in ${contractName}.`
            )
          }
        }
      }
    }
  }
  throw new Error(
    `Could not find immutable variable assignment for ${variableName}. Did you forget to include it in your ChugSplash config file?`
  )
}

export const getImmutableVariables = async (
  contractConfig
): Promise<string[]> => {
  const { sourceName, contractName } = getContractArtifact(
    contractConfig.contract
  )
  const buildInfo = await getBuildInfo(sourceName, contractName)
  const output = buildInfo.output.contracts[sourceName][contractName]
  const immutableReferences: {
    [astId: number]: {
      length: number
      start: number
    }[]
  } = output.evm.deployedBytecode.immutableReferences

  if (Object.keys(immutableReferences).length === 0) {
    return []
  }

  const immutableVariables: string[] = []
  for (const source of Object.values(buildInfo.output.sources)) {
    for (const contractNode of (source as any).ast.nodes) {
      if (contractNode.nodeType === 'ContractDefinition') {
        for (const node of contractNode.nodes) {
          if (node.mutability === 'immutable') {
            immutableVariables.push(node.name)
          }
        }
      }
    }
  }
  return immutableVariables
}
