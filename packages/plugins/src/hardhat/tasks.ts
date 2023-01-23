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
import { getChainId } from '@eth-optimism/core-utils'
import {
  ParsedChugSplashConfig,
  ChugSplashActionBundle,
  getChugSplashRegistry,
  chugsplashFetchSubtask,
  initializeChugSplash,
  monitorChugSplashSetup,
  chugsplashRegisterAbstractTask,
  readParsedChugSplashConfig,
  chugsplashCommitAbstractSubtask,
  bundleLocal,
  verifyBundle,
  chugsplashProposeAbstractTask,
  chugsplashApproveAbstractTask,
  chugsplashFundAbstractTask,
  chugsplashDeployAbstractTask,
  resolveNetworkName,
  writeSnapshotId,
  chugsplashMonitorAbstractTask,
  chugsplashCancelAbstractTask,
  chugsplashWithdrawAbstractTask,
  chugsplashListProjectsAbstractTask,
  chugsplashListProposersAbstractTask,
  chugsplashAddProposersAbstractTask,
  chugsplashClaimProxyAbstractTask,
  chugsplashTransferOwnershipAbstractTask,
  ChugSplashExecutorType,
  ArtifactPaths,
  bundleRemote,
  readUserChugSplashConfig,
} from '@chugsplash/core'
import { ChugSplashManagerABI, EXECUTOR } from '@chugsplash/contracts'
import ora from 'ora'
import * as dotenv from 'dotenv'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import {
  getSampleContractFile,
  sampleChugSplashFileJavaScript,
  sampleChugSplashFileTypeScript,
} from '../sample-project'
import { deployAllChugSplashConfigs } from './deployments'
import { initializeExecutor } from '../executor'
import {
  sampleTestFileJavaScript,
  sampleTestFileTypeScript,
} from '../sample-project/sample-tests'
import { getArtifactPaths } from './artifacts'

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

export const bundleLocalSubtask = async (args: {
  parsedConfig: ParsedChugSplashConfig
  artifactPaths: ArtifactPaths
}) => {
  const { parsedConfig, artifactPaths } = args

  return bundleLocal(parsedConfig, artifactPaths, 'hardhat')
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
    skipStorageCheck: boolean
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
    skipStorageCheck,
  } = args

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const spinner = ora({ isSilent: silent })

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const signerAddress = await signer.getAddress()
  const remoteExecution = (await getChainId(provider)) !== 31337

  let executor: ChugSplashExecutorType | undefined
  if (remoteExecution) {
    spinner.start('Waiting for the executor to set up ChugSplash...')
    await monitorChugSplashSetup(provider, signer)
  } else {
    spinner.start('Booting up ChugSplash...')
    executor = await initializeExecutor(provider)
  }

  spinner.succeed('ChugSplash is ready to go.')

  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments

  const userConfig = readUserChugSplashConfig(configPath)
  const artifactPaths = await getArtifactPaths(
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashDeployAbstractTask(
    provider,
    signer,
    configPath,
    silent,
    remoteExecution,
    ipfsUrl,
    noCompile,
    confirm,
    !noWithdraw,
    newOwner ?? signerAddress,
    artifactPaths,
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath,
    deploymentFolder,
    'hardhat',
    skipStorageCheck,
    executor
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
  .addFlag(
    'skipStorageCheck',
    "Upgrade your contract(s) without checking for storage layout compatibility. Only use this when confident that the upgrade won't lead to storage layout issues."
  )
  .setAction(chugsplashDeployTask)

export const chugsplashRegisterTask = async (
  args: {
    configPath: string
    owner: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, silent, owner } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const userConfig = readUserChugSplashConfig(configPath)
  const artifactPaths = await getArtifactPaths(
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  const parsedConfig = await readParsedChugSplashConfig(
    provider,
    configPath,
    artifactPaths,
    'hardhat'
  )

  await chugsplashRegisterAbstractTask(
    provider,
    signer,
    parsedConfig,
    owner,
    silent,
    'hardhat'
  )
}

task(TASK_CHUGSPLASH_REGISTER)
  .setDescription('Registers a new ChugSplash project')
  .addParam('configPath', 'Path to the ChugSplash config file to propose')
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
    skipStorageCheck: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const {
    configPath,
    ipfsUrl,
    silent,
    noCompile,
    remoteExecution,
    confirm,
    skipStorageCheck,
  } = args

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const userConfig = readUserChugSplashConfig(configPath)

  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
  const canonicalConfigPath = hre.config.paths.canonicalConfigs

  const artifactPaths = await getArtifactPaths(
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  const parsedConfig = await readParsedChugSplashConfig(
    provider,
    configPath,
    artifactPaths,
    'hardhat'
  )

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
    artifactPaths,
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath,
    skipStorageCheck
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
  .addFlag(
    'skipStorageCheck',
    "Upgrade your contract(s) without checking for storage layout compatibility. Only use this when confident that the upgrade won't lead to storage layout issues."
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

  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')

  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments

  const remoteExecution = (await getChainId(provider)) !== 31337

  const userConfig = readUserChugSplashConfig(configPath)
  const artifactPaths = await getArtifactPaths(
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashApproveAbstractTask(
    provider,
    signer,
    configPath,
    noWithdraw,
    silent,
    skipMonitorStatus,
    artifactPaths,
    'hardhat',
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath,
    deploymentFolder,
    remoteExecution
  )
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
        if (event.args === undefined) {
          throw new Error(
            `ChugSplashProjectRegistered event does not have arguments.`
          )
        }

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
    artifactPaths: ArtifactPaths
    spinner?: ora.Ora
  },
  hre: HardhatRuntimeEnvironment
): Promise<{
  bundle: ChugSplashActionBundle
  configUri: string
  bundleId: string
}> => {
  const {
    parsedConfig,
    ipfsUrl,
    commitToIpfs,
    noCompile,
    spinner,
    artifactPaths,
  } = args

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')

  const canonicalConfigPath = hre.config.paths.canonicalConfigs

  const provider = hre.ethers.provider
  return chugsplashCommitAbstractSubtask(
    provider,
    provider.getSigner(),
    parsedConfig,
    ipfsUrl,
    commitToIpfs,
    artifactPaths,
    buildInfoFolder,
    canonicalConfigPath,
    'hardhat',
    spinner
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
          const proposedEvent = proposedEvents[i]
          if (proposedEvent.args === undefined) {
            throw new Error(`ChugSplashBundleProposed does not have arguments.`)
          }

          const bundleId = proposedEvent.args.bundleId
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
          if (proposed.args === undefined) {
            throw new Error(`ChugSplashBundleProposed does not have arguments.`)
          } else if (executed.args === undefined) {
            throw new Error(
              `ChugSplashBundleCompleted event does not have arguments.`
            )
          }
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
        proposedEvents.forEach((event) => {
          if (event.args === undefined) {
            throw new Error(`ChugSplashBundleProposed does not have arguments.`)
          }
          console.log(
            `Bundle ID: ${event.args.bundleId}\t\tConfig URI: ${event.args.configUri}`
          )
        })
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
        executedEvents.forEach((event) => {
          if (event.args === undefined) {
            throw new Error(
              `ChugSplashBundleCompleted event does not have arguments.`
            )
          }
          console.log(
            `Bundle ID: ${event.args.bundleId}\t\tConfig URI: ${event.args.configUri}`
          )
        })
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

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments

  const remoteExecution = (await getChainId(provider)) !== 31337

  const userConfig = readUserChugSplashConfig(configPath)
  const artifactPaths = await getArtifactPaths(
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashMonitorAbstractTask(
    provider,
    signer,
    configPath,
    noWithdraw,
    silent,
    newOwner,
    artifactPaths,
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath,
    deploymentFolder,
    'hardhat',
    remoteExecution
  )
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

  const userConfig = readUserChugSplashConfig(configPath)
  const artifactPaths = await getArtifactPaths(
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashFundAbstractTask(
    provider,
    signer,
    configPath,
    amount,
    silent,
    artifactPaths,
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

        const signer = hre.ethers.provider.getSigner()
        const signerAddress = await signer.getAddress()
        await initializeChugSplash(hre.ethers.provider, signer, signerAddress)

        spinner.succeed('ChugSplash has been initialized.')

        if (deployAll) {
          if (!noCompile) {
            await hre.run(TASK_COMPILE, {
              quiet: true,
            })
          }
          await deployAllChugSplashConfigs(hre, hide, '', true, true)
          const networkName = await resolveNetworkName(
            hre.ethers.provider,
            'hardhat'
          )
          await writeSnapshotId(
            hre.ethers.provider,
            networkName,
            hre.config.paths.deployments
          )
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
      const signer = hre.ethers.provider.getSigner()
      const executor = chainId === 31337 ? await signer.getAddress() : EXECUTOR
      const networkName = await resolveNetworkName(
        hre.ethers.provider,
        'hardhat'
      )
      if (chainId === 31337) {
        try {
          const snapshotIdPath = path.join(
            path.basename(hre.config.paths.deployments),
            networkName,
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
          await initializeChugSplash(hre.ethers.provider, signer, executor)
          if (!noCompile) {
            await hre.run(TASK_COMPILE, {
              quiet: true,
            })
          }
          await deployAllChugSplashConfigs(hre, !show, '', true, true)
        } finally {
          await writeSnapshotId(
            hre.ethers.provider,
            networkName,
            hre.config.paths.deployments
          )
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
        const signer = hre.ethers.provider.getSigner()
        const chainId = await getChainId(hre.ethers.provider)

        const confirm = chainId === 31337 ? true : args.confirm
        const executor =
          chainId === 31337 ? await signer.getAddress() : EXECUTOR
        await initializeChugSplash(hre.ethers.provider, signer, executor)
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

  const artifactPaths = await getArtifactPaths(
    readUserChugSplashConfig(configPath).contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashCancelAbstractTask(
    provider,
    signer,
    configPath,
    artifactPaths,
    'hardhat'
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
  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
  const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
  const canonicalConfigPath = hre.config.paths.canonicalConfigs

  const userConfig = readUserChugSplashConfig(configPath)
  const artifactPaths = await getArtifactPaths(
    userConfig.contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashWithdrawAbstractTask(
    provider,
    signer,
    configPath,
    silent,
    artifactPaths,
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath,
    'hardhat'
  )
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

  await chugsplashListProjectsAbstractTask(provider, signer, 'hardhat')
}

task(TASK_CHUGSPLASH_LIST_PROJECTS)
  .setDescription('Lists all projects that are owned by the caller.')
  .setAction(listProjectsTask)

export const listProposersTask = async (
  args: { configPath: string },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const artifactPaths = await getArtifactPaths(
    readUserChugSplashConfig(configPath).contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashListProposersAbstractTask(
    provider,
    signer,
    configPath,
    artifactPaths,
    'hardhat'
  )
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

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const artifactPaths = await getArtifactPaths(
    readUserChugSplashConfig(configPath).contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashAddProposersAbstractTask(
    provider,
    signer,
    configPath,
    newProposers,
    artifactPaths,
    'hardhat'
  )
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

  const artifactPaths = await getArtifactPaths(
    readUserChugSplashConfig(configPath).contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashClaimProxyAbstractTask(
    provider,
    signer,
    configPath,
    referenceName,
    silent,
    artifactPaths,
    'hardhat'
  )
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

  const artifactPaths = await getArtifactPaths(
    readUserChugSplashConfig(configPath).contracts,
    hre.config.paths.artifacts,
    path.join(hre.config.paths.artifacts, 'build-info')
  )

  await chugsplashTransferOwnershipAbstractTask(
    provider,
    signer,
    configPath,
    proxy,
    silent,
    artifactPaths,
    'hardhat'
  )
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
