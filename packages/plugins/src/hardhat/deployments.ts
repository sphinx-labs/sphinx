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
  chugsplashLog,
  displayDeploymentTable,
  ChugSplashActionBundle,
  computeBundleId,
  getChugSplashManager,
} from '@chugsplash/core'
import { getChainId } from '@eth-optimism/core-utils'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { createDeploymentArtifacts, getContractArtifact } from './artifacts'
import { loadParsedChugSplashConfig, writeHardhatSnapshotId } from './utils'
import {
  chugsplashApproveTask,
  chugsplashCommitSubtask,
  statusTask,
  TASK_CHUGSPLASH_VERIFY_BUNDLE,
} from './tasks'
import { deployChugSplashPredeploys } from './predeploys'
import { getExecutionAmountPlusBuffer } from './fund'
import { postExecutionActions } from './execution'

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
  noCompile: boolean
) => {
  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const signerAddress = await signer.getAddress()

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  await deployChugSplashPredeploys(hre, signer)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the project owner specified in the config.
  await registerChugSplashProject(
    provider,
    parsedConfig.options.projectName,
    signerAddress
  )

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
    displayDeploymentTable(parsedConfig, silent)
    chugsplashLog(
      `${parsedConfig.options.projectName} was already deployed on ${hre.network.name}.`,
      silent
    )
    return
  } else if (currBundleStatus === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `${parsedConfig.options.projectName} was previously cancelled on ${hre.network.name}.`
    )
  }

  chugsplashLog(`Deploying: ${parsedConfig.options.projectName}`, silent)

  if (currBundleStatus === ChugSplashBundleStatus.EMPTY) {
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

  if (currBundleStatus === ChugSplashBundleStatus.PROPOSED) {
    // Fund the deployment.
    const executionAmountPlusBuffer = await getExecutionAmountPlusBuffer(
      hre,
      parsedConfig
    )
    // Approve the deployment. If `remoteExecution` is `true`, this also monitors the deployment
    // until it is completed and generates the deployment artifacts.
    await chugsplashApproveTask(
      {
        configPath,
        silent: true,
        remoteExecution,
        amount: executionAmountPlusBuffer,
      },
      hre
    )
  } else if (
    remoteExecution &&
    currBundleStatus === ChugSplashBundleStatus.APPROVED
  ) {
    await statusTask(
      {
        configPath,
      },
      hre
    )
  }

  if (!remoteExecution) {
    await hre.run('chugsplash-execute', {
      chugSplashManager: ChugSplashManager,
      bundleId,
      bundle,
      parsedConfig,
      executor: signer,
      silent: true,
    })
    await postExecutionActions(provider, parsedConfig)
  }

  displayDeploymentTable(parsedConfig, silent)
  chugsplashLog(
    `${parsedConfig.options.projectName} successfully deployed on ${hre.network.name}.`,
    silent
  )
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
      `Multiple config files contain the target: ${referenceName}. Target names must be unique for now. Config files containing ${referenceName}: ${configsWithFileNames.map(
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
        `The reference name ${referenceName} inside ${parsedConfig.options.projectName} was already used in a previous deployment. You must change this reference name to something other than ${referenceName} or change the project name to something other than ${parsedConfig.options.projectName}.`
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
