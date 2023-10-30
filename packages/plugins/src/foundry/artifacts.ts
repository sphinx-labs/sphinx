import { join, sep } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'

import { ConstructorFragment, ethers } from 'ethers'
import {
  ConfigArtifacts,
  ParsedConfig,
  getNetworkDirName,
  getNetworkNameForChainId,
  isDeployContractActionInput,
} from '@sphinx-labs/core'
import { SphinxManagerABI } from '@sphinx-labs/contracts'

import { FoundryBroadcastReceipt } from './types'

export const writeDeploymentArtifacts = async (
  provider: ethers.Provider,
  parsedConfig: ParsedConfig,
  receipts: Array<FoundryBroadcastReceipt>,
  deploymentFolderPath: string,
  configArtifacts: ConfigArtifacts
): Promise<string> => {
  const managerInterface = new ethers.Interface(SphinxManagerABI)
  const eventFragment = managerInterface.getEvent('ContractDeployed')
  if (!eventFragment) {
    throw new Error(
      `Could not find the ContractDeployed fragment in the SphinxManager. Should never happen.`
    )
  }

  const networkName = getNetworkNameForChainId(BigInt(parsedConfig.chainId))
  const networkDirName = getNetworkDirName(
    networkName,
    parsedConfig.isLiveNetwork,
    Number(parsedConfig.chainId)
  )

  const networkPath = join(deploymentFolderPath, networkDirName)
  if (!existsSync(networkPath)) {
    mkdirSync(networkPath, { recursive: true })
  }

  for (const address of Object.keys(parsedConfig.verify)) {
    const { fullyQualifiedName, initCodeWithArgs } =
      parsedConfig.verify[address]

    // const receipt = receipts.find((r) =>
    //   r.logs.some(
    //     (l) =>
    //       l.address === parsedConfig.managerAddress &&
    //       l.topics.length > 0 &&
    //       l.topics[0] === eventFragment.topicHash &&
    //       managerInterface.decodeEventLog(eventFragment, l.data, l.topics)
    //         .contractAddress === action.create3Address
    //   )
    // )

    if (!receipt) {
      throw new Error(
        `Could not find transaction receipt for the deployment of ${action.referenceName} at ${action.create3Address}`
      )
    }

    const { artifact, buildInfo } = configArtifacts[fullyQualifiedName]
    const { bytecode, abi, metadata, contractName } = artifact
    const iface = new ethers.Interface(abi)
    const coder = ethers.AbiCoder.defaultAbiCoder()

    // Get the ABI encoded constructor arguments. We use the length of the `artifact.bytecode` to
    // determine where the contract's creation code ends and the constructor arguments begin. This
    // method works even if the `artifact.bytecode` contains externally linked library placeholders
    // or immutable variable placeholders, which are always the same length as the real values.
    const encodedConstructorArgs = ethers.dataSlice(
      initCodeWithArgs,
      ethers.dataLength(bytecode)
    )

    const constructorFragment = iface.fragments.find(
      ConstructorFragment.isFragment
    )
    const constructorArgValues = constructorFragment
      ? coder.decode(constructorFragment.inputs, encodedConstructorArgs)
      : []
    const storageLayout = artifact.storageLayout ?? { storage: [], types: {} }
    const { devdoc, userdoc } =
      typeof metadata === 'string'
        ? JSON.parse(metadata).output
        : metadata.output

    // Define the deployment artifact for the deployed contract.
    const contractArtifact = {
      address,
      abi,
      transactionHash: receipt.transactionHash,
      solcInputHash: buildInfo.id,
      receipt: {
        ...receipt,
        gasUsed: receipt.gasUsed.toString(),
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
        // Exclude the `gasPrice` if it's undefined
        ...(receipt.effectiveGasPrice && {
          gasPrice: receipt.effectiveGasPrice.toString(),
        }),
      },
      numDeployments: 1,
      metadata:
        typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      args: constructorArgValues,
      bytecode,
      deployedBytecode: await provider.getCode(address),
      devdoc,
      userdoc,
      storageLayout,
    }

    // Write the deployment artifact for the deployed contract.
    const artifactPath = join(
      deploymentFolderPath,
      networkDirName,
      `${contractName}.json`
    )
    writeFileSync(artifactPath, JSON.stringify(contractArtifact, null, '\t'))
  }

  const deploymentArtifactsPath = join(
    deploymentFolderPath,
    networkDirName,
    sep
  )
  return deploymentArtifactsPath
}
