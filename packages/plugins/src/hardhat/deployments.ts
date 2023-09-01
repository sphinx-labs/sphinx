import '@nomicfoundation/hardhat-ethers'
import * as fs from 'fs'
import * as path from 'path'

import { Signer, Contract, Interface, ethers } from 'ethers'
import {
  isEmptySphinxConfig,
  writeSnapshotId,
  getSphinxManagerAddress,
  getTargetAddress,
  UserSalt,
  readUserSphinxConfig,
  getNetworkDirName,
  resolveNetwork,
  getNetworkType,
} from '@sphinx-labs/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

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
 * because this function will throw an error if the signer does not exist in the user's Hardhat
 * config file.
 *
 * @param hre Hardhat Runtime Environment.
 * @param address Address of the signer.
 */
export const getSignerFromAddress = async (
  hre: HardhatRuntimeEnvironment,
  address: string
): Promise<Signer> => {
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
  owner: ethers.Signer,
  userSalt?: UserSalt
): Promise<Contract> => {
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

  return new Contract(
    address,
    new Interface(
      hre.artifacts.readArtifactSync(
        userConfig.contracts[referenceName].contract
      ).abi
    ),
    owner
  )
}

export const resetSphinxDeployments = async (
  hre: HardhatRuntimeEnvironment,
  provider: HardhatEthersProvider
) => {
  const networkType = await getNetworkType(provider)
  const { networkName, chainId } = await resolveNetwork(
    await provider.getNetwork(),
    networkType
  )
  const networkDirName = getNetworkDirName(networkName, networkType, chainId)
  const snapshotIdPath = path.join(
    path.basename(hre.config.paths.deployments),
    networkDirName,
    '.snapshotId'
  )
  const snapshotId = fs.readFileSync(snapshotIdPath, 'utf8')
  const snapshotReverted = await provider.send('evm_revert', [snapshotId])
  if (!snapshotReverted) {
    throw new Error('Snapshot failed to be reverted.')
  }
  await writeSnapshotId(provider, networkDirName, hre.config.paths.deployments)
}
