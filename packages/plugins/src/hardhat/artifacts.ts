import {
  ParsedChugSplashConfig,
  createDeploymentFolderForNetwork,
  writeDeploymentArtifact,
  getConstructorArgs,
  getContractArtifact,
  getStorageLayout,
  getBuildInfo,
  Integration,
} from '@chugsplash/core'
import { ethers } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

export const getDeployedBytecode = async (
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<string> => {
  const deployedBytecode = await provider.getCode(address)
  return deployedBytecode
}

export const createDeploymentArtifacts = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  finalDeploymentTxnHash: string,
  artifactFolder: string,
  buildInfoFolder: string,
  integration: Integration
) => {
  createDeploymentFolderForNetwork(
    hre.network.name,
    hre.config.paths.deployments
  )

  const provider = hre.ethers.provider

  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const artifact = getContractArtifact(
      contractConfig.contract,
      artifactFolder,
      integration
    )
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
      storageLayout: await getStorageLayout(
        contractConfig.contract,
        artifactFolder,
        buildInfoFolder,
        integration
      ),
    }

    writeDeploymentArtifact(
      hre.network.name,
      hre.config.paths.deployments,
      deploymentArtifact,
      referenceName
    )
  }
}
