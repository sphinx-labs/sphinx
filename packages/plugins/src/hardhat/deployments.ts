import '@nomiclabs/hardhat-ethers'
import * as fs from 'fs'
import * as path from 'path'

import yesno from 'yesno'
import { ethers } from 'ethers'
import {
  ParsedChugSplashConfig,
  isEmptyChugSplashConfig,
  registerChugSplashProject,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  displayDeploymentTable,
  ChugSplashActionBundle,
  computeBundleId,
  getChugSplashManager,
  checkIsUpgrade,
  checkValidUpgrade,
  getProjectOwnerAddress,
  isProposer,
  getAmountToDeposit,
  isContractDeployed,
  formatEther,
  getGasPriceOverrides,
  loadParsedChugSplashConfig,
  isProjectRegistered,
  getContractArtifact,
  getFinalDeploymentTxnHash,
  monitorExecution,
  postExecutionActions,
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import ora from 'ora'
import { ChugSplashExecutor } from '@chugsplash/executor'

import { createDeploymentArtifacts } from './artifacts'
import { writeHardhatSnapshotId } from './utils'
import {
  chugsplashApproveTask,
  chugsplashCommitSubtask,
  chugsplashFundTask,
  TASK_CHUGSPLASH_VERIFY_BUNDLE,
} from './tasks'
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
  confirm: boolean,
  spinner: ora.Ora = ora({ isSilent: true })
) => {
  const remoteExecution = (await getChainId(hre.ethers.provider)) !== 31337
  const fileNames = fs.readdirSync(hre.config.paths.chugsplash)

  let executor: ChugSplashExecutor
  if (!remoteExecution) {
    executor = await initializeExecutor(hre.ethers.provider)
  }

  for (const fileName of fileNames) {
    const configPath = path.join(hre.config.paths.chugsplash, fileName)
    // Skip this config if it's empty.
    if (isEmptyChugSplashConfig(configPath)) {
      return
    }

    const signer = hre.ethers.provider.getSigner()
    await deployChugSplashConfig(
      hre,
      configPath,
      silent,
      remoteExecution,
      ipfsUrl,
      noCompile,
      confirm,
      true,
      await signer.getAddress(),
      executor,
      spinner
    )
  }
}

export const deployChugSplashConfig = async (
  hre: HardhatRuntimeEnvironment,
  configPath: string,
  silent: boolean,
  remoteExecution: boolean,
  ipfsUrl: string,
  noCompile: boolean,
  confirm: boolean,
  withdraw: boolean,
  newOwner: string,
  executor?: ChugSplashExecutor,
  spinner: ora.Ora = ora({ isSilent: true })
) => {
  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')

  if (executor === undefined && !remoteExecution) {
    throw new Error(
      'You must pass in a ChugSplashExecutor if executing locally'
    )
  }

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const signerAddress = await signer.getAddress()

  spinner.start('Parsing ChugSplash config file...')

  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const projectName = parsedConfig.options.projectName

  const projectPreviouslyRegistered = await isProjectRegistered(
    signer,
    projectName
  )

  spinner.succeed(`Parsed ${projectName}.`)

  if (projectPreviouslyRegistered === false) {
    spinner.start(`Registering ${projectName}...`)
    // Register the project with the signer as the owner. Once we've completed the deployment, we'll
    // transfer ownership to the project owner specified in the config.
    await registerChugSplashProject(
      provider,
      signer,
      signerAddress,
      projectName,
      signerAddress
    )
    spinner.succeed(`Successfully registered ${projectName}.`)
  }

  // Get the bundle ID without publishing anything to IPFS.
  const { bundleId, bundle, configUri } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl,
      commitToIpfs: false,
      noCompile,
      spinner,
    },
    hre
  )

  spinner.start(`Checking the status of ${projectName}...`)

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )
  let currBundleStatus = bundleState.status

  if (currBundleStatus === ChugSplashBundleStatus.COMPLETED) {
    await createDeploymentArtifacts(
      hre,
      parsedConfig,
      await getFinalDeploymentTxnHash(ChugSplashManager, bundleId),
      artifactFolder,
      buildInfoFolder,
      'hardhat',
      spinner
    )
    spinner.succeed(
      `${projectName} was already completed on ${hre.network.name}.`
    )
    displayDeploymentTable(parsedConfig, silent)
    return
  } else if (currBundleStatus === ChugSplashBundleStatus.CANCELLED) {
    spinner.fail(`${projectName} was already cancelled on ${hre.network.name}.`)
    throw new Error(
      `${projectName} was previously cancelled on ${hre.network.name}.`
    )
  }

  if (currBundleStatus === ChugSplashBundleStatus.EMPTY) {
    spinner.succeed(`${projectName} has not been proposed before.`)
    spinner.start(`Proposing ${projectName}...`)
    await proposeChugSplashBundle(
      hre,
      parsedConfig,
      bundle,
      configUri,
      remoteExecution,
      ipfsUrl,
      configPath,
      spinner,
      confirm
    )
    currBundleStatus = ChugSplashBundleStatus.PROPOSED
  }

  if (currBundleStatus === ChugSplashBundleStatus.PROPOSED) {
    spinner.start(`Calculating amount to deposit...`)
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundle,
      0,
      projectName,
      true
    )

    if (amountToDeposit.gt(0)) {
      spinner.succeed(
        `Amount to deposit: ${formatEther(amountToDeposit, 4)} ETH`
      )
      spinner.start(`Funding ${projectName}...`)

      await chugsplashFundTask(
        {
          configPath,
          amount: amountToDeposit,
          silent: true,
        },
        hre
      )

      spinner.succeed(`Funded ${projectName}.`)
    } else {
      spinner.succeed(`Sufficient funds already deposited.`)
    }

    // Approve the deployment.
    await chugsplashApproveTask(
      {
        configPath,
        noWithdraw: false, // This value doesn't matter because we're skipping monitoring deployment
        silent: true,
        skipMonitorStatus: true,
      },
      hre
    )

    currBundleStatus = ChugSplashBundleStatus.APPROVED
  }

  // At this point, we know that the bundle is active.

  if (remoteExecution) {
    await monitorExecution(
      provider,
      signer,
      parsedConfig,
      bundle,
      bundleId,
      spinner,
      'hardhat'
    )
  } else {
    // Use the in-process executor if executing the bundle locally.
    spinner.start('Executing project...')
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundle,
      0,
      projectName,
      true
    )
    await signer.sendTransaction({
      to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      value: amountToDeposit,
    })
    await executor.main(bundleId, hre.config.paths.canonicalConfigs)
    spinner.succeed(`Executed ${projectName}.`)
  }

  const finalDeploymentTxnHash = await getFinalDeploymentTxnHash(
    ChugSplashManager,
    bundleId
  )

  await postExecutionActions(
    provider,
    signer,
    parsedConfig,
    finalDeploymentTxnHash,
    withdraw,
    newOwner,
    spinner
  )

  await createDeploymentArtifacts(
    hre,
    parsedConfig,
    finalDeploymentTxnHash,
    artifactFolder,
    buildInfoFolder,
    'hardhat',
    spinner
  )

  // At this point, the bundle has been completed.
  spinner.succeed(`${projectName} completed!`)
  displayDeploymentTable(parsedConfig, silent)
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
  const networkFolderName =
    hre.network.name === 'localhost' ? 'localhost' : 'hardhat'
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
  await writeHardhatSnapshotId(hre)
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
