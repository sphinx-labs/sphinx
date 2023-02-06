import * as fs from 'fs'

import * as semver from 'semver'
import { remove0x } from '@eth-optimism/core-utils'
import { ethers, utils } from 'ethers'
import ora from 'ora'
import { Fragment } from 'ethers/lib/utils'

import {
  ParsedChugSplashConfig,
  ParsedConfigVariable,
  ParsedContractConfig,
} from '../config'
import {
  addEnumMembersToStorageLayout,
  ArtifactPaths,
  SolidityStorageObj,
} from '../languages'
import { Integration } from '../constants'
import {
  createDeploymentFolderForNetwork,
  writeDeploymentArtifact,
  writeSnapshotId,
} from '../utils'

// TODO
export type BuildInfo = any
export type ContractArtifact = {
  abi: Array<Fragment>
  sourceName: string
  contractName: string
  bytecode: string
}

/**
 * Retrieves artifact info from foundry artifacts and returns it in hardhat compatible format.
 *
 * @param artifact Raw artifact object.
 * @returns ContractArtifact
 */
export const parseFoundryArtifact = (artifact: any): ContractArtifact => {
  const abi = artifact.abi
  const bytecode = artifact.bytecode.object

  const compilationTarget = artifact.metadata.settings.compilationTarget
  const sourceName = Object.keys(compilationTarget)[0]
  const contractName = compilationTarget[sourceName]

  return { abi, bytecode, sourceName, contractName }
}

/**
 * Retrieves an artifact by name from the local file system.
 *
 * @param name Contract name or fully qualified name.
 * @returns Artifact.
 */
export const readContractArtifact = (
  artifactPaths: ArtifactPaths,
  contract: string,
  integration: Integration
): ContractArtifact => {
  let contractArtifactPath: string
  if (artifactPaths[contract]) {
    contractArtifactPath = artifactPaths[contract].contractArtifactPath
  } else {
    // The contract must be a fully qualified name.
    const contractName = contract.split(':').at(-1)
    if (contractName === undefined) {
      throw new Error('Could not use contract name to get build info')
    } else {
      contractArtifactPath = artifactPaths[contractName].contractArtifactPath
    }
  }

  const artifact: ContractArtifact = JSON.parse(
    fs.readFileSync(contractArtifactPath, 'utf8')
  )

  if (integration === 'hardhat') {
    return artifact
  } else if (integration === 'foundry') {
    return parseFoundryArtifact(artifact)
  } else {
    throw new Error('Unknown integration')
  }
}

/**
 * Reads the build info from the local file system.
 *
 * @param artifactPaths ArtifactPaths object.
 * @param fullyQualifiedName Fully qualified name of the contract.
 * @returns BuildInfo object.
 */
export const readBuildInfo = (
  artifactPaths: ArtifactPaths,
  fullyQualifiedName: string
): BuildInfo => {
  const [sourceName, contractName] = fullyQualifiedName.split(':')
  const { buildInfoPath } =
    artifactPaths[fullyQualifiedName] ?? artifactPaths[contractName]
  const buildInfo: BuildInfo = JSON.parse(
    fs.readFileSync(buildInfoPath, 'utf8')
  )

  const contractOutput = buildInfo.output.contracts[sourceName][contractName]
  const sourceNodes = buildInfo.output.sources[sourceName].ast.nodes

  if (!semver.satisfies(buildInfo.solcVersion, '>=0.4.x <0.9.x')) {
    throw new Error(
      `Storage layout for Solidity version ${buildInfo.solcVersion} not yet supported. Sorry!`
    )
  }

  if (!('storageLayout' in contractOutput)) {
    throw new Error(
      `Storage layout for ${fullyQualifiedName} not found. Did you forget to set the storage layout
compiler option in your hardhat config? Read more:
https://github.com/ethereum-optimism/smock#note-on-using-smoddit`
    )
  }

  addEnumMembersToStorageLayout(
    contractOutput.storageLayout,
    contractName,
    sourceNodes
  )

  return buildInfo
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
  abi: Array<Fragment>,
  compilerOutput: any,
  sourceName: string,
  contractName: string
): { constructorArgTypes: Array<string>; constructorArgValues: any[] } => {
  const immutableReferences =
    compilerOutput.contracts[sourceName][contractName].evm.deployedBytecode
      .immutableReferences

  const contractConfig = parsedConfig.contracts[referenceName]

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )
  const constructorArgTypes: Array<string> = []
  const constructorArgValues: Array<ParsedConfigVariable> = []
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
  contractName: string,
  parsedContractConfig: ParsedContractConfig
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
            if (
              node.value !== undefined &&
              parsedContractConfig.variables.hasOwnProperty(node.name)
            ) {
              throw new Error(
                `Value for immutable variable "${node.name}" was detected in both the contract ${contractName} and your ChugSplash config file. Immutable variable values may be defined in one or the other, but not both.`
              )
            }

            immutableVariables.push(node.name)
          }
        }
      }
    }
  }
  return immutableVariables
}

/**
 * Reads the storageLayout portion of the compiler artifact for a given contract. Reads the
 * artifact from the local file system.
 *
 * @param fullyQualifiedName Fully qualified name of the contract.
 * @param artifactFolder Relative path to the folder where artifacts are stored.
 * @return Storage layout object from the compiler output.
 */
export const readStorageLayout = (
  fullyQualifiedName: string,
  artifactPaths: ArtifactPaths,
  integration: Integration
): SolidityStorageObj => {
  const { sourceName, contractName } = readContractArtifact(
    artifactPaths,
    fullyQualifiedName,
    integration
  )
  const buildInfo = readBuildInfo(artifactPaths, fullyQualifiedName)
  const output = buildInfo.output.contracts[sourceName][contractName]

  return (output as any).storageLayout
}

export const getDeployedBytecode = async (
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<string> => {
  const deployedBytecode = await provider.getCode(address)
  return deployedBytecode
}

export const createDeploymentArtifacts = async (
  provider: ethers.providers.JsonRpcProvider,
  parsedConfig: ParsedChugSplashConfig,
  finalDeploymentTxnHash: string,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  spinner: ora.Ora,
  networkName: string,
  deploymentFolderPath: string,
  remoteExecution: boolean
) => {
  spinner.start(`Writing deployment artifacts...`)

  createDeploymentFolderForNetwork(networkName, deploymentFolderPath)

  // Save the snapshot ID if we're on the hardhat network.
  if (!remoteExecution) {
    await writeSnapshotId(provider, networkName, deploymentFolderPath)
  }

  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const artifact = readContractArtifact(
      artifactPaths,
      contractConfig.contract,
      integration
    )
    const { sourceName, contractName, bytecode, abi } = artifact

    const buildInfo = readBuildInfo(artifactPaths, contractConfig.contract)

    const { constructorArgValues } = getConstructorArgs(
      parsedConfig,
      referenceName,
      abi,
      buildInfo.output,
      sourceName,
      contractName
    )

    const receipt = await provider.getTransactionReceipt(finalDeploymentTxnHash)

    const metadata =
      buildInfo.output.contracts[sourceName][contractName].metadata

    const { devdoc, userdoc } =
      typeof metadata === 'string'
        ? JSON.parse(metadata).output
        : metadata.output

    const deploymentArtifact = {
      contractName,
      address: contractConfig.proxy,
      abi,
      transactionHash: finalDeploymentTxnHash,
      solcInputHash: buildInfo.id,
      receipt: {
        ...receipt,
        gasUsed: receipt.gasUsed.toString(),
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
        // Exclude the `effectiveGasPrice` if it's undefined, which is the case on Optimism.
        ...(receipt.effectiveGasPrice && {
          effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        }),
      },
      numDeployments: 1,
      metadata:
        typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      args: constructorArgValues,
      bytecode,
      deployedBytecode: await provider.getCode(contractConfig.proxy),
      devdoc,
      userdoc,
      storageLayout: readStorageLayout(
        contractConfig.contract,
        artifactPaths,
        integration
      ),
    }

    writeDeploymentArtifact(
      networkName,
      deploymentFolderPath,
      deploymentArtifact,
      referenceName
    )
  }

  spinner.succeed(`Wrote deployment artifacts.`)
}
