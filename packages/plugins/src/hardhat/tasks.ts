import * as path from 'path'
import * as fs from 'fs'

import { ethers } from 'ethers'
import { subtask, task, types } from 'hardhat/config'
import {
  TASK_NODE,
  TASK_TEST,
  TASK_RUN,
  TASK_COMPILE,
} from 'hardhat/builtin-tasks/task-names'
import { getChainId, remove0x } from '@eth-optimism/core-utils'
import {
  ParsedChugSplashConfig,
  ChugSplashActionBundle,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  displayProposerTable,
  getChugSplashRegistry,
  displayDeploymentTable,
  getChugSplashManagerProxyAddress,
  getChugSplashManager,
  getProjectOwnerAddress,
  chugsplashFetchSubtask,
  getOwnerWithdrawableAmount,
  initializeChugSplash,
  monitorChugSplashSetup,
  formatEther,
  getGasPriceOverrides,
  chugsplashRegisterAbstractTask,
  loadParsedChugSplashConfig,
  isProjectRegistered,
  errorProjectNotRegistered,
  chugsplashCommitAbstractSubtask,
  bundleLocal,
  verifyBundle,
  chugsplashProposeAbstractTask,
  monitorExecution,
  chugsplashApproveAbstractTask,
  chugsplashFundAbstractTask,
} from '@chugsplash/core'
import { ChugSplashManagerABI, ProxyABI } from '@chugsplash/contracts'
import ora from 'ora'
import * as dotenv from 'dotenv'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ChugSplashExecutor, bundleRemote } from '@chugsplash/executor'

import {
  getSampleContractFile,
  sampleChugSplashFileJavaScript,
  sampleChugSplashFileTypeScript,
} from '../sample-project'
import {
  deployChugSplashConfig,
  deployAllChugSplashConfigs,
} from './deployments'
import { writeHardhatSnapshotId } from './utils'
import { postExecutionActions } from './execution'
import { initializeExecutor } from '../executor'
import {
  sampleTestFileJavaScript,
  sampleTestFileTypeScript,
} from '../sample-project/sample-tests'

// Load environment variables from .env
dotenv.config()

// internal tasks
export const TASK_CHUGSPLASH_FETCH = 'chugsplash-fetch'
export const TASK_CHUGSPLASH_BUNDLE_LOCAL = 'chugsplash-bundle-local'
export const TASK_CHUGSPLASH_BUNDLE_REMOTE = 'chugsplash-bundle-remote'
export const TASK_CHUGSPLASH_LIST_ALL_PROJECTS = 'chugsplash-list-projects'
export const TASK_CHUGSPLASH_LIST_BUNDLES = 'chugsplash-list-bundles'
export const TASK_CHUGSPLASH_VERIFY_BUNDLE = 'chugsplash-check-bundle'
export const TASK_CHUGSPLASH_COMMIT = 'chugsplash-commit'

// public tasks
export const TASK_CHUGSPLASH_INIT = 'chugsplash-init'
export const TASK_CHUGSPLASH_DEPLOY = 'chugsplash-deploy'
export const TASK_CHUGSPLASH_UPGRADE = 'chugsplash-upgrade'
export const TASK_CHUGSPLASH_REGISTER = 'chugsplash-register'
export const TASK_CHUGSPLASH_PROPOSE = 'chugsplash-propose'
export const TASK_CHUGSPLASH_FUND = 'chugsplash-fund'
export const TASK_CHUGSPLASH_APPROVE = 'chugsplash-approve'
export const TASK_CHUGSPLASH_MONITOR = 'chugsplash-monitor'
export const TASK_CHUGSPLASH_CANCEL = 'chugsplash-cancel'
export const TASK_CHUGSPLASH_WITHDRAW = 'chugsplash-withdraw'
export const TASK_CHUGSPLASH_LIST_PROJECTS = 'chugsplash-list-projects'
export const TASK_CHUGSPLASH_LIST_PROPOSERS = 'chugsplash-list-proposers'
export const TASK_CHUGSPLASH_ADD_PROPOSER = 'chugsplash-add-proposers'
export const TASK_CHUGSPLASH_TRANSFER_OWNERSHIP =
  'chugsplash-transfer-ownership'
export const TASK_CHUGSPLASH_CLAIM_PROXY = 'chugsplash-claim-proxy'

subtask(TASK_CHUGSPLASH_FETCH)
  .addParam('configUri', undefined, undefined, types.string)
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(chugsplashFetchSubtask)

subtask(TASK_CHUGSPLASH_BUNDLE_REMOTE)
  .addParam('canonicalConfig', undefined, undefined, types.any)
  .setAction(bundleRemote)

export const bundleLocalSubtask = async (
  args: {
    parsedConfig: ParsedChugSplashConfig
  },
  hre: HardhatRuntimeEnvironment
) => {
  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
  return bundleLocal(
    args.parsedConfig,
    artifactFolder,
    buildInfoFolder,
    'hardhat'
  )
}

subtask(TASK_CHUGSPLASH_BUNDLE_LOCAL)
  .addParam('parsedConfig', undefined, undefined)
  .setAction(bundleLocalSubtask)

export const chugsplashDeployTask = async (
  args: {
    configPath: string
    newOwner: string
    ipfsUrl: string
    silent: boolean
    noCompile: boolean
    confirm: boolean
    noWithdraw: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const {
    configPath,
    newOwner,
    ipfsUrl,
    silent,
    noCompile,
    confirm,
    noWithdraw,
  } = args

  const spinner = ora({ isSilent: silent })

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const signerAddress = await signer.getAddress()
  const remoteExecution = (await getChainId(provider)) !== 31337

  let executor: ChugSplashExecutor
  if (remoteExecution) {
    spinner.start('Waiting for the executor to set up ChugSplash...')
    await monitorChugSplashSetup(provider)
  } else {
    spinner.start('Booting up ChugSplash...')
    executor = await initializeExecutor(provider)
  }

  spinner.succeed('ChugSplash is ready to go.')

  await deployChugSplashConfig(
    hre,
    configPath,
    silent,
    remoteExecution,
    ipfsUrl,
    noCompile,
    confirm,
    !noWithdraw,
    newOwner ?? signerAddress,
    executor,
    spinner
  )
}

task(TASK_CHUGSPLASH_DEPLOY)
  .setDescription('Deploys a ChugSplash config file')
  .addParam('configPath', 'Path to the ChugSplash config file to deploy')
  .addOptionalParam(
    'newOwner',
    "Address to receive ownership of the project after the deployment is finished. If unspecified, defaults to the caller's address."
  )
  .addOptionalParam(
    'ipfsUrl',
    'Optional IPFS gateway URL for publishing ChugSplash projects to IPFS.'
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addFlag('noCompile', "Don't compile when running this task")
  .addFlag(
    'noWithdraw',
    'Skip withdrawing leftover funds to the project owner.'
  )
  .addFlag(
    'confirm',
    'Automatically confirm contract upgrades. Only applicable if upgrading on a live network.'
  )
  .setAction(chugsplashDeployTask)

export const chugsplashRegisterTask = async (
  args: {
    configPaths: string[]
    owner: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPaths, silent, owner } = args

  if (configPaths.length === 0) {
    throw new Error('You must specify a path to a ChugSplash config file.')
  }

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const configs: ParsedChugSplashConfig[] = []
  for (const configPath of args.configPaths) {
    configs.push(loadParsedChugSplashConfig(configPath))
  }

  await chugsplashRegisterAbstractTask(
    provider,
    signer,
    configs,
    owner,
    silent,
    'hardhat'
  )
}

task(TASK_CHUGSPLASH_REGISTER)
  .setDescription('Registers a new ChugSplash project')
  .addVariadicPositionalParam(
    'configPaths',
    'Paths to ChugSplash config files',
    []
  )
  .addParam('owner', 'Owner of the ChugSplash project')
  .addFlag('silent', "Hide all of ChugSplash's output")
  .setAction(chugsplashRegisterTask)

export const chugsplashProposeTask = async (
  args: {
    configPath: string
    ipfsUrl: string
    silent: boolean
    noCompile: boolean
    remoteExecution: boolean
    confirm: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, ipfsUrl, silent, noCompile, remoteExecution, confirm } =
    args

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
  const canonicalConfigPath = hre.config.paths.canonicalConfigs

  await chugsplashProposeAbstractTask(
    provider,
    signer,
    parsedConfig,
    configPath,
    ipfsUrl,
    silent,
    remoteExecution,
    confirm,
    'hardhat',
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath
  )
}

task(TASK_CHUGSPLASH_PROPOSE)
  .setDescription('Proposes a new ChugSplash project')
  .addParam('configPath', 'Path to the ChugSplash config file to propose')
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addOptionalParam(
    'ipfsUrl',
    'Optional IPFS gateway URL for publishing ChugSplash projects to IPFS.'
  )
  .addFlag('noCompile', "Don't compile when running this task")
  .addFlag(
    'confirm',
    'Automatically confirm contract upgrades. Only applicable if upgrading on a live network.'
  )
  .setAction(chugsplashProposeTask)

export const chugsplashApproveTask = async (
  args: {
    configPath: string
    noWithdraw: boolean
    silent: boolean
    skipMonitorStatus: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, noWithdraw, silent, skipMonitorStatus } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')

  const canonicalConfigPath = hre.config.paths.canonicalConfigs

  const finalDeploymentTxnHash = await chugsplashApproveAbstractTask(
    provider,
    signer,
    configPath,
    noWithdraw,
    silent,
    skipMonitorStatus,
    'hardhat',
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath
  )

  if (finalDeploymentTxnHash) {
    const spinner = ora({ isSilent: silent })
    await postExecutionActions(
      hre,
      parsedConfig,
      finalDeploymentTxnHash,
      !noWithdraw,
      undefined,
      spinner
    )
  }
}

task(TASK_CHUGSPLASH_APPROVE)
  .setDescription('Allows a manager to approve a bundle to be executed.')
  .addFlag(
    'noWithdraw',
    'Skip withdrawing leftover funds to the project owner.'
  )
  .addParam('configPath', 'Path to the ChugSplash config file to approve')
  .addFlag('silent', "Hide all of ChugSplash's output")
  .setAction(chugsplashApproveTask)

subtask(TASK_CHUGSPLASH_LIST_ALL_PROJECTS)
  .setDescription('Lists all existing ChugSplash projects')
  .setAction(async (_, hre) => {
    const ChugSplashRegistry = getChugSplashRegistry(
      hre.ethers.provider.getSigner()
    )

    const events = await ChugSplashRegistry.queryFilter(
      ChugSplashRegistry.filters.ChugSplashProjectRegistered()
    )

    console.table(
      events.map((event) => {
        return {
          name: event.args.projectName,
          manager: event.args.manager,
        }
      })
    )
  })

export const chugsplashCommitSubtask = async (
  args: {
    parsedConfig: ParsedChugSplashConfig
    ipfsUrl: string
    commitToIpfs: boolean
    noCompile: boolean
    spinner?: ora.Ora
  },
  hre: HardhatRuntimeEnvironment
): Promise<{
  bundle: ChugSplashActionBundle
  configUri: string
  bundleId: string
}> => {
  const { parsedConfig, ipfsUrl, commitToIpfs, noCompile, spinner } = args

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')

  const canonicalConfigPath = hre.config.paths.canonicalConfigs

  const provider = hre.ethers.provider
  return chugsplashCommitAbstractSubtask(
    provider,
    provider.getSigner(),
    parsedConfig,
    ipfsUrl,
    commitToIpfs,
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath,
    spinner,
    'hardhat'
  )
}

subtask(TASK_CHUGSPLASH_COMMIT)
  .setDescription('Commits a ChugSplash config file with artifacts to IPFS')
  .addParam('parsedConfig', 'Parsed ChugSplash config')
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(chugsplashCommitSubtask)

subtask(TASK_CHUGSPLASH_LIST_BUNDLES)
  .setDescription('Lists all bundles for a given project')
  .addParam('projectName', 'name of the project')
  .addFlag('includeExecuted', 'include bundles that have been executed')
  .setAction(
    async (
      args: {
        projectName: string
        includeExecuted: boolean
      },
      hre
    ) => {
      const signer = hre.ethers.provider.getSigner()
      const ChugSplashRegistry = getChugSplashRegistry(signer)

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(args.projectName),
        ChugSplashManagerABI,
        signer
      )

      // Get events for all bundles that have been proposed. This array includes
      // events that have been approved and executed, which will be filtered out.
      const proposedEvents = await ChugSplashManager.queryFilter(
        ChugSplashManager.filters.ChugSplashBundleProposed()
      )

      // Exit early if there are no proposals for the project.
      if (proposedEvents.length === 0) {
        console.log('There are no bundles for this project.')
        process.exit()
      }

      // Filter out the approved bundle event if there is a currently active bundle
      const activeBundleId = await ChugSplashManager.activeBundleId()

      let approvedEvent: any
      if (activeBundleId !== ethers.constants.HashZero) {
        for (let i = 0; i < proposedEvents.length; i++) {
          const bundleId = proposedEvents[i].args.bundleId
          if (bundleId === activeBundleId) {
            // Remove the active bundle event in-place and return it.
            approvedEvent = proposedEvents.splice(i, 1)

            // It's fine to break out of the loop here since there is only one
            // active bundle at a time.
            break
          }
        }
      }

      const executedEvents = await ChugSplashManager.queryFilter(
        ChugSplashManager.filters.ChugSplashBundleCompleted()
      )

      for (const executed of executedEvents) {
        for (let i = 0; i < proposedEvents.length; i++) {
          const proposed = proposedEvents[i]
          // Remove the event if the bundle hashes match
          if (proposed.args.bundleId === executed.args.bundleId) {
            proposedEvents.splice(i, 1)
          }
        }
      }

      if (proposedEvents.length === 0) {
        // Accounts for the case where there is only one bundle, and it is approved.
        console.log('There are currently no proposed bundles.')
      } else {
        // Display the proposed bundles
        console.log(`Proposals for ${args.projectName}:`)
        proposedEvents.forEach((event) =>
          console.log(
            `Bundle ID: ${event.args.bundleId}\t\tConfig URI: ${event.args.configUri}`
          )
        )
      }

      // Display the approved bundle if it exists
      if (activeBundleId !== ethers.constants.HashZero) {
        console.log('Approved:')
        console.log(
          `Bundle ID: ${activeBundleId}\t\tConfig URI: ${approvedEvent[0].args.configUri}`
        )
      }

      // Display the executed bundles if the user has specified to do so
      if (args.includeExecuted) {
        console.log('\n')
        console.log('Executed:')
        executedEvents.forEach((event) =>
          console.log(
            `Bundle ID: ${event.args.bundleId}\t\tConfig URI: ${event.args.configUri}`
          )
        )
      }
    }
  )

subtask(TASK_CHUGSPLASH_VERIFY_BUNDLE)
  .setDescription('Checks if a deployment config matches a bundle hash')
  .addParam('configUri', 'location of the config file')
  .addParam('bundleId', 'hash of the bundle')
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(verifyBundle)

export const monitorTask = async (
  args: {
    configPath: string
    noWithdraw: boolean
    silent: boolean
    newOwner: string
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, noWithdraw, silent, newOwner } = args

  const spinner = ora({ isSilent: silent })
  spinner.start(`Loading project information...`)

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(
      provider,
      await getChainId(provider),
      configPath,
      'hardhat'
    )
  }

  const { bundleId, bundle } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl: '',
      commitToIpfs: false,
      noCompile: true,
    },
    hre
  )
  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  spinner.succeed(`Loaded project information.`)

  if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
    throw new Error(
      `${parsedConfig.options.projectName} has not been proposed or approved for
execution on ${hre.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.PROPOSED) {
    throw new Error(
      `${parsedConfig.options.projectName} has not been proposed but not yet
approved for execution on ${hre.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${hre.network.name}. Please propose a new
project with a name other than ${parsedConfig.options.projectName}`
    )
  }

  // If we make it to this point, the bundle status is either completed or approved.

  const finalDeploymentTxnHash = await monitorExecution(
    provider,
    signer,
    parsedConfig,
    bundle,
    bundleId,
    spinner,
    'hardhat'
  )

  await postExecutionActions(
    hre,
    parsedConfig,
    finalDeploymentTxnHash,
    !noWithdraw,
    newOwner,
    spinner
  )

  bundleState.status === ChugSplashBundleStatus.APPROVED
    ? spinner.succeed(
        `${parsedConfig.options.projectName} successfully completed on ${hre.network.name}.`
      )
    : spinner.succeed(
        `${parsedConfig.options.projectName} was already deployed on ${hre.network.name}.`
      )

  displayDeploymentTable(parsedConfig, silent)
}

task(TASK_CHUGSPLASH_MONITOR)
  .setDescription('Displays the status of a ChugSplash bundle')
  .addParam('configPath', 'Path to the ChugSplash config file to monitor')
  .addFlag(
    'noWithdraw',
    'Skip withdrawing leftover funds to the project owner.'
  )
  .setAction(monitorTask)

export const chugsplashFundTask = async (
  args: {
    configPath: string
    amount: ethers.BigNumber
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { amount, silent, configPath } = args
  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  await chugsplashFundAbstractTask(
    provider,
    signer,
    configPath,
    amount,
    silent,
    'hardhat'
  )
}

task(TASK_CHUGSPLASH_FUND)
  .setDescription('Fund a ChugSplash deployment')
  .addParam('amount', 'Amount to send in wei')
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addParam('configPath', 'Path to the ChugSplash config file')
  .setAction(chugsplashFundTask)

task(TASK_NODE)
  .addFlag('deployAll', 'Deploy all ChugSplash config files on startup')
  .addFlag(
    'disableChugsplash',
    "Completely disable all of ChugSplash's activity."
  )
  .addFlag('hide', "Hide all of ChugSplash's output")
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(
    async (
      args: {
        deployAll: boolean
        disableChugsplash: boolean
        hide: boolean
        noCompile: boolean
        confirm: boolean
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { deployAll, disableChugsplash, hide, noCompile } = args

      if (!disableChugsplash) {
        const spinner = ora({ isSilent: hide })
        spinner.start('Booting up ChugSplash...')

        await initializeChugSplash(
          hre.ethers.provider,
          hre.ethers.provider.getSigner()
        )

        spinner.succeed('ChugSplash has been initialized.')

        if (deployAll) {
          if (!noCompile) {
            await hre.run(TASK_COMPILE, {
              quiet: true,
            })
          }
          await deployAllChugSplashConfigs(hre, hide, '', true, true, spinner)
          await writeHardhatSnapshotId(hre, 'localhost')
        }
      }
      await runSuper(args)
    }
  )

task(TASK_TEST)
  .addFlag('show', 'Show ChugSplash deployment information')
  .setAction(
    async (
      args: { show: boolean; noCompile: boolean; confirm: boolean },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { show, noCompile } = args
      const chainId = await getChainId(hre.ethers.provider)
      if (chainId === 31337) {
        try {
          const snapshotIdPath = path.join(
            path.basename(hre.config.paths.deployments),
            hre.network.name === 'localhost' ? 'localhost' : 'hardhat',
            '.snapshotId'
          )
          const snapshotId = fs.readFileSync(snapshotIdPath, 'utf8')
          const snapshotReverted = await hre.network.provider.send(
            'evm_revert',
            [snapshotId]
          )
          if (!snapshotReverted) {
            throw new Error('Snapshot failed to be reverted.')
          }
        } catch {
          await initializeChugSplash(
            hre.ethers.provider,
            hre.ethers.provider.getSigner()
          )
          if (!noCompile) {
            await hre.run(TASK_COMPILE, {
              quiet: true,
            })
          }
          await deployAllChugSplashConfigs(hre, !show, '', true, true)
        } finally {
          await writeHardhatSnapshotId(hre)
        }
      }
      await runSuper(args)
    }
  )

task(TASK_RUN)
  .addFlag(
    'deployAll',
    'Deploy all ChugSplash configs before executing your script.'
  )
  .addFlag(
    'confirm',
    'Automatically confirm contract upgrades. Only applicable if upgrading on a live network.'
  )
  .setAction(
    async (
      args: {
        deployAll: boolean
        noCompile: boolean
        confirm: boolean
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { deployAll, noCompile } = args
      if (deployAll) {
        const chainId = await getChainId(hre.ethers.provider)
        const confirm = chainId === 31337 ? true : args.confirm
        await initializeChugSplash(
          hre.ethers.provider,
          hre.ethers.provider.getSigner()
        )
        if (!noCompile) {
          await hre.run(TASK_COMPILE, {
            quiet: true,
          })
        }
        await deployAllChugSplashConfigs(hre, true, '', true, confirm)
      }
      await runSuper(args)
    }
  )

export const chugsplashCancelTask = async (
  args: {
    configPath: string
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const projectName = parsedConfig.options.projectName

  const spinner = ora()
  spinner.start(`Cancelling ${projectName} on ${hre.network.name}.`)

  if (!(await isProjectRegistered(signer, projectName))) {
    errorProjectNotRegistered(
      provider,
      await getChainId(provider),
      configPath,
      'hardhat'
    )
  }

  const projectOwnerAddress = await getProjectOwnerAddress(
    provider.getSigner(),
    projectName
  )
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
You attempted to cancel the project using the address: ${await signer.getAddress()}`)
  }

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const activeBundleId = await ChugSplashManager.activeBundleId()

  if (activeBundleId === ethers.constants.HashZero) {
    spinner.fail(
      `${projectName} is not an active project, so there is nothing to cancel.`
    )
    return
  }

  await (
    await ChugSplashManager.cancelActiveChugSplashBundle(
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Cancelled ${projectName} on ${hre.network.name}.`)
  spinner.start(`Refunding the project owner...`)

  const prevOwnerBalance = await signer.getBalance()
  await (
    await ChugSplashManager.withdrawOwnerETH(
      await getGasPriceOverrides(provider)
    )
  ).wait()
  const refund = (await signer.getBalance()).sub(prevOwnerBalance)

  spinner.succeed(
    `Refunded ${ethers.utils.formatEther(refund)} ETH on ${
      hre.network.name
    } to the project owner: ${await signer.getAddress()}.`
  )
}

task(TASK_CHUGSPLASH_CANCEL)
  .setDescription('Cancel an active ChugSplash project.')
  .addParam('configPath', 'Path to the ChugSplash config file to cancel')
  .setAction(chugsplashCancelTask)

export const chugsplashWithdrawTask = async (
  args: {
    configPath: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, silent } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const projectName = parsedConfig.options.projectName

  const spinner = ora({ isSilent: silent })
  spinner.start(
    `Withdrawing ETH in the project ${projectName} on ${hre.network.name}.`
  )

  if (!(await isProjectRegistered(signer, projectName))) {
    errorProjectNotRegistered(
      provider,
      await getChainId(provider),
      configPath,
      'hardhat'
    )
  }

  const projectOwnerAddress = await getProjectOwnerAddress(
    provider.getSigner(),
    projectName
  )
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
Caller attempted to claim funds using the address: ${await signer.getAddress()}`)
  }

  // Get the bundle info by calling the commit subtask locally (which doesn't publish anything to
  // IPFS).
  const { bundleId } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl: '',
      commitToIpfs: false,
      noCompile: true,
    },
    hre
  )

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    throw new Error(
      `Project is currently active. You must cancel the project in order to withdraw funds:

npx hardhat chugsplash-cancel --network ${hre.network.name} --config-path ${configPath}
        `
    )
  }

  const amountToWithdraw = await getOwnerWithdrawableAmount(
    provider,
    projectName
  )

  if (amountToWithdraw.gt(0)) {
    await (
      await ChugSplashManager.withdrawOwnerETH(
        await getGasPriceOverrides(provider)
      )
    ).wait()

    spinner.succeed(
      `Withdrew ${ethers.utils.formatEther(amountToWithdraw)} ETH on ${
        hre.network.name
      } to the project owner: ${await signer.getAddress()}.`
    )
  } else {
    spinner.fail(
      `No funds available to withdraw on ${hre.network.name} for the project: ${projectName}.`
    )
  }
}

task(TASK_CHUGSPLASH_WITHDRAW)
  .setDescription(
    'Withdraw funds in a ChugSplash project belonging to the project owner.'
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addParam('configPath', 'Path to the ChugSplash config file')
  .setAction(chugsplashWithdrawTask)

export const listProjectsTask = async ({}, hre: HardhatRuntimeEnvironment) => {
  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const signerAddress = await signer.getAddress()

  const spinner = ora()
  spinner.start(
    `Getting projects on ${hre.network.name} owned by: ${signerAddress}`
  )

  const ChugSplashRegistry = getChugSplashRegistry(signer)

  const projectRegisteredEvents = await ChugSplashRegistry.queryFilter(
    ChugSplashRegistry.filters.ChugSplashProjectRegistered()
  )

  const projects = {}
  let numProjectsOwned = 0
  for (const event of projectRegisteredEvents) {
    const ChugSplashManager = getChugSplashManager(
      signer,
      event.args.projectName
    )
    const projectOwnerAddress = await getProjectOwnerAddress(
      provider.getSigner(),
      event.args.projectName
    )
    if (projectOwnerAddress === signerAddress) {
      numProjectsOwned += 1
      const hasActiveBundle =
        (await ChugSplashManager.activeBundleId()) !== ethers.constants.HashZero
      const totalEthBalance = await provider.getBalance(
        ChugSplashManager.address
      )
      const ownerBalance = await getOwnerWithdrawableAmount(
        provider,
        event.args.projectName
      )

      const formattedTotalEthBalance = totalEthBalance.gt(0)
        ? formatEther(totalEthBalance, 4)
        : 0
      const formattedOwnerBalance = ownerBalance.gt(0)
        ? formatEther(ownerBalance, 4)
        : 0

      projects[numProjectsOwned] = {
        'Project Name': event.args.projectName,
        'Is Active': hasActiveBundle ? 'Yes' : 'No',
        "Project Owner's ETH": formattedOwnerBalance,
        'Total ETH Stored': formattedTotalEthBalance,
      }
    }
  }

  if (numProjectsOwned > 0) {
    spinner.succeed(
      `Retrieved all projects on ${hre.network.name} owned by: ${signerAddress}`
    )
    console.table(projects)
  } else {
    spinner.fail(
      `No projects on ${hre.network.name} owned by: ${signerAddress}`
    )
  }
}

task(TASK_CHUGSPLASH_LIST_PROJECTS)
  .setDescription('Lists all projects that are owned by the caller.')
  .setAction(listProjectsTask)

export const listProposersTask = async (
  args: { configPath: string },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath } = args

  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(
      provider,
      await getChainId(hre.ethers.provider),
      configPath,
      'hardhat'
    )
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  const proposers = []

  // Fetch current owner
  const owner = await getProjectOwnerAddress(
    provider.getSigner(),
    parsedConfig.options.projectName
  )
  proposers.push(owner)

  // Fetch all previous proposers
  const addProposerEvents = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.ProposerAdded()
  )

  // Verify if each previous proposer is still a proposer before adding it to the list
  for (const proposerEvent of addProposerEvents) {
    const address = proposerEvent.args.proposer
    const isStillProposer = await ChugSplashManager.proposers(address)
    if (isStillProposer && !proposers.includes(address)) {
      proposers.push(address)
    }
  }

  // Display the list of proposers
  displayProposerTable(proposers)
}

task(TASK_CHUGSPLASH_LIST_PROPOSERS)
  .setDescription('Lists all of the approved proposers for this project')
  .addParam('configPath', 'Path to the ChugSplash config file to propose')
  .setAction(listProposersTask)

export const addProposerTask = async (
  args: {
    configPath: string
    newProposers: string[]
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, newProposers } = args

  if (newProposers.length === 0) {
    throw new Error('You must specify at least one proposer to add.')
  }

  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const spinner = ora()
  spinner.start('Confirming project ownership...')

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(
      provider,
      await getChainId(hre.ethers.provider),
      configPath,
      'hardhat'
    )
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  // Fetch current owner
  const projectOwnerAddress = await getProjectOwnerAddress(
    provider.getSigner(),
    parsedConfig.options.projectName
  )
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
  You attempted to add a proposer using address: ${await signer.getAddress()}`)
  }

  spinner.succeed('Project ownership confirmed.')

  for (const newProposer of newProposers) {
    spinner.start(`Adding proposer ${newProposer}...`)

    const isAlreadyProposer = await ChugSplashManager.proposers(newProposer)
    if (isAlreadyProposer) {
      throw new Error(
        `A proposer with the address ${newProposer} has already been added.`
      )
    }

    await (
      await ChugSplashManager.addProposer(
        newProposer,
        await getGasPriceOverrides(provider)
      )
    ).wait()

    spinner.succeed(`Proposer ${newProposer} successfully added!`)
  }

  await listProposersTask({ configPath }, hre)
}

task(TASK_CHUGSPLASH_ADD_PROPOSER)
  .setDescription('Adds a new proposer to the list of approved proposers')
  .addParam('configPath', 'Path to the ChugSplash config file to propose')
  .addVariadicPositionalParam(
    'newProposers',
    'Paths to ChugSplash config files',
    []
  )
  .setAction(addProposerTask)

export const claimProxyTask = async (
  args: {
    configPath: string
    referenceName: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, referenceName, silent } = args
  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const spinner = ora({ isSilent: silent })
  spinner.start('Checking project registration...')

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  // Throw an error if the project has not been registered
  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(
      provider,
      await getChainId(hre.ethers.provider),
      configPath,
      'hardhat'
    )
  }

  const owner = await getProjectOwnerAddress(
    provider.getSigner(),
    parsedConfig.options.projectName
  )

  const signerAddress = await signer.getAddress()
  if (owner !== signerAddress) {
    throw new Error(
      `Caller does not own the project ${parsedConfig.options.projectName}`
    )
  }

  spinner.succeed('Project registration detected')
  spinner.start('Claiming proxy ownership...')

  const manager = getChugSplashManager(signer, parsedConfig.options.projectName)

  const activeBundleId = await manager.activeBundleId()
  if (activeBundleId !== ethers.constants.HashZero) {
    throw new Error(
      `A project is currently being executed. Proxy ownership has not been transferred.
  Please wait a couple of minutes before trying again.`
    )
  }

  await (
    await manager.transferProxyOwnership(
      referenceName,
      signerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Proxy ownership claimed by address ${signerAddress}`)
}

task(TASK_CHUGSPLASH_CLAIM_PROXY)
  .setDescription(
    'Transfers ownership of a proxy from ChugSplash to the caller'
  )
  .addParam(
    'configPath',
    'Path to the ChugSplash config file for the project that owns the target contract'
  )
  .addParam(
    'referenceName',
    'Reference name of the contract that should be transferred to you'
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .setAction(claimProxyTask)

export const transferOwnershipTask = async (
  args: {
    configPath: string
    proxy: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, proxy, silent } = args
  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const spinner = ora({ isSilent: silent })
  spinner.start('Checking project registration...')

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  // Throw an error if the project has not been registered
  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(
      provider,
      await getChainId(hre.ethers.provider),
      configPath,
      'hardhat'
    )
  }

  spinner.succeed('Project registration detected')
  spinner.start('Checking proxy compatibility...')

  const incompatibleProxyError = `ChugSplash does not support your proxy type.
    Currently ChugSplash only supports proxies that implement EIP-1967 which yours does not appear to do.
    If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.`

  // Fetch proxy bytecode and check if it contains the expected EIP-1967 function definitions
  const iface = new ethers.utils.Interface(ProxyABI)
  const bytecode = await provider.getCode(proxy)
  const checkFunctions = ['implementation', 'admin', 'upgradeTo', 'changeAdmin']
  for (const func of checkFunctions) {
    const sigHash = remove0x(iface.getSighash(func))
    if (!bytecode.includes(sigHash)) {
      throw new Error(incompatibleProxyError)
    }
  }

  // Fetch proxy owner address from storage slot defined by EIP-1967
  const ownerAddress = ethers.utils.defaultAbiCoder.decode(
    ['address'],
    await provider.getStorageAt(
      proxy,
      '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
    )
  )[0]

  // Fetch ChugSplashManager address for this project
  const managerAddress = getChugSplashManagerProxyAddress(
    parsedConfig.options.projectName
  )

  // If proxy owner is not a valid address, then proxy type is incompatible
  if (!ethers.utils.isAddress(ownerAddress)) {
    throw new Error(incompatibleProxyError)
  }

  // If proxy owner is already ChugSplash, then throw an error
  if (managerAddress.toLowerCase() === ownerAddress.toLowerCase()) {
    throw new Error('Proxy is already owned by ChugSplash')
  }

  // If the signer doesn't own the target proxy, then throw an error
  const signerAddress = await signer.getAddress()
  if (ownerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Target proxy is owned by: ${ownerAddress}.
  You attempted to transfer ownership of the proxy using the address: ${signerAddress}`)
  }

  // Check that the proxy implementation function returns an address
  const contract = new ethers.Contract(proxy, iface, signer)
  const implementationAddress = await contract.callStatic.implementation()
  if (!ethers.utils.isAddress(implementationAddress)) {
    throw new Error(incompatibleProxyError)
  }

  spinner.succeed('Proxy compatibility verified')
  spinner.start('Transferring proxy ownership to ChugSplash...')

  // Transfer ownership of the proxy to the ChugSplashManager.
  await (
    await contract.changeAdmin(
      managerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed('Proxy ownership successfully transferred to ChugSplash')
}

task(TASK_CHUGSPLASH_TRANSFER_OWNERSHIP)
  .setDescription('Transfers ownership of a proxy to ChugSplash')
  .addParam(
    'configPath',
    'Path to the ChugSplash config file for the project that you would like to own the target contract'
  )
  .addParam(
    'proxy',
    'Address of the contract that should have its ownership transferred to ChugSplash.'
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .setAction(transferOwnershipTask)

export const chugsplashInitTask = async (
  args: {
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { silent } = args

  const spinner = ora({ isSilent: silent })
  spinner.start('Initializing ChugSplash project...')

  // Create the ChugSplash folder if it doesn't exist
  if (!fs.existsSync(hre.config.paths.chugsplash)) {
    fs.mkdirSync(hre.config.paths.chugsplash)
  }

  // Create a folder for smart contract source files if it doesn't exist
  if (!fs.existsSync(hre.config.paths.sources)) {
    fs.mkdirSync(hre.config.paths.sources)
  }

  // Create a folder for test files if it doesn't exist
  if (!fs.existsSync(hre.config.paths.tests)) {
    fs.mkdirSync(hre.config.paths.tests)
  }

  // First, we'll create the sample ChugSplash file.

  // True if the Hardhat project is TypeScript and false if it's JavaScript.
  const isTypeScriptProject =
    path.extname(hre.config.paths.configFile) === '.ts'

  // Check if the sample ChugSplash file already exists.
  const chugsplashFileName = isTypeScriptProject
    ? 'hello-chugsplash.ts'
    : 'hello-chugsplash.js'
  const chugsplashFilePath = path.join(
    hre.config.paths.chugsplash,
    chugsplashFileName
  )
  if (!fs.existsSync(chugsplashFilePath)) {
    // Create the sample ChugSplash file.
    fs.writeFileSync(
      chugsplashFilePath,
      isTypeScriptProject
        ? sampleChugSplashFileTypeScript
        : sampleChugSplashFileJavaScript
    )

    // TODO: rm
    // // Copy the sample ChugSplash file to the destination path.
    // fs.copyFileSync(
    //   path.join(sampleSrcPath, chugsplashFileName),
    //   chugsplashFilePathDest
    // )
  }

  // Next, we'll create the sample contract file.

  // Get the Solidity compiler version from the Hardhat config.
  const [{ version: solcVersion }] = hre.config.solidity.compilers

  // Check if the sample smart contract exists.
  const contractFilePath = path.join(
    hre.config.paths.sources,
    'HelloChugSplash.sol'
  )
  if (!fs.existsSync(contractFilePath)) {
    // Create the sample contract file.
    fs.writeFileSync(contractFilePath, getSampleContractFile(solcVersion))
  }

  // Lastly, we'll create the sample test file.

  // Check if the sample test file exists.
  const testFileName = isTypeScriptProject
    ? 'HelloChugSplash.spec.ts'
    : 'HelloChugSplash.test.js'
  const testFilePath = path.join(hre.config.paths.tests, testFileName)
  if (!fs.existsSync(testFilePath)) {
    // Create the sample test file.
    fs.writeFileSync(
      testFilePath,
      isTypeScriptProject ? sampleTestFileTypeScript : sampleTestFileJavaScript
    )
  }

  spinner.succeed('Initialized ChugSplash project.')
}

task(TASK_CHUGSPLASH_INIT)
  .setDescription('Sets up a ChugSplash project.')
  .addFlag('silent', "Hide ChugSplash's output")
  .setAction(chugsplashInitTask)
