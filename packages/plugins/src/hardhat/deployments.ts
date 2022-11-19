import * as path from 'path'
import * as fs from 'fs'

import '@nomiclabs/hardhat-ethers'
import { ethers } from 'ethers'
import {
  ChugSplashConfig,
  getProxyAddress,
  isEmptyChugSplashConfig,
  registerChugSplashProject,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  isProxyDeployed,
  displayDeploymentTable,
  ChugSplashActionBundle,
  computeBundleId,
  getChugSplashManager,
  claimExecutorPayment,
  getExecutionAmountToSendPlusBuffer
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import ora from 'ora'

import { createDeploymentArtifacts, getContractArtifact } from './artifacts'
import {
  isProjectRegistered,
  loadParsedChugSplashConfig,
  writeHardhatSnapshotId,
} from './utils'
import {
  chugsplashApproveTask,
  chugsplashCommitSubtask,
  executeTask,
  monitorTask,
  TASK_CHUGSPLASH_VERIFY_BUNDLE,
} from './tasks'

/**
 * TODO
 *
 * @param hre Hardhat Runtime Environment.
 * @param contractName Name of the contract in the config file.
 */
export const deployAllChugSplashConfigs = async (
  hre: any,
  silent: boolean,
  ipfsUrl: string,
  noCompile: boolean
) => {
  const remoteExecution = (await getChainId(hre.ethers.provider)) !== 31337
  const fileNames = fs.readdirSync(hre.config.paths.chugsplash)
  for (const fileName of fileNames) {
    const configPath = path.join(hre.config.paths.chugsplash, fileName)
    // Skip this config if it's empty.
    if (isEmptyChugSplashConfig(configPath)) {
      return
    }

    await deployChugSplashConfig(
      hre,
      configPath,
      silent,
      remoteExecution,
      ipfsUrl,
      noCompile
    )
  }
}

export const deployChugSplashConfig = async (
  hre: any,
  configPath: string,
  silent: boolean,
  remoteExecution: boolean,
  ipfsUrl: string,
  noCompile: boolean,
  spinner: ora.Ora = ora({ isSilent: true })
) => {
  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const signerAddress = await signer.getAddress()

  spinner.start('Parsing ChugSplash config file...')

  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const projectPreviouslyRegistered = await isProjectRegistered(
    signer,
    parsedConfig.options.projectName
  )

  spinner.succeed('Parsed ChugSplash config file.')

  if (projectPreviouslyRegistered === false) {
    spinner.start(`Registering ${parsedConfig.options.projectName}...`)
    // Register the project with the signer as the owner. Once we've completed the deployment, we'll
    // transfer ownership to the project owner specified in the config.
    await registerChugSplashProject(
      provider,
      parsedConfig.options.projectName,
      signerAddress
    )
    spinner.succeed(
      `Successfully registered ${parsedConfig.options.projectName}.`
    )
  }

  // The spinner interferes with Hardhat's compilation logs, so we only display this message if
  // compilation is being skipped.
  if (noCompile) {
    spinner.start('Getting the deployment info...')
  }

  // Get the bundle ID without publishing anything to IPFS.
  const { bundleId, bundle, configUri } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl,
      commitToIpfs: false,
      noCompile,
    },
    hre
  )

  if (noCompile) {
    spinner.succeed('Loaded the deployment info.')
  }

  spinner.start('Checking status of the deployment...')

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )
  let currBundleStatus = bundleState.status

  if (currBundleStatus === ChugSplashBundleStatus.COMPLETED) {
    const finalDeploymentTxnHash = await getFinalDeploymentTxnHash(
      ChugSplashManager,
      bundleId
    )
    await createDeploymentArtifacts(hre, parsedConfig, finalDeploymentTxnHash)
    spinner.succeed(
      `${parsedConfig.options.projectName} was already deployed on ${hre.network.name}.`
    )
    displayDeploymentTable(parsedConfig, silent)
    return
  } else if (currBundleStatus === ChugSplashBundleStatus.CANCELLED) {
    spinner.fail(
      `${parsedConfig.options.projectName} was already cancelled on ${hre.network.name}.`
    )
    throw new Error(
      `${parsedConfig.options.projectName} was previously cancelled on ${hre.network.name}.`
    )
  }

  if (currBundleStatus === ChugSplashBundleStatus.EMPTY) {
    spinner.succeed(
      `${parsedConfig.options.projectName} is a fresh deployment.`
    )
    spinner.start(`Committing ${parsedConfig.options.projectName}.`)
    await proposeChugSplashBundle(
      hre,
      parsedConfig,
      bundle,
      configUri,
      remoteExecution,
      ipfsUrl
    )
    currBundleStatus = ChugSplashBundleStatus.PROPOSED
  }

  spinner.succeed(`Committed the deployment.`)

  if (currBundleStatus === ChugSplashBundleStatus.PROPOSED) {
    spinner.start('Funding the deployment...')
    // Get the amount necessary to fund the deployment.
    const executionAmountPlusBuffer = await getExecutionAmountToSendPlusBuffer(
      hre.ethers.provider,
      parsedConfig
    )
    // Approve and fund the deployment.
    await chugsplashApproveTask(
      {
        configPath,
        silent: true,
        remoteExecution,
        amount: executionAmountPlusBuffer,
        skipMonitorStatus: true,
      },
      hre
    )
    currBundleStatus = ChugSplashBundleStatus.APPROVED
    spinner.succeed('Funded the deployment.')
  }

  spinner.start('The deployment is being executed. This may take a moment.')

  if (remoteExecution) {
    await monitorTask(
      {
        configPath,
        silent: true,
      },
      hre
    )
  } else {
    await executeTask(
      {
        chugSplashManager: ChugSplashManager,
        bundleId,
        bundle,
        parsedConfig,
        executor: signer,
        silent: true,
        isLocalExecution: true,
      },
      hre
    )
    await claimExecutorPayment(signer, ChugSplashManager)
  }

  spinner.succeed(`${parsedConfig.options.projectName} deployed!`)
  displayDeploymentTable(parsedConfig, silent)
}

export const getContract = async (
  hre: any,
  provider: ethers.providers.JsonRpcProvider,
  referenceName: string
): Promise<ethers.Contract> => {
  if ((await getChainId(provider)) !== 31337) {
    throw new Error('Only the Hardhat Network is currently supported.')
  }
  const configsWithFileNames: {
    config: ChugSplashConfig
    configFileName: string
  }[] = fs
    .readdirSync(hre.config.paths.chugsplash)
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

  if (
    (await isProxyDeployed(
      hre.ethers.provider,
      cfg.options.projectName,
      referenceName
    )) === false
  ) {
    throw new Error(`You must first deploy ${referenceName}.`)
  }

  const Proxy = new ethers.Contract(
    getProxyAddress(cfg.options.projectName, referenceName),
    new ethers.utils.Interface(
      getContractArtifact(cfg.contracts[referenceName].contract).abi
    ),
    provider.getSigner()
  )

  return Proxy
}

export const resetChugSplashDeployments = async (hre: any) => {
  const networkFolderName =
    hre.network.name === 'localhost' ? 'localhost' : 'hardhat'
  const snapshotIdPath = path.join(
    path.basename(hre.config.paths.deployed),
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

export const checkValidDeployment = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ChugSplashConfig
) => {
  for (const referenceName of Object.keys(parsedConfig.contracts)) {
    if (
      await isProxyDeployed(
        hre.ethers.provider,
        parsedConfig.options.projectName,
        referenceName
      )
    ) {
      throw new Error(
        `The reference name ${referenceName} inside ${parsedConfig.options.projectName} was already used
in a previous deployment for this project. You must change this reference name to something other than
${referenceName} or change the project name to something other than ${parsedConfig.options.projectName}.`
      )
    }
  }
}

export const getFinalDeploymentTxnHash = async (
  ChugSplashManager: ethers.Contract,
  bundleId: string
): Promise<string> => {
  const [finalDeploymentEvent] = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.ChugSplashBundleCompleted(bundleId)
  )
  return finalDeploymentEvent.transactionHash
}

export const proposeChugSplashBundle = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ChugSplashConfig,
  bundle: ChugSplashActionBundle,
  configUri: string,
  remoteExecution: boolean,
  ipfsUrl: string
) => {
  await checkValidDeployment(hre, parsedConfig)

  const ChugSplashManager = getChugSplashManager(
    hre.ethers.provider.getSigner(),
    parsedConfig.options.projectName
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
      configUri
    )
  ).wait()
}
