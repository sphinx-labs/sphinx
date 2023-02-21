import { remove0x } from '@eth-optimism/core-utils'
import { ethers, utils } from 'ethers'
import ora from 'ora'
import { Fragment } from 'ethers/lib/utils'

import { ParsedChugSplashConfig, ParsedConfigVariable } from '../config/types'
import {
  ArtifactPaths,
  SolidityStorageLayout,
} from '../languages/solidity/types'
import { Integration } from '../constants'
import {
  addEnumMembersToStorageLayout,
  createDeploymentFolderForNetwork,
  readBuildInfo,
  readContractArtifact,
  writeDeploymentArtifact,
  writeSnapshotId,
} from '../utils'
import 'core-js/features/array/at'

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
 * @param contractFullyQualifiedName Fully qualified name of the contract.
 * @param artifactFolder Relative path to the folder where artifacts are stored.
 * @return Storage layout object from the compiler output.
 */
export const getStorageLayout = (
  buildInfoPath: string,
  contractFullyQualifiedName: string
): SolidityStorageLayout => {
  const buildInfo = readBuildInfo(buildInfoPath)
  const [sourceName, contractName] = contractFullyQualifiedName.split(':')
  const contractOutput = buildInfo.output.contracts[sourceName][contractName]

  addEnumMembersToStorageLayout(contractOutput.storageLayout, buildInfo.output)

  return contractOutput.storageLayout
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
      artifactPaths[referenceName].contractArtifactPath,
      integration
    )
    const { sourceName, contractName, bytecode, abi } = artifact

    const buildInfo = readBuildInfo(artifactPaths[referenceName].buildInfoPath)

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
      storageLayout: getStorageLayout(
        artifactPaths[referenceName].buildInfoPath,
        contractConfig.contract
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
