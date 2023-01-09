import path from 'path'

import * as semver from 'semver'
import {
  SolidityStorageLayout,
  ParsedChugSplashConfig,
  createDeploymentFolderForNetwork,
  writeDeploymentArtifact,
  getConstructorArgs,
  ChugSplashInputs,
  CompilerInput,
  getMinimumCompilerInput,
} from '@chugsplash/core'
import { ethers } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

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
      `Storage layout for ${name} not found. Did you forget to set the storage layout
compiler option in your hardhat config? Read more:
https://github.com/ethereum-optimism/smock#note-on-using-smoddit`
    )
  }

  return (output as any).storageLayout
}

export const getDeployedBytecode = async (
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<string> => {
  const deployedBytecode = await provider.getCode(address)
  return deployedBytecode
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
  parsedConfig: ParsedChugSplashConfig
): Promise<ChugSplashInputs> => {
  const filteredChugSplashInputs: ChugSplashInputs = []
  for (const chugsplashInput of chugsplashInputs) {
    let filteredSources: CompilerInput['sources'] = {}
    for (const contractConfig of Object.values(parsedConfig.contracts)) {
      const { sourceName, contractName } = getContractArtifact(
        contractConfig.contract
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

export const createDeploymentArtifacts = async (
  hre: HardhatRuntimeEnvironment,
  networkName: string,
  parsedConfig: ParsedChugSplashConfig,
  finalDeploymentTxnHash: string
) => {
  writeDeploymentFolderForNetwork(networkName, hre.config.paths.deployments)

  const provider = hre.ethers.provider

  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const artifact = getContractArtifact(contractConfig.contract)
    const { sourceName, contractName, bytecode, abi } = artifact

    const buildInfo = await getBuildInfo(sourceName, contractName)

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
        // TODO: duplicate this for the implementation artifact
        ...(receipt.effectiveGasPrice && {
          effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        },
        numDeployments: 1,
        metadata:
          typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        args: [
          getChugSplashManagerProxyAddress(parsedConfig.options.projectName),
        ],
        bytecode: ProxyArtifact.bytecode,
        deployedBytecode: await provider.getCode(deploymentEvent.args.proxy),
        devdoc,
        userdoc,
        storageLayout,
      }

      // Write the deployment artifact for the proxy contract.
      writeDeploymentArtifact(
        networkName,
        hre.config.paths.deployments,
        proxyArtifact,
        `${deploymentEvent.args.target}Proxy`
      )
    } else if (deploymentEvent.event === 'ImplementationDeployed') {
      // Get the implementation contract's info.
      const referenceName = deploymentEvent.args.target
      const contractConfig = parsedConfig.contracts[referenceName]
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
      const { metadata, storageLayout } =
        buildInfo.output.contracts[sourceName][contractName]
      const { devdoc, userdoc } =
        typeof metadata === 'string'
          ? JSON.parse(metadata).output
          : metadata.output

      // Define the deployment artifact for the implementation contract.
      const implementationArtifact = {
        address: deploymentEvent.args.implementation,
        abi,
        transactionHash: deploymentEvent.transactionHash,
        solcInputHash: buildInfo.id,
        receipt: {
          ...receipt,
          gasUsed: receipt.gasUsed.toString(),
          cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        },
        numDeployments: 1,
        metadata:
          typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        args: constructorArgValues,
        bytecode,
        deployedBytecode: await provider.getCode(
          deploymentEvent.args.implementation
        ),
        devdoc,
        userdoc,
        storageLayout,
      }
      // Write the deployment artifact for the implementation contract.
      writeDeploymentArtifact(
        networkName,
        hre.config.paths.deployments,
        implementationArtifact,
        referenceName
      )
    }

    writeDeploymentArtifact(
      hre.network.name,
      hre.config.paths.deployments,
      deploymentArtifact,
      referenceName
    )
  }
}
