import '@nomiclabs/hardhat-ethers'
import * as fs from 'fs'
import * as path from 'path'

import { ethers } from 'ethers'
import {
  isEmptyChugSplashConfig,
  isContractDeployed,
  chugsplashDeployAbstractTask,
  writeSnapshotId,
  resolveNetworkName,
  ChugSplashExecutorType,
  getDefaultProxyAddress,
  readUnvalidatedChugSplashConfig,
  readValidatedChugSplashConfig,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { getArtifactPaths } from './artifacts'
import { isRemoteExecution } from './utils'
import { createChugSplashRuntime } from '../utils'

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
 * TODO
 *
 * @param hre Hardhat Runtime Environment.
 * @param contractName Name of the contract in the config file.
 */
export const deployAllChugSplashConfigs = async (
  hre: HardhatRuntimeEnvironment,
  silent: boolean,
  ipfsUrl: string,
  fileNames?: string[]
) => {
  const remoteExecution = await isRemoteExecution(hre)
  fileNames =
    fileNames ?? (await fetchFilesRecursively(hre.config.paths.chugsplash))

  let executor: ChugSplashExecutorType | undefined
  if (!remoteExecution) {
    executor = hre.chugsplash.executor
  }

  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments

  for (const configPath of fileNames) {
    const cre = await createChugSplashRuntime(
      configPath,
      remoteExecution,
      true,
      hre,
      silent
    )

    // Skip this config if it's empty.
    if (isEmptyChugSplashConfig(configPath)) {
      continue
    }
    const userConfig = await readUnvalidatedChugSplashConfig(configPath)

    const artifactPaths = await getArtifactPaths(
      hre,
      userConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )

    const parsedConfig = await readValidatedChugSplashConfig(
      hre.ethers.provider,
      configPath,
      artifactPaths,
      'hardhat',
      cre
    )

    const signer = hre.ethers.provider.getSigner()
    await chugsplashDeployAbstractTask(
      hre.ethers.provider,
      hre.ethers.provider.getSigner(),
      configPath,
      remoteExecution,
      ipfsUrl,
      true,
      await signer.getAddress(),
      false,
      artifactPaths,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      cre,
      parsedConfig,
      executor
    )
  }
}

export const getContract = async (
  hre: HardhatRuntimeEnvironment,
  projectName: string,
  referenceName: string
): Promise<ethers.Contract> => {
  if (await isRemoteExecution(hre)) {
    throw new Error('Only the Hardhat Network is currently supported.')
  }
  const filteredConfigNames: string[] = fetchFilesRecursively(
    hre.config.paths.chugsplash
  ).filter((configFileName) => {
    return !isEmptyChugSplashConfig(configFileName)
  })

  const resolvedConfigs = await Promise.all(
    filteredConfigNames.map((configFileName) => {
      return readUnvalidatedChugSplashConfig(configFileName)
    })
  )

  const userConfigs = resolvedConfigs.filter((userCfg) => {
    return (
      Object.keys(userCfg.contracts).includes(referenceName) &&
      userCfg.options.projectName === projectName
    )
  })

  if (userConfigs.length === 0) {
    throw new Error(
      `Cannot find a project with ID "${projectName}" that contains the reference name "${referenceName}".`
    )
  }

  if (userConfigs.length > 1) {
    throw new Error(
      `Multiple projects with ID "${projectName}" contain the reference name "${referenceName}"\n` +
        `Please merge these projects or change one of the organization IDs.`
    )
  }

  const userConfig = userConfigs[0]

  const proxyAddress =
    userConfig.contracts[referenceName].externalProxy ||
    getDefaultProxyAddress(userConfig.options.organizationID, referenceName)
  if ((await isContractDeployed(proxyAddress, hre.ethers.provider)) === false) {
    throw new Error(`The proxy for ${referenceName} has not been deployed.`)
  }

  const Proxy = new ethers.Contract(
    proxyAddress,
    new ethers.utils.Interface(
      hre.artifacts.readArtifactSync(
        userConfig.contracts[referenceName].contract
      ).abi
    ),
    hre.ethers.provider.getSigner()
  )

  return Proxy
}

export const resetChugSplashDeployments = async (
  hre: HardhatRuntimeEnvironment
) => {
  const networkFolderName = await resolveNetworkName(
    hre.ethers.provider,
    'hardhat'
  )
  const snapshotIdPath = path.join(
    path.basename(hre.config.paths.deployments),
    networkFolderName,
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
    networkFolderName,
    hre.config.paths.deployments
  )
}
