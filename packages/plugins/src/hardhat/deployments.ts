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
  readUserChugSplashConfig,
  readValidatedChugSplashConfig,
  getChugSplashManagerAddress,
  getTargetAddress,
} from '@chugsplash/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import ora from 'ora'

import { makeGetConfigArtifacts } from './artifacts'
import { createChugSplashRuntime } from '../cre'

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
 * Deploys a list of ChugSplash config files.
 *
 * @param hre Hardhat Runtime Environment.
 * @param contractName Name of the contract in the config file.
 */
export const deployAllChugSplashProjects = async (
  hre: HardhatRuntimeEnvironment,
  silent: boolean,
  configPath: string,
  projectNames?: string[]
) => {
  const spinner = ora({ isSilent: silent })

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments
  const getConfigArtifacts = makeGetConfigArtifacts(hre)

  const cre = await createChugSplashRuntime(
    false,
    true,
    canonicalConfigPath,
    hre,
    silent
  )

  if (!projectNames) {
    const userConfig = await readUserChugSplashConfig(configPath)
    projectNames = projectNames
      ? projectNames
      : Object.keys(userConfig.projects)
  }

  for (const projectName of projectNames) {
    const { parsedConfig, configArtifacts, configCache } =
      await readValidatedChugSplashConfig(
        configPath,
        projectName,
        hre.ethers.provider,
        cre,
        getConfigArtifacts
      )
    const projectConfig = parsedConfig.projects[projectName]
    await chugsplashDeployAbstractTask(
      provider,
      signer,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      cre,
      projectConfig,
      configCache[projectName],
      configArtifacts[projectName],
      undefined,
      spinner
    )
  }
}

export const getContract = async (
  hre: HardhatRuntimeEnvironment,
  projectName: string,
  referenceName: string,
  userSalt?: string
): Promise<ethers.Contract> => {
  const filteredConfigNames: string[] = fetchFilesRecursively(
    hre.config.paths.chugsplash
  ).filter((configFileName) => {
    return !isEmptyChugSplashConfig(configFileName)
  })

  const resolvedConfigs = await Promise.all(
    filteredConfigNames.map(async (configFileName) => {
      return {
        config: await readUserChugSplashConfig(configFileName),
        filePath: configFileName,
      }
    })
  )

  const userConfigs = resolvedConfigs.filter((resolvedConfig) => {
    const projects = resolvedConfig.config.projects
    if (!projects) {
      return false
    }
    const projectConfig = projects[projectName]
    return (
      projectConfig &&
      Object.keys(projectConfig.contracts).includes(referenceName) &&
      projectConfig.contracts[referenceName].salt === userSalt
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
  const { organizationID } = userConfig.config.options
  const managerAddress = getChugSplashManagerAddress(organizationID)
  const project = userConfig.config.projects[projectName]
  const contractConfig = project.contracts[referenceName]

  const address =
    contractConfig.address ??
    getTargetAddress(
      managerAddress,
      projectName,
      referenceName,
      contractConfig.salt
    )
  if ((await isContractDeployed(address, hre.ethers.provider)) === false) {
    throw new Error(`The contract for ${referenceName} has not been deployed.`)
  }

  const Proxy = new ethers.Contract(
    address,
    new ethers.utils.Interface(
      hre.artifacts.readArtifactSync(
        project.contracts[referenceName].contract
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
