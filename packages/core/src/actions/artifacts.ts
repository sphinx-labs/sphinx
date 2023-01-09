import path from 'path'
import * as fs from 'fs'

import * as semver from 'semver'
import { remove0x } from '@eth-optimism/core-utils'
import { utils } from 'ethers'

import { ChugSplashInputs, ParsedChugSplashConfig } from '../config'
import {
  CompilerInput,
  getMinimumCompilerInput,
  SolidityStorageObj,
} from '../languages'

// TODO
export type ContractArtifact = any
export type BuildInfo = any

/**
 * Retrieves an artifact by name.
 *
 * @param name Name of the artifact.
 * @returns Artifact.
 */
export const getContractArtifact = (
  name: string,
  artifactFilder: string
): ContractArtifact => {
  return JSON.parse(fs.readFileSync(path.join(artifactFilder, name), 'utf8'))
}

export const getBuildInfo = (
  buildInfoFolder: string,
  sourceName: string
): BuildInfo => {
  const contractBuildInfo: BuildInfo[] = []
  // Get the inputs from the build info folder.
  const inputs = fs
    .readdirSync(buildInfoFolder)
    .filter((file) => {
      return file.endsWith('.json')
    })
    .map((file) => {
      return JSON.parse(
        fs.readFileSync(path.join(buildInfoFolder, file), 'utf8')
      )
    })

  // Find the correct build info file
  for (const input of inputs) {
    if (input?.output?.sources[sourceName] !== undefined) {
      contractBuildInfo.push({
        solcVersion: input.solcVersion,
        output: input?.output,
      })
    }
  }

  // Should find exactly one. If anything else happens, then throw an error.
  if (contractBuildInfo.length < 0 || contractBuildInfo.length > 1) {
    throw new Error(
      `Failed to find build info for ${sourceName}. Are you sure your contracts were compiled and ${buildInfoFolder} is the correct build info directory?`
    )
  }

  return contractBuildInfo[0]
}

/**
 * Filters out sources in the ChugSplash input that aren't necessary to compile the ChugSplash
 * config.
 *
 * @param chugsplashInputs ChugSplash input array.
 * @param parsedConfig Parsed ChugSplash config.
 * @returns Filtered ChugSplash input array.
 */
export const filterChugSplashInputs = async (
  chugsplashInputs: ChugSplashInputs,
  parsedConfig: ParsedChugSplashConfig,
  artifactFolder: string
): Promise<ChugSplashInputs> => {
  const filteredChugSplashInputs: ChugSplashInputs = []
  for (const chugsplashInput of chugsplashInputs) {
    let filteredSources: CompilerInput['sources'] = {}
    for (const contractConfig of Object.values(parsedConfig.contracts)) {
      const { sourceName, contractName } = getContractArtifact(
        contractConfig.contract,
        artifactFolder
      )
      const { solcVersion, output: compilerOutput } = await getBuildInfo(
        sourceName,
        contractName
      )
      if (solcVersion === chugsplashInput.solcVersion) {
        const { sources: newSources } = getMinimumCompilerInput(
          chugsplashInput.input,
          compilerOutput.sources,
          sourceName
        )
        // Merge the existing sources with the new sources, which are required to compile the
        // current `sourceName`.
        filteredSources = { ...filteredSources, ...newSources }
      }
    }
    const filteredCompilerInput: CompilerInput = {
      language: chugsplashInput.input.language,
      settings: chugsplashInput.input.settings,
      sources: filteredSources,
    }
    filteredChugSplashInputs.push({
      solcVersion: chugsplashInput.solcVersion,
      solcLongVersion: chugsplashInput.solcLongVersion,
      input: filteredCompilerInput,
    })
  }

  return filteredChugSplashInputs
}

export const getCreationCodeWithConstructorArgs = (
  bytecode: string,
  parsedConfig: ParsedChugSplashConfig,
  referenceName: string,
  abi: any,
  compilerOutput: any,
  sourceName: string,
  contractName: string
): string => {
  const { constructorArgTypes, constructorArgValues } = getConstructorArgs(
    parsedConfig,
    referenceName,
    abi,
    compilerOutput,
    sourceName,
    contractName
  )

  const creationCodeWithConstructorArgs = bytecode.concat(
    remove0x(
      utils.defaultAbiCoder.encode(constructorArgTypes, constructorArgValues)
    )
  )

  return creationCodeWithConstructorArgs
}

export const getConstructorArgs = (
  parsedConfig: ParsedChugSplashConfig,
  referenceName: string,
  abi: any,
  compilerOutput: any,
  sourceName: string,
  contractName: string
): { constructorArgTypes: any[]; constructorArgValues: any[] } => {
  const immutableReferences =
    compilerOutput.contracts[sourceName][contractName].evm.deployedBytecode
      .immutableReferences

  const contractConfig = parsedConfig.contracts[referenceName]

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )
  const constructorArgTypes = []
  const constructorArgValues = []
  if (constructorFragment === undefined) {
    return { constructorArgTypes, constructorArgValues }
  }

  // Maps a constructor argument name to the corresponding variable name in the ChugSplash config
  const constructorArgNamesToImmutableNames = {}

  for (const source of Object.values(compilerOutput.sources)) {
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
                `Could not find immutable variable "${node.name}" in ${referenceName}.
Did you forget to declare it in ${parsedConfig.options.projectName}?`
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
        `Detected a non-immutable constructor argument, "${input.name}", in ${contractConfig.contract}.
Please remove it or make the corresponding variable immutable.`
      )
    }
  })

  return { constructorArgTypes, constructorArgValues }
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
    `Could not find nested constructor argument for the immutable variable ${variableName}.
Please report this error.`
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
              `The immutable variable "${variableName}" must be assigned directly to a
constructor argument inside the body of the constructor in ${contractName}.`
            )
          }
        }
      }
    }
  }
  throw new Error(
    `Could not find immutable variable assignment for ${variableName}.
Did you forget to include it in your ChugSplash config file?`
  )
}

export const getImmutableVariables = (
  compilerOutput: any,
  sourceName: string,
  contractName: string
): string[] => {
  const immutableReferences: {
    [astId: number]: {
      length: number
      start: number
    }[]
  } =
    compilerOutput.contracts[sourceName][contractName].evm.deployedBytecode
      .immutableReferences

  if (
    immutableReferences === undefined ||
    Object.keys(immutableReferences).length === 0
  ) {
    return []
  }

  const immutableVariables: string[] = []
  for (const source of Object.values(compilerOutput.sources)) {
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

/**
 * Retrieves the storageLayout portion of the compiler artifact for a given contract by name.
 *
 * @param name Name of the contract to retrieve the storage layout for.
 * @param artifactFolder Relative path to the folder where artifacts are stored.
 * @return Storage layout object from the compiler output.
 */
export const getStorageLayout = async (
  name: string,
  artifactFolder: string
): Promise<SolidityStorageObj> => {
  const { sourceName, contractName } = getContractArtifact(name, artifactFolder)
  const buildInfo = await getBuildInfo(sourceName, contractName)
  const output = buildInfo.output.contracts[sourceName][contractName]

  if (!semver.satisfies(buildInfo.solcVersion, '>=0.4.x <0.9.x')) {
    throw new Error(
      `Storage layout for Solidity version ${buildInfo.solcVersion} not yet supported. Sorry!`
    )
  }

  if (!('storageLayout' in output)) {
    throw new Error(
      `Storage layout for ${name} not found. Did you forget to set the storage layout
compiler option in your hardhat config? Read more:
https://github.com/ethereum-optimism/smock#note-on-using-smoddit`
    )
  }

  return (output as any).storageLayout
}
