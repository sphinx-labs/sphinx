import { join, sep } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'

import { ConstructorFragment, ethers } from 'ethers'
import {
  BundledSphinxAction,
  ConfigArtifacts,
  ParsedConfig,
  getNetworkDirName,
  getNetworkNameForChainId,
  isDeployContractActionInput,
} from '@sphinx-labs/core'
import { SphinxManagerABI } from '@sphinx-labs/contracts'

import { FoundryBroadcast, FoundryBroadcastReceipt } from './types'

export const writeDeploymentArtifacts = async (
  provider: ethers.Provider,
  parsedConfig: ParsedConfig,
  bundledActions: Array<BundledSphinxAction>,
  broadcast: FoundryBroadcast,
  deploymentFolderPath: string,
  configArtifacts: ConfigArtifacts
): Promise<string> => {
  const managerInterface = new ethers.Interface(SphinxManagerABI)


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

  // TODO: handle the situation where there are multiple contracts

  for (const action of bundledActions) {
    for (const address of Object.keys(action.contracts)) {
      const { fullyQualifiedName, initCodeWithArgs } = action.contracts[address]

      const receipt: any = []
      // const receipt = broadcast.transactions.find((tx) =>
      //   {
      //     tx.transaction.to === parsedConfig.managerAddress &&

      //   }
      // )

      // if (!receipt) {
      //   throw new Error(
      //     `Could not find transaction receipt for the deployment of ${action.referenceName} at ${action.create3Address}`
      //   )
      // }

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
      // const contractArtifact = {
      //   address,
      //   abi,
      //   transactionHash: receipt.transactionHash,
      //   solcInputHash: buildInfo.id,
      //   receipt: {
      //     ...receipt,
      //     gasUsed: receipt.gasUsed.toString(),
      //     cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
      //     // Exclude the `gasPrice` if it's undefined
      //     ...(receipt.effectiveGasPrice && {
      //       gasPrice: receipt.effectiveGasPrice.toString(),
      //     }),
      //   },
      //   numDeployments: 1,
      //   metadata:
      //     typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      //   args: constructorArgValues,
      //   bytecode,
      //   deployedBytecode: await provider.getCode(address),
      //   devdoc,
      //   userdoc,
      //   storageLayout,
      // }

      // // Write the deployment artifact for the deployed contract.
      // const artifactPath = join(
      //   deploymentFolderPath,
      //   networkDirName,
      //   `${contractName}.json`
      // )
      // writeFileSync(artifactPath, JSON.stringify(contractArtifact, null, '\t'))
    }
  }

  const deploymentArtifactsPath = join(
    deploymentFolderPath,
    networkDirName,
    sep
  )
  return deploymentArtifactsPath
}
