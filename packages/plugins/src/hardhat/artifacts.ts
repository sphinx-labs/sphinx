import * as semver from 'semver'
import { SolidityStorageLayout } from '@chugsplash/core'
import { add0x, remove0x } from '@eth-optimism/core-utils'
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
 * @param name Name of the contract.
 * @returns Contract build info.
 */
export const getBuildInfo = async (name: string): Promise<BuildInfo> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hre = require('hardhat')
  return hre.artifacts.getBuildInfo(name)
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
  const buildInfo = await getBuildInfo(`${sourceName}:${contractName}`)
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

export const getDeployedBytecode = async (
  provider: ethers.providers.JsonRpcProvider,
  contractConfig
): Promise<string> => {
  const { sourceName, contractName, bytecode, abi } = getContractArtifact(
    contractConfig.contract
  )
  const buildInfo = await getBuildInfo(`${sourceName}:${contractName}`)
  const output = buildInfo.output.contracts[sourceName][contractName]
  const immutableReferences: {
    [astId: number]: {
      length: number
      start: number
    }[]
  } = output.evm.deployedBytecode.immutableReferences
  const deployedBytecode = output.evm.deployedBytecode.object

  if (Object.keys(immutableReferences).length === 0) {
    return add0x(deployedBytecode)
  }

  // Maps a variable's AST ID to its ABI encoded value
  const astIdToAbiEncodedValue = {}

  // Maps a constructor argument name to the corresponding variable name in the ChugSplash config
  const constructorArgNamesToVariableNames = {}

  const contractNodes = buildInfo.output.sources[sourceName].ast.nodes
  for (const contractNode of contractNodes) {
    if (contractNode.nodeType === 'ContractDefinition') {
      for (const node of contractNode.nodes) {
        if (
          node.nodeType === 'VariableDeclaration' &&
          (node.mutability === 'immutable' || node.mutability === 'mutable')
        ) {
          const constructorArgName = getConstructorArgNameForConfigVariable(
            contractNode.nodes,
            node.name
          )
          constructorArgNamesToVariableNames[constructorArgName] = node.name

          let typeString: string
          if (node.typeDescriptions.typeString.startsWith('contract')) {
            typeString = 'address'
          } else if (node.typeDescriptions.typeString.startsWith('enum')) {
            typeString = 'uint8'
          } else {
            typeString = node.typeDescriptions.typeString
          }
          const abiEncodedValue = utils.defaultAbiCoder.encode(
            [typeString],
            [contractConfig.variables[node.name]]
          )
          astIdToAbiEncodedValue[node.id] = remove0x(abiEncodedValue)
        }
      }
    }
  }

  let bytecodeInjectedWithImmutables = deployedBytecode
  for (const [astId, referenceArray] of Object.entries(immutableReferences)) {
    for (const { start, length } of referenceArray) {
      bytecodeInjectedWithImmutables = bytecodeInjectedWithImmutables
        .substring(0, start * 2)
        .concat(astIdToAbiEncodedValue[astId])
        .concat(
          bytecodeInjectedWithImmutables.substring(
            start * 2 + length * 2,
            bytecodeInjectedWithImmutables.length
          )
        )
    }
  }

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )
  const constructorArgTypes = []
  const constructorArgValues = []
  constructorFragment.inputs.forEach((fragment) => {
    constructorArgTypes.push(fragment.type)
    constructorArgValues.push(
      contractConfig.variables[
        constructorArgNamesToVariableNames[fragment.name]
      ]
    )
  })
  const creationBytecodeWithConstructorArgs = bytecode.concat(
    remove0x(
      utils.defaultAbiCoder.encode(constructorArgTypes, constructorArgValues)
    )
  )
  const bytecodeDeployedWithConstructorArgs = await provider.call({
    data: creationBytecodeWithConstructorArgs,
  })

  if (
    add0x(bytecodeInjectedWithImmutables) !==
    bytecodeDeployedWithConstructorArgs
  ) {
    throw new Error(
      `ChugSplash cannot generate the deployed bytecode for ${contractConfig.contract}. Please report this error.`
    )
  }

  return bytecodeDeployedWithConstructorArgs
}

export const getConstructorArgNameForConfigVariable = (
  nodes: any,
  variableName: string
): string => {
  for (const node of nodes) {
    if (node.kind === 'constructor') {
      for (const statement of node.body.statements) {
        if (statement.expression.leftHandSide.name === variableName) {
          return statement.expression.rightHandSide.name
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
  const buildInfo = await getBuildInfo(`${sourceName}:${contractName}`)
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
  const contractNodes = buildInfo.output.sources[sourceName].ast.nodes
  for (const contractNode of contractNodes) {
    if (contractNode.nodeType === 'ContractDefinition') {
      for (const node of contractNode.nodes) {
        if (node.mutability === 'immutable') {
          immutableVariables.push(node.name)
        }
      }
    }
  }
  return immutableVariables
}
