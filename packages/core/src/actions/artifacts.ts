import { ethers } from 'ethers'
import {
  ProxyABI,
  ProxyArtifact,
  buildInfo as chugsplashBuildInfo,
} from '@chugsplash/contracts'

import { ParsedChugSplashConfig } from '../config/types'
import {
  ArtifactPaths,
  SolidityStorageLayout,
} from '../languages/solidity/types'
import { Integration } from '../constants'
import {
  writeDeploymentFolderForNetwork,
  getConstructorArgs,
  readBuildInfo,
  readContractArtifact,
  writeDeploymentArtifact,
  getChugSplashManagerAddress,
} from '../utils'

import 'core-js/features/array/at'

/**
 * Reads the storageLayout portion of the compiler artifact for a given contract. Reads the
 * artifact from the local file system.
 *
 * @param contractFullyQualifiedName Fully qualified name of the contract.
 * @param artifactFolder Relative path to the folder where artifacts are stored.
 * @return Storage layout object from the compiler output.
 */
export const readStorageLayout = (
  buildInfoPath: string,
  contractFullyQualifiedName: string
): SolidityStorageLayout => {
  const buildInfo = readBuildInfo(buildInfoPath)
  const [sourceName, contractName] = contractFullyQualifiedName.split(':')
  const contractOutput = buildInfo.output.contracts[sourceName][contractName]

  // Foundry artifacts do not contain the storage layout field for contracts which have no storage.
  // So we default to an empty storage layout in this case for consistency.
  return contractOutput.storageLayout ?? { storage: [], types: {} }
}

export const getDeployedBytecode = async (
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<string> => {
  const deployedBytecode = await provider.getCode(address)
  return deployedBytecode
}

export const writeDeploymentArtifacts = async (
  provider: ethers.providers.Provider,
  parsedConfig: ParsedChugSplashConfig,
  deploymentEvents: ethers.Event[],
  networkName: string,
  deploymentFolderPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration
) => {
  writeDeploymentFolderForNetwork(networkName, deploymentFolderPath)

  const managerAddress = getChugSplashManagerAddress(
    parsedConfig.options.claimer,
    parsedConfig.options.organizationID
  )

  for (const deploymentEvent of deploymentEvents) {
    if (!deploymentEvent.args) {
      throw new Error(`Deployment event has no arguments. Should never happen.`)
    }

    const receipt = await deploymentEvent.getTransactionReceipt()

    if (deploymentEvent.event === 'DefaultProxyDeployed') {
      const { metadata, storageLayout } =
        chugsplashBuildInfo.output.contracts[
          '@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol'
        ]['Proxy']
      const { devdoc, userdoc } =
        typeof metadata === 'string'
          ? JSON.parse(metadata).output
          : metadata.output

      // Define the deployment artifact for the proxy.
      const proxyArtifact = {
        address: deploymentEvent.args.proxy,
        abi: ProxyABI,
        transactionHash: deploymentEvent.transactionHash,
        solcInputHash: chugsplashBuildInfo.id,
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
        args: [managerAddress],
        bytecode: ProxyArtifact.bytecode,
        deployedBytecode: await provider.getCode(deploymentEvent.args.proxy),
        devdoc,
        userdoc,
        storageLayout,
      }

      // Write the deployment artifact for the proxy contract.
      writeDeploymentArtifact(
        networkName,
        deploymentFolderPath,
        proxyArtifact,
        `${deploymentEvent.args.referenceName}Proxy`
      )
    } else if (deploymentEvent.event === 'ContractDeployed') {
      // Get the deployed contract's info.
      const referenceName = deploymentEvent.args.referenceName
      const artifact = readContractArtifact(
        artifactPaths[referenceName].contractArtifactPath,
        integration
      )
      const { sourceName, contractName, bytecode, abi } = artifact
      const buildInfo = readBuildInfo(
        artifactPaths[referenceName].buildInfoPath
      )
      const { constructorArgValues } = getConstructorArgs(
        parsedConfig.contracts[referenceName].constructorArgs,
        referenceName,
        abi
      )
      const { metadata, storageLayout } =
        buildInfo.output.contracts[sourceName][contractName]
      const { devdoc, userdoc } =
        typeof metadata === 'string'
          ? JSON.parse(metadata).output
          : metadata.output

      // Define the deployment artifact for the deployed contract.
      const contractArtifact = {
        address: deploymentEvent.args.contractAddress,
        abi,
        transactionHash: deploymentEvent.transactionHash,
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
        deployedBytecode: await provider.getCode(
          deploymentEvent.args.contractAddress
        ),
        devdoc,
        userdoc,
        storageLayout,
      }
      // Write the deployment artifact for the deployed contract.
      writeDeploymentArtifact(
        networkName,
        deploymentFolderPath,
        contractArtifact,
        referenceName
      )
    }
  }
}
