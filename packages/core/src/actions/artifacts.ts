import * as fs from 'fs'

import * as semver from 'semver'
import { remove0x } from '@eth-optimism/core-utils'
import { ethers, utils } from 'ethers'
import ora from 'ora'
import { Fragment } from 'ethers/lib/utils'

import { ParsedChugSplashConfig, ParsedConfigVariable } from '../config'
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
export type ContractASTNode = any

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
  abi: any
): string => {
  const { constructorArgTypes, constructorArgValues } = getConstructorArgs(
    parsedConfig,
    referenceName,
    abi
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
  abi: Array<Fragment>
): {
  constructorArgTypes: Array<string>
  constructorArgValues: ParsedConfigVariable[]
} => {
  const parsedConstructorArgs =
    parsedConfig.contracts[referenceName].constructorArgs

  const constructorArgTypes: Array<string> = []
  const constructorArgValues: Array<ParsedConfigVariable> = []

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )

  if (constructorFragment === undefined) {
    if (Object.keys(parsedConstructorArgs).length > 0) {
      throw new Error(
        `User entered constructor arguments in the ChugSplash file for ${referenceName}, but\n` +
          `no constructor exists in the contract.`
      )
    } else {
      return { constructorArgTypes, constructorArgValues }
    }
  }

  if (
    Object.keys(parsedConstructorArgs).length >
    constructorFragment.inputs.length
  ) {
    const constructorArgNames = constructorFragment.inputs.map(
      (input) => input.name
    )
    const incorrectConstructorArgNames = Object.keys(
      parsedConstructorArgs
    ).filter((argName) => !constructorArgNames.includes(argName))
    throw new Error(
      `User entered an incorrect number of constructor arguments in the ChugSplash file for ${referenceName}.\n` +
        `Please remove the following variables from the 'constructorArgs' field:` +
        `${incorrectConstructorArgNames.map((argName) => `\n${argName}`)}`
    )
  }

  constructorFragment.inputs.forEach((input) => {
    const constructorArgValue = parsedConstructorArgs[input.name]
    if (constructorArgValue === undefined) {
      throw new Error(
        `User did not define the constructor argument '${input.name}' in the ChugSplash file\n` +
          `for ${referenceName}. Please include it in the 'constructorArgs' field in your ChugSplash file.`
      )
    }
    constructorArgTypes.push(input.type)
    constructorArgValues.push(constructorArgValue)
  })

  return { constructorArgTypes, constructorArgValues }
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
      abi
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
