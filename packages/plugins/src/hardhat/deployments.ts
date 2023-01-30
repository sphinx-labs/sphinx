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
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { initializeExecutor } from '../executor'
import { getArtifactPaths } from './artifacts'

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
  const remoteExecution = (await getChainId(hre.ethers.provider)) !== 31337
  fileNames =
    fileNames ?? (await fetchFilesRecursively(hre.config.paths.chugsplash))

  let executor: ChugSplashExecutorType | undefined
  if (!remoteExecution) {
    executor = await initializeExecutor(hre.ethers.provider)
  }

  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
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
      buildInfoFolder,
      artifactFolder,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      true,
      executor
    )
  }
}

export const getContract = async (
  hre: HardhatRuntimeEnvironment,
  provider: ethers.providers.JsonRpcProvider,
  referenceName: string,
  projectName: string
): Promise<ethers.Contract> => {
  if ((await getChainId(provider)) !== 31337) {
    throw new Error('Only the Hardhat Network is currently supported.')
  }
  const configsWithFileNames: {
    userConfig: UserChugSplashConfig
    configFileName: string
  }[] = await fetchFilesRecursively(hre.config.paths.chugsplash)
    .filter((configFileName) => {
      return !isEmptyChugSplashConfig(configFileName)
    })
    .map((configFileName) => {
      const userConfig = readUserChugSplashConfig(configFileName)
      return { configFileName, userConfig }
    })
    .filter(({ userConfig }) => {
      return (
        Object.keys(userConfig.contracts).includes(referenceName) &&
        userConfig.options.projectName === projectName
      )
    })

  // TODO: Make function `getContract(projectName, referenceName)` and change this error message.
  if (configsWithFileNames.length < 1) {
    throw new Error(`Cannot find a config file containing ${referenceName}.`)
  }

  const { userConfig: userCfg } = configsWithFileNames[0]

  const proxyAddress =
    userCfg.contracts[referenceName].proxy ||
    getDefaultProxyAddress(userCfg.options.projectName, referenceName)
  if ((await isContractDeployed(proxyAddress, hre.ethers.provider)) === false) {
    throw new Error(`You must first deploy ${referenceName}.`)
  }

  const Proxy = new ethers.Contract(
    proxyAddress,
    new ethers.utils.Interface(
      hre.artifacts.readArtifactSync(
        userCfg.contracts[referenceName].contract
      ).abi
    ),
    provider.getSigner()
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
