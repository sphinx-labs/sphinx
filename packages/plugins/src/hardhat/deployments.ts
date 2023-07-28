import '@nomiclabs/hardhat-ethers'
import * as fs from 'fs'
import * as path from 'path'

import { Signer, ethers } from 'ethers'
import {
  isEmptySphinxConfig,
  isContractDeployed,
  writeSnapshotId,
  getSphinxManagerAddress,
  getTargetAddress,
  UserSalt,
  readUserSphinxConfig,
  getNetworkDirName,
  resolveNetwork,
  getNetworkType,
} from '@sphinx/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

export const fetchFilesRecursively = (dir): string[] => {
  const paths: string[] = []
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      paths.push(...fetchFilesRecursively(fullPath))
    } else if (entry.isFile()) {
      paths.push(fullPath)
    } else {
      console.error(`unexpected path: ${fullPath}`)
    }
  })

  return paths
}

/**
 * Returns the signer for the given address. This is different from Hardhat's `getSigners` function
 * because it will throw an error if the signer does not exist in the user's Hardhat config file.
 *
 * @param hre Hardhat Runtime Environment.
 * @param address Address of the signer.
 */
export const getSignerFromAddress = async (
  hre: HardhatRuntimeEnvironment,
  address: string
): Promise<ethers.Signer> => {
  const signers = await hre.ethers.getSigners()
  const signer = signers.find((s) => s.address === address)

  if (!signer) {
    const { chainId } = await hre.ethers.provider.getNetwork()
    throw new Error(
      `Could not find the signer for the address: ${address}.\n` +
        `Please include this signer in your Hardhat config file for the chain ID: ${chainId}`
    )
  }
  return signer
}

export const getContract = async (
  hre: HardhatRuntimeEnvironment,
  projectName: string,
  referenceName: string,
  owner: Signer,
  userSalt?: UserSalt
): Promise<ethers.Contract> => {
  const filteredConfigNames: string[] = fetchFilesRecursively(
    hre.config.paths.sphinx
  ).filter((configFileName) => {
    return !isEmptySphinxConfig(configFileName)
  })

  const resolvedConfigs = await Promise.all(
    filteredConfigNames.map(async (configFileName) => {
      return {
        config: await readUserSphinxConfig(configFileName),
        filePath: configFileName,
      }
    })
  )

  const userConfigs = resolvedConfigs.filter((resolvedConfig) => {
    const config = resolvedConfig.config
    if (!config.projectName) {
      return false
    }
    return (
      config.projectName === projectName &&
      Object.keys(config.contracts).includes(referenceName) &&
      config.contracts[referenceName].salt === userSalt
    )
  })

  if (userConfigs.length === 0) {
    throw new Error(
      `Cannot find a project called "${projectName}" that contains the reference name "${referenceName}".`
    )
  }

  if (userConfigs.length > 1) {
    throw new Error(
      `Multiple projects called "${projectName}" contain the reference name "${referenceName}"\n` +
        `Please merge these projects or change one of the project names.`
    )
  }

  const { config: userConfig } = userConfigs[0]
  const manager = getSphinxManagerAddress(await owner.getAddress(), projectName)
  const contractConfig = userConfig.contracts[referenceName]

  const address =
    contractConfig.address ??
    getTargetAddress(manager, referenceName, contractConfig.salt)
  if ((await isContractDeployed(address, hre.ethers.provider)) === false) {
    throw new Error(
      `The contract for ${referenceName} has not been deployed. Address: ${address}`
    )
  }

  const Proxy = new ethers.Contract(
    address,
    new ethers.utils.Interface(
      hre.artifacts.readArtifactSync(
        userConfig.contracts[referenceName].contract
      ).abi
    ),
    hre.ethers.provider.getSigner()
  )

  return Proxy
}

export const resetSphinxDeployments = async (
  hre: HardhatRuntimeEnvironment,
  provider: ethers.providers.JsonRpcProvider
) => {
  const networkType = await getNetworkType(provider)
  const { networkName, chainId } = await resolveNetwork(provider, networkType)
  const networkDirName = getNetworkDirName(networkName, networkType, chainId)
  const snapshotIdPath = path.join(
    path.basename(hre.config.paths.deployments),
    networkDirName,
    '.snapshotId'
  )
  const snapshotId = fs.readFileSync(snapshotIdPath, 'utf8')
  const snapshotReverted = await hre.network.provider.send('evm_revert', [
    snapshotId,
  ])
  if (!snapshotReverted) {
    throw new Error('Snapshot failed to be reverted.')
  }
  await writeSnapshotId(
    hre.ethers.provider,
    networkDirName,
    hre.config.paths.deployments
  )
}
