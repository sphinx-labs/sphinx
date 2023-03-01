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
  readUserChugSplashConfig,
  UserChugSplashConfig,
  getDefaultProxyAddress,
  readParsedChugSplashConfig,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { getArtifactPaths, importOpenZeppelinStorageLayouts } from './artifacts'
import { isRemoteExecution } from './utils'

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
  noCompile: boolean,
  confirm: boolean,
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
    // Skip this config if it's empty.
    if (isEmptyChugSplashConfig(configPath)) {
      return
    }
    const userConfig = readUserChugSplashConfig(configPath)

    const artifactPaths = await getArtifactPaths(
      hre,
      userConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )

    const parsedConfig = await readParsedChugSplashConfig(
      hre.ethers.provider,
      configPath,
      artifactPaths,
      'hardhat'
    )

    const openzeppelinStorageLayouts = await importOpenZeppelinStorageLayouts(
      hre,
      parsedConfig,
      userConfig
    )

    const signer = hre.ethers.provider.getSigner()
    await chugsplashDeployAbstractTask(
      hre.ethers.provider,
      hre.ethers.provider.getSigner(),
      configPath,
      silent,
      remoteExecution,
      ipfsUrl,
      noCompile,
      confirm,
      true,
      await signer.getAddress(),
      artifactPaths,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      true,
      executor,
      openzeppelinStorageLayouts
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
  const userConfigs: UserChugSplashConfig[] = fetchFilesRecursively(
    hre.config.paths.chugsplash
  )
    .filter((configFileName) => {
      return !isEmptyChugSplashConfig(configFileName)
    })
    .map((configFileName) => {
      return readUserChugSplashConfig(configFileName)
    })
    .filter((userCfg) => {
      return (
        Object.keys(userCfg.contracts).includes(referenceName) &&
        userCfg.options.projectName === projectName
      )
    })

  if (userConfigs.length === 0) {
    throw new Error(
      `Cannot find a project named "${projectName}" that contains the reference name "${referenceName}".`
    )
  }

  if (userConfigs.length > 1) {
    throw new Error(
      `Multiple projects named "${projectName}" contain the reference name "${referenceName}"\n` +
        `Please merge these projects or change one of the project names.`
    )
  }

  const userConfig = userConfigs[0]

  const proxyAddress =
    userConfig.contracts[referenceName].externalProxy ||
    getDefaultProxyAddress(userConfig.options.projectName, referenceName)
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
