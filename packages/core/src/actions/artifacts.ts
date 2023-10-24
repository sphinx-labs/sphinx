import { ConstructorFragment, ethers } from 'ethers'

import {
  ConfigArtifacts,
  DeploymentInfo,
  ParsedConfig,
  SolidityDeployContractActionInput,
} from '../config/types'
import {
  CompilerOutput,
  SolidityStorageLayout,
} from '../languages/solidity/types'
import {
  writeDeploymentFolderForNetwork,
  getFunctionArgValueArray,
  writeDeploymentArtifact,
  isDeployContractActionInput,
} from '../utils'
import 'core-js/features/array/at'
import { SphinxJsonRpcProvider } from '../provider'
import { getCreate3Address, getCreate3Salt } from '../config'

/**
 * Gets the storage layout for a contract. Still requires the build info compiler input
 * which is acceptable b/c this function is only used during out local development and testing.
 * This function should not be used in production.
 *
 * @param contractFullyQualifiedName Fully qualified name of the contract.
 * @param artifactFolder Relative path to the folder where artifacts are stored.
 * @return Storage layout object from the compiler output.
 */
export const getStorageLayout = (
  compilerOutput: CompilerOutput,
  sourceName: string,
  contractName: string
): SolidityStorageLayout => {
  const contractOutput = compilerOutput.contracts[sourceName][contractName]

  // Foundry artifacts do not contain the storage layout field for contracts which have no storage.
  // So we default to an empty storage layout in this case for consistency.
  return contractOutput.storageLayout ?? { storage: [], types: {} }
}

export const getDeployedBytecode = async (
  provider: SphinxJsonRpcProvider,
  address: string
): Promise<string> => {
  const deployedBytecode = await provider.getCode(address)
  return deployedBytecode
}

export const writeDeploymentArtifacts = async (
  provider: ethers.Provider,
  deploymentInfo: DeploymentInfo,
  deploymentEvents: ethers.EventLog[],
  networkDirName: string,
  deploymentFolderPath: string,
  configArtifacts: ConfigArtifacts
) => {
  writeDeploymentFolderForNetwork(networkDirName, deploymentFolderPath)

  const deploymentActions = deploymentInfo.deployments.filter((a) => !a.skip)

  for (const action of deploymentActions) {
    const create3Address = getCreate3Address(
      deploymentInfo.managerAddress,
      getCreate3Salt(action.referenceName, action.userSalt)
    )

    const deploymentEvent = deploymentEvents.find(
      (e) => e.args.contractAddress === create3Address
    )

    if (!deploymentEvent) {
      throw new Error(
        `Could not find deployment event for ${action.referenceName}. Should never happen.`
      )
    }

    const receipt = await deploymentEvent.getTransactionReceipt()

    // TODO(upgrades)
    // if (parsedConfig.contracts[referenceName].kind === 'proxy') {
    //   // The deployment event is for a default proxy.
    //   const { metadata, storageLayout } =
    //     sphinxBuildInfo.output.contracts[
    //       '@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol'
    //     ]['Proxy']
    //   const { devdoc, userdoc } =
    //     typeof metadata === 'string'
    //       ? JSON.parse(metadata).output
    //       : metadata.output

    //   // Define the deployment artifact for the proxy.
    //   const proxyArtifact = {
    //     address: contractAddress,
    //     abi: ProxyABI,
    //     transactionHash: deploymentEvent.transactionHash,
    //     solcInputHash: sphinxBuildInfo.id,
    //     receipt: {
    //       ...receipt,
    //       gasUsed: receipt.gasUsed.toString(),
    //       cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
    //       // Exclude the `gasPrice` if it's undefined
    //       ...(receipt.gasPrice && {
    //         gasPrice: receipt.gasPrice.toString(),
    //       }),
    //     },
    //     numDeployments: 1,
    //     metadata:
    //       typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
    //     args: [managerAddress],
    //     bytecode: ProxyArtifact.bytecode,
    //     deployedBytecode: await provider.getCode(contractAddress),
    //     devdoc,
    //     userdoc,
    //     storageLayout,
    //   }

    //   // Write the deployment artifact for the proxy contract.
    //   writeDeploymentArtifact(
    //     networkDirName,
    //     deploymentFolderPath,
    //     proxyArtifact,
    //     `${referenceName}Proxy`
    //   )
    // } else {

    const { artifact, buildInfo } = configArtifacts[action.fullyQualifiedName]
    const { bytecode, abi, metadata } = artifact
    const iface = new ethers.Interface(abi)
    const coder = ethers.AbiCoder.defaultAbiCoder()

    const constructorFragment = iface.fragments.find(
      ConstructorFragment.isFragment
    )
    const constructorArgValues = constructorFragment
      ? coder.decode(constructorFragment.inputs, action.constructorArgs)
      : []
    const storageLayout = artifact.storageLayout ?? { storage: [], types: {} }
    const { devdoc, userdoc } =
      typeof metadata === 'string'
        ? JSON.parse(metadata).output
        : metadata.output

    // Define the deployment artifact for the deployed contract.
    const contractArtifact = {
      address: create3Address,
      abi,
      transactionHash: deploymentEvent.transactionHash,
      solcInputHash: buildInfo.id,
      receipt: {
        ...receipt,
        gasUsed: receipt.gasUsed.toString(),
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
        // Exclude the `gasPrice` if it's undefined
        ...(receipt.gasPrice && {
          gasPrice: receipt.gasPrice.toString(),
        }),
      },
      numDeployments: 1,
      metadata:
        typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      args: constructorArgValues,
      bytecode,
      deployedBytecode: await provider.getCode(create3Address),
      devdoc,
      userdoc,
      storageLayout,
    }
    // Write the deployment artifact for the deployed contract.
    writeDeploymentArtifact(
      networkDirName,
      deploymentFolderPath,
      contractArtifact,
      action.referenceName
    )
  }
}

export const getStorageSlotKey = (
  fullyQualifiedName: string,
  storageLayout: SolidityStorageLayout,
  varName: string
): string => {
  const storageObj = storageLayout.storage.find((s) => s.label === varName)

  if (!storageObj) {
    throw new Error(
      `Could not find storage slot key for: ${fullyQualifiedName}`
    )
  }

  return storageObj.slot
}
