import '@nomiclabs/hardhat-ethers'
import * as fs from 'fs'
import * as path from 'path'

import yesno from 'yesno'
import { ethers } from 'ethers'
import {
  ParsedChugSplashConfig,
  isEmptyChugSplashConfig,
  ChugSplashActionBundle,
  computeBundleId,
  getChugSplashManager,
  checkIsUpgrade,
  checkValidUpgrade,
  getProjectOwnerAddress,
  isProposer,
  isContractDeployed,
  getGasPriceOverrides,
  loadParsedChugSplashConfig,
  getContractArtifact,
  chugsplashDeployAbstractTask,
  writeSnapshotId,
  resolveNetworkName,
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import ora from 'ora'
import { ChugSplashExecutor } from '@chugsplash/executor'

import { chugsplashCommitSubtask, TASK_CHUGSPLASH_VERIFY_BUNDLE } from './tasks'
import { initializeExecutor } from '../executor'

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
  confirm: boolean
) => {
  const remoteExecution = (await getChainId(hre.ethers.provider)) !== 31337
  const fileNames = fs.readdirSync(hre.config.paths.chugsplash)

  let executor: ChugSplashExecutor
  if (!remoteExecution) {
    executor = await initializeExecutor(hre.ethers.provider)
  }

  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments

  for (const fileName of fileNames) {
    const configPath = path.join(hre.config.paths.chugsplash, fileName)
    // Skip this config if it's empty.
    if (isEmptyChugSplashConfig(configPath)) {
      return
    }

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
      buildInfoFolder,
      artifactFolder,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      executor
    )
  }
}

export const getContract = async (
  hre: HardhatRuntimeEnvironment,
  provider: ethers.providers.JsonRpcProvider,
  referenceName: string
): Promise<ethers.Contract> => {
  if ((await getChainId(provider)) !== 31337) {
    throw new Error('Only the Hardhat Network is currently supported.')
  }
  const configsWithFileNames: {
    config: ParsedChugSplashConfig
    configFileName: string
  }[] = fs
    .readdirSync(hre.config.paths.chugsplash)
    .filter((configFileName) => {
      return !isEmptyChugSplashConfig(path.join('chugsplash', configFileName))
    })
    .map((configFileName) => {
      const config = loadParsedChugSplashConfig(
        path.join('chugsplash', configFileName)
      )
      return { configFileName, config }
    })
    .filter(({ config }) => {
      return Object.keys(config.contracts).includes(referenceName)
    })

  // TODO: Make function `getContract(projectName, target)` and change this error message.
  if (configsWithFileNames.length > 1) {
    throw new Error(
      `Multiple config files contain the reference name: ${referenceName}. Reference names
must be unique for now. Config files containing ${referenceName}:
${configsWithFileNames.map(
  (cfgWithFileName) => cfgWithFileName.configFileName
)}\n`
    )
  } else if (configsWithFileNames.length === 0) {
    throw new Error(`Cannot find a config file containing ${referenceName}.`)
  }

  const { config: cfg } = configsWithFileNames[0]

  const proxyAddress = cfg.contracts[referenceName].proxy
  if ((await isContractDeployed(proxyAddress, hre.ethers.provider)) === false) {
    throw new Error(`You must first deploy ${referenceName}.`)
  }

  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')

  const Proxy = new ethers.Contract(
    proxyAddress,
    new ethers.utils.Interface(
      getContractArtifact(
        cfg.contracts[referenceName].contract,
        artifactFolder,
        'hardhat'
      ).abi
    ),
    provider.getSigner()
  )

  return Proxy
}

export const resetChugSplashDeployments = async (
  hre: HardhatRuntimeEnvironment
) => {
  const networkFolderName = resolveNetworkName(hre.ethers.provider, 'hardhat')
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

export const proposeChugSplashBundle = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  bundle: ChugSplashActionBundle,
  configUri: string,
  remoteExecution: boolean,
  ipfsUrl: string,
  configPath: string,
  spinner: ora.Ora = ora({ isSilent: true }),
  confirm: boolean
) => {
  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const signerAddress = await signer.getAddress()
  const projectName = parsedConfig.options.projectName

  // Throw an error if the caller isn't the project owner or a proposer.
  if (
    signerAddress !==
      (await getProjectOwnerAddress(
        hre.ethers.provider.getSigner(),
        projectName
      )) &&
    !(await isProposer(provider, projectName, signerAddress))
  ) {
    throw new Error(
      `Caller is not a proposer or the project owner. Caller's address: ${signerAddress}`
    )
  }

  // Determine if the deployment is an upgrade
  spinner.start(
    `Checking if ${projectName} is a fresh deployment or upgrade...`
  )
  const upgradeReferenceName = await checkIsUpgrade(
    hre.ethers.provider,
    parsedConfig
  )
  if (upgradeReferenceName) {
    // Check if upgrade is valid
    await checkValidUpgrade(
      hre.ethers.provider,
      parsedConfig,
      configPath,
      hre.network.name
    )

    spinner.succeed(`${projectName} is an upgrade.`)

    if (!confirm) {
      // Confirm upgrade with user
      const userConfirmed = await yesno({
        question: `Prior deployment(s) detected for project ${projectName}, would you like to perform an upgrade? (y/n)`,
      })
      if (!userConfirmed) {
        throw new Error(
          `User denied upgrade. The reference name ${upgradeReferenceName} inside ${projectName} was already used
in a previous deployment for this project. To perform a fresh deployment of a new project, you must change the project name to
something other than ${projectName}. If you wish to deploy a new contract within this project you must change the
reference name to something other than ${upgradeReferenceName}.`
        )
      }
    }
  } else {
    spinner.succeed(`${projectName} is not an upgrade.`)
  }

  spinner.start(`Proposing ${projectName}...`)

  const ChugSplashManager = getChugSplashManager(
    hre.ethers.provider.getSigner(),
    projectName
  )

  const chainId = await getChainId(hre.ethers.provider)

  if (remoteExecution || chainId !== 31337) {
    // Commit the bundle to IPFS if the network is live (i.e. not the local Hardhat network) or
    // if we explicitly specify remote execution.
    await chugsplashCommitSubtask(
      {
        parsedConfig,
        ipfsUrl,
        commitToIpfs: true,
        noCompile: true,
      },
      hre
    )
    // Verify that the bundle has been committed to IPFS with the correct bundle hash.
    await hre.run(TASK_CHUGSPLASH_VERIFY_BUNDLE, {
      configUri,
      bundleId: computeBundleId(bundle.root, bundle.actions.length, configUri),
      ipfsUrl,
    })
  }
  // Propose the bundle.
  await (
    await ChugSplashManager.proposeChugSplashBundle(
      bundle.root,
      bundle.actions.length,
      configUri,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Proposed ${projectName}.`)
}
