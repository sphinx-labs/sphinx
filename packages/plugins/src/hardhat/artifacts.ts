import path from 'path'

import * as semver from 'semver'
import {
  SolidityStorageLayout,
  ChugSplashConfig,
  CanonicalChugSplashConfig,
  createDeploymentFolderForNetwork,
  writeDeploymentArtifact,
} from '@chugsplash/core'
import { add0x, remove0x } from '@eth-optimism/core-utils'
import { ethers, utils } from 'ethers'
import {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
} from 'hardhat/builtin-tasks/task-names'
import { SolcBuild } from 'hardhat/types'

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

export const getCreationCode = (
  bytecode: string,
  parsedConfig: ChugSplashConfig,
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

// TODO: I think this should go in /core now that we don't rely on hardhat as a dependency.
// We could potentially move other contracts in here to core too.
export const getConstructorArgs = (
  parsedConfig: ChugSplashConfig,
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

export const getArtifactsFromParsedCanonicalConfig = async (
  hre: any,
  parsedCanonicalConfig: CanonicalChugSplashConfig
): Promise<{ [referenceName: string]: any }> => {
  const compilerOutputs: any[] = []
  // Get the compiler output for each compiler input.
  for (const compilerInput of parsedCanonicalConfig.inputs) {
    const solcBuild: SolcBuild = await hre.run(
      TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
      {
        quiet: true,
        solcVersion: compilerInput.solcVersion,
      }
    )

    let compilerOutput: any // TODO: Compiler output type
    if (solcBuild.isSolcJs) {
      compilerOutput = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, {
        input: compilerInput.input,
        solcJsPath: solcBuild.compilerPath,
      })
    } else {
      compilerOutput = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLC, {
        input: compilerInput.input,
        solcPath: solcBuild.compilerPath,
      })
    }
    compilerOutputs.push(compilerOutput)
  }

  const artifacts = {}
  // Generate an artifact for each contract in the ChugSplash config.
  for (const [referenceName, contractConfig] of Object.entries(
    parsedCanonicalConfig.contracts
  )) {
    let compilerOutputIndex = 0
    while (artifacts[referenceName] === undefined) {
      // Iterate through the sources in the current compiler output to find the one that
      // contains this contract.
      const compilerOutput = compilerOutputs[compilerOutputIndex]
      for (const [sourceName, sourceOutput] of Object.entries(
        compilerOutput.contracts
      )) {
        // Check if the current source contains the contract.
        if (sourceOutput.hasOwnProperty(contractConfig.contract)) {
          const contractOutput = sourceOutput[contractConfig.contract]

          const creationCode = getCreationCode(
            add0x(contractOutput.evm.bytecode.object),
            parsedCanonicalConfig,
            referenceName,
            contractOutput.abi,
            compilerOutput,
            sourceName,
            contractConfig.contract
          )
          const immutableVariables = getImmutableVariables(
            compilerOutput,
            sourceName,
            contractConfig.contract
          )

          artifacts[referenceName] = {
            creationCode,
            storageLayout: contractOutput.storageLayout,
            immutableVariables,
            abi: contractOutput.abi,
            compilerOutput,
            sourceName,
            contractName: contractConfig.contract,
          }
          // We can exit the loop at this point since each contract only has a single artifact
          // associated with it.
          break
        }
      }
      compilerOutputIndex += 1
    }
  }
  return artifacts
}

export const createDeploymentArtifacts = async (
  hre: any,
  parsedConfig: ChugSplashConfig,
  finalDeploymentTxnHash: string
) => {
  createDeploymentFolderForNetwork(hre.network.name, hre.config.paths.deployed)

  const provider = hre.ethers.provider

  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const artifact = getContractArtifact(contractConfig.contract)
    const { sourceName, contractName, bytecode, abi } = artifact

    const buildInfo = await getBuildInfo(sourceName, contractName)

    const { constructorArgValues } = getConstructorArgs(
      parsedConfig,
      referenceName,
      abi,
      buildInfo.output,
      sourceName,
      contractName
    )

    const metadata =
      buildInfo.output.contracts[sourceName][contractName].metadata
    const { devdoc, userdoc } = JSON.parse(metadata).output

    const deploymentArtifact = {
      contractName,
      address: contractConfig.address,
      abi,
      transactionHash: finalDeploymentTxnHash,
      solcInputHash: buildInfo.id,
      receipt: await provider.getTransactionReceipt(finalDeploymentTxnHash),
      numDeployments: 1,
      metadata,
      args: constructorArgValues,
      bytecode,
      deployedBytecode: await provider.getCode(contractConfig.address),
      devdoc,
      userdoc,
      storageLayout: await getStorageLayout(contractConfig.contract),
    }

    writeDeploymentArtifact(
      hre.network.name,
      hre.config.paths.deployed,
      deploymentArtifact,
      referenceName
    )
  }
}
