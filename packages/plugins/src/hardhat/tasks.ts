import * as path from 'path'
import * as fs from 'fs'

import { subtask, task, types } from 'hardhat/config'
import {
  TASK_NODE,
  TASK_TEST,
  TASK_RUN,
  TASK_COMPILE,
} from 'hardhat/builtin-tasks/task-names'
import {
  chugsplashFetchSubtask,
  chugsplashDeployAbstractTask,
  resolveNetworkName,
  writeSnapshotId,
  chugsplashCancelAbstractTask,
  chugsplashExportProxyAbstractTask,
  chugsplashImportProxyAbstractTask,
  readValidatedChugSplashConfig,
  ensureChugSplashInitialized,
  isHardhatFork,
  isLocalNetwork,
} from '@chugsplash/core'
import ora from 'ora'
import * as dotenv from 'dotenv'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { writeSampleProjectFiles } from '../sample-project'
import {
  deployAllChugSplashProjects,
  getSignerFromOwnerAddress,
} from './deployments'
import { makeGetConfigArtifacts } from './artifacts'
import { createChugSplashRuntime } from '../cre'

// Load environment variables from .env
dotenv.config()

// internal tasks
export const TASK_CHUGSPLASH_FETCH = 'chugsplash-fetch'

// public tasks
export const TASK_CHUGSPLASH_INIT = 'chugsplash-init'
export const TASK_CHUGSPLASH_DEPLOY = 'chugsplash-deploy'
export const TASK_CHUGSPLASH_PROPOSE = 'chugsplash-propose'
export const TASK_CHUGSPLASH_CANCEL = 'chugsplash-cancel'
export const TASK_CHUGSPLASH_ADD_PROPOSER = 'chugsplash-add-proposers'
export const TASK_CHUGSPLASH_IMPORT_PROXY = 'chugsplash-import-proxy'
export const TASK_CHUGSPLASH_EXPORT_PROXY = 'chugsplash-export-proxy'

subtask(TASK_CHUGSPLASH_FETCH)
  .addParam('configUri', undefined, undefined, types.string)
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(chugsplashFetchSubtask)

export const chugsplashDeployTask = async (
  args: {
    configPath: string
    project: string
    newOwner: string
    silent: boolean
    noCompile: boolean
    confirm: boolean
    signer: string | undefined
  },
  hre: HardhatRuntimeEnvironment
) => {
  const {
    configPath,
    project,
    newOwner,
    silent,
    noCompile,
    confirm,
    signer: signerAddress,
  } = args
  const spinner = ora({ isSilent: silent })

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  spinner.start('Booting up ChugSplash...')

  const cre = await createChugSplashRuntime(
    false,
    confirm,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  const ownerAddress =
    signerAddress ?? (await hre.ethers.provider.getSigner().getAddress())

  const provider = hre.ethers.provider
  await ensureChugSplashInitialized(provider, hre.ethers.provider.getSigner())

  spinner.succeed('ChugSplash is ready!')

  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments

  const { parsedConfig, configCache, configArtifacts } =
    await readValidatedChugSplashConfig(
      configPath,
      project,
      provider,
      cre,
      makeGetConfigArtifacts(hre),
      ownerAddress
    )

  const signer = await getSignerFromOwnerAddress(hre, ownerAddress)

  const projectNames =
    project === 'all' ? Object.keys(parsedConfig.projects) : [project]

  for (const name of projectNames) {
    await chugsplashDeployAbstractTask(
      provider,
      signer,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      cre,
      parsedConfig.options.owner,
      parsedConfig.projects[name],
      configCache[name],
      configArtifacts[name],
      newOwner,
      spinner
    )
  }
}

task(TASK_CHUGSPLASH_DEPLOY)
  .setDescription('Deploys a ChugSplash config file')
  .addParam('configPath', 'Path to the ChugSplash config file to deploy')
  .addParam('project', 'The name of the project to deploy')
  .addOptionalParam(
    'signer',
    'Signer to use for the deployment. If unspecified, defaults to the first configured signer.'
  )
  .addOptionalParam(
    'newOwner',
    "Address to receive ownership of the project after the deployment is finished. If unspecified, defaults to the signer's address."
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  .addFlag(
    'confirm',
    'Automatically confirm contract upgrades. Only applicable if upgrading on a live network.'
  )
  .setAction(chugsplashDeployTask)

// TODO(propose)
export const chugsplashProposeTask = async () =>
  //   args: {
  //     configPath: string
  //     project: string
  //     ipfsUrl: string
  //     silent: boolean
  //     noCompile: boolean
  //     confirm: boolean
  //   },
  //   hre: HardhatRuntimeEnvironment
  {
    //   const { configPath, project, ipfsUrl, silent, noCompile, confirm } = args
    //   const cre = await createChugSplashRuntime(
    //     true,
    //     confirm,
    //     hre.config.paths.canonicalConfigs,
    //     hre,
    //     silent
    //   )
    //   if (!noCompile) {
    //     await hre.run(TASK_COMPILE, {
    //       quiet: true,
    //     })
    //   }
    //   const provider = hre.ethers.provider
    //   const signer = hre.ethers.provider.getSigner()
    //   await ensureChugSplashInitialized(provider, signer)
    //   const { parsedConfig, configArtifacts, configCache } =
    //     await readValidatedChugSplashConfig(
    //       configPath,
    //       project,
    //       provider,
    //       cre,
    //       makeGetConfigArtifacts(hre)
    //     )
    //   const projectNames =
    //     project === 'all' ? Object.keys(parsedConfig.projects) : project
    //   for (const name of projectNames) {
    //     await chugsplashProposeAbstractTask(
    //       provider,
    //       signer,
    //       parsedConfig.projects[name],
    //       configPath,
    //       ipfsUrl,
    //       'hardhat',
    //       configArtifacts,
    //       ProposalRoute.RELAY,
    //       cre,
    //       configCache[name]
    //     )
    //   }
  }

task(TASK_CHUGSPLASH_PROPOSE)
  .setDescription('Proposes a new ChugSplash project')
  .addParam('configPath', 'Path to the ChugSplash config file to propose')
  .addParam('project', 'The name of the project to deploy')
  .addFlag('silent', "Hide all of ChugSplash's logs")
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

task(TASK_NODE)
  .addOptionalParam('configPath', 'Path to chugsplash config')
  .addOptionalParam(
    'signer',
    'Signer to use for the deployment. If unspecified, defaults to the first configured signer.'
  )
  .addFlag(
    'disableChugsplash',
    "Completely disable all of ChugSplash's activity."
  )
  .addFlag('hide', "Hide all of ChugSplash's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(
    async (
      args: {
        configPath: string
        disableChugsplash: boolean
        hide: boolean
        noCompile: boolean
        confirm: boolean
        signer: string | undefined
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const {
        configPath,
        disableChugsplash,
        hide: silent,
        noCompile,
        signer: signerAddress,
      } = args

      if (!disableChugsplash) {
        const spinner = ora({ isSilent: silent })
        spinner.start('Booting up ChugSplash...')

        const ownerAddress =
          signerAddress ?? (await hre.ethers.provider.getSigner().getAddress())

        const signer = await getSignerFromOwnerAddress(hre, ownerAddress)

        await ensureChugSplashInitialized(hre.ethers.provider, signer)

        spinner.succeed('ChugSplash has been initialized.')

        if (configPath) {
          if (!configPath) {
            throw Error('Must specify a config path to deploy all projects')
          }
          if (!noCompile) {
            await hre.run(TASK_COMPILE, {
              quiet: true,
            })
          }
          await deployAllChugSplashProjects(hre, silent, configPath, signer)
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
  .setDescription(
    // TODO: is this still true?
    `Runs mocha tests. By default, deploys all ChugSplash configs in 'chugsplash/' before running the tests.`
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .addOptionalParam(
    'configPath',
    'Optional path to the single ChugSplash config file to test.'
  )
  .addOptionalParam(
    'project',
    'Optional name of a ChugSplash project to test. Format must be a comma-separated string.'
  )
  .addOptionalParam(
    'projects',
    'Optional names of to ChugSplash projects to test. Format must be a comma-separated string.'
  )
  .addOptionalParam(
    'signer',
    'Signer to use for the deployment. If unspecified, defaults to the first configured signer.'
  )
  .setAction(
    async (
      args: {
        silent: boolean
        noCompile: boolean
        confirm: boolean
        configPath: string
        project: string
        projects: string
        signer: string | undefined
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const {
        silent,
        noCompile,
        configPath,
        project,
        projects,
        signer: signerAddress,
      } = args

      const ownerAddress =
        signerAddress ?? (await hre.ethers.provider.getSigner().getAddress())

      const signer = await getSignerFromOwnerAddress(hre, ownerAddress)
      const networkName = await resolveNetworkName(
        hre.ethers.provider,
        'hardhat'
      )
      if (
        (await isLocalNetwork(hre.ethers.provider)) ||
        (await isHardhatFork(hre.ethers.provider))
      ) {
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
          await ensureChugSplashInitialized(hre.ethers.provider, signer)
          if (!noCompile) {
            await hre.run(TASK_COMPILE, {
              quiet: true,
            })
          }

          if (configPath) {
            let projectNames: string[] | undefined
            if (project) {
              projectNames = [project]
            } else if (projects) {
              projectNames = projects.replace(/\s+/g, '').split(',')
            }

            await deployAllChugSplashProjects(
              hre,
              silent,
              configPath,
              signer,
              projectNames
            )
          } else {
            if (project || projects) {
              throw new Error('Must specify a chugsplash config path')
            }
          }
        }
        await writeSnapshotId(
          hre.ethers.provider,
          networkName,
          hre.config.paths.deployments
        )
      }
      await runSuper(args)
    }
  )

task(TASK_RUN)
  .addOptionalParam('configPath', 'Path to ChugSplash config file')
  .addOptionalParam(
    'signer',
    'Signer to use for the deployment. If unspecified, defaults to the first configured signer.'
  )
  .setAction(
    async (
      args: {
        configPath: string
        noCompile: boolean
        signer: string | undefined
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { configPath, noCompile, signer: signerAddress } = args

      if (configPath) {
        const ownerAddress =
          signerAddress ?? (await hre.ethers.provider.getSigner().getAddress())

        const signer = await getSignerFromOwnerAddress(hre, ownerAddress)

        await ensureChugSplashInitialized(hre.ethers.provider, signer)
        if (!noCompile) {
          await hre.run(TASK_COMPILE, {
            quiet: true,
          })
        }
        await deployAllChugSplashProjects(hre, true, configPath, signer)
      }
      await runSuper(args)
    }
  )

export const chugsplashCancelTask = async (
  args: {
    configPath: string
    project: string
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, project } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const cre = await createChugSplashRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    false
  )

  await chugsplashCancelAbstractTask(
    provider,
    signer,
    project,
    configPath,
    'hardhat',
    cre
  )
}

task(TASK_CHUGSPLASH_CANCEL)
  .setDescription('Cancel an active ChugSplash project.')
  .addParam('configPath', 'Path to the ChugSplash config file to cancel')
  .addParam('project', 'Name of the ChugSplash project to cancel')
  .setAction(chugsplashCancelTask)

export const exportProxyTask = async (
  args: {
    project: string
    configPath: string
    referenceName: string
    silent: boolean
    signer: string | undefined
  },
  hre: HardhatRuntimeEnvironment
) => {
  const {
    configPath,
    project,
    referenceName,
    silent,
    signer: signerAddress,
  } = args
  const cre = await createChugSplashRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  const provider = hre.ethers.provider

  const ownerAddress =
    signerAddress ?? (await hre.ethers.provider.getSigner().getAddress())

  const signer = await getSignerFromOwnerAddress(hre, ownerAddress)

  const { parsedConfig } = await readValidatedChugSplashConfig(
    configPath,
    project,
    provider,
    cre,
    makeGetConfigArtifacts(hre),
    ownerAddress
  )

  await chugsplashExportProxyAbstractTask(
    provider,
    signer,
    configPath,
    project,
    referenceName,
    'hardhat',
    parsedConfig,
    cre
  )
}

task(TASK_CHUGSPLASH_EXPORT_PROXY)
  .setDescription(
    'Transfers ownership of a proxy from ChugSplash to the caller'
  )
  .addParam(
    'configPath',
    'Path to the ChugSplash config file for the project that owns the target contract'
  )
  .addParam('project', 'The name of the project this proxy is a part of')
  .addParam(
    'referenceName',
    'Reference name of the contract that should be transferred to you'
  )
  .addOptionalParam(
    'signer',
    'Signer to use. If unspecified, defaults to the first configured signer.'
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .setAction(exportProxyTask)

export const importProxyTask = async (
  args: {
    proxy: string
    silent: boolean
    signer: string
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { proxy, silent, signer: signerAddress } = args

  const provider = hre.ethers.provider

  const ownerAddress =
    signerAddress ?? (await hre.ethers.provider.getSigner().getAddress())

  const signer = await getSignerFromOwnerAddress(hre, ownerAddress)

  const cre = await createChugSplashRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  await chugsplashImportProxyAbstractTask(
    provider,
    signer,
    proxy,
    'hardhat',
    signerAddress,
    cre
  )
}

task(TASK_CHUGSPLASH_IMPORT_PROXY)
  .setDescription('Transfers ownership of a proxy to ChugSplash')
  .addParam(
    'configPath',
    'Path to the ChugSplash config file for the project that you would like to own the target contract'
  )
  .addParam(
    'proxy',
    'Address of the contract that should have its ownership transferred to ChugSplash.'
  )
  .addOptionalParam(
    'signer',
    'Signer to use. If unspecified, defaults to the first configured signer.'
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .setAction(importProxyTask)

export const chugsplashInitTask = async (
  args: {
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { silent } = args
  const spinner = ora({ isSilent: silent })
  spinner.start('Initializing ChugSplash project...')

  // Get the Solidity compiler version from the Hardhat config.
  const [{ version: solcVersion }] = hre.config.solidity.compilers

  // True if the Hardhat project is TypeScript and false if it's JavaScript.
  const isTypeScriptProject =
    path.extname(hre.config.paths.configFile) === '.ts'

  writeSampleProjectFiles(
    hre.config.paths.chugsplash,
    hre.config.paths.sources,
    hre.config.paths.tests,
    isTypeScriptProject,
    solcVersion,
    'hardhat'
  )

  spinner.succeed('Initialized ChugSplash project.')
}

task(TASK_CHUGSPLASH_INIT)
  .setDescription('Sets up a ChugSplash project.')
  .addFlag('silent', "Hide ChugSplash's logs")
  .setAction(chugsplashInitTask)
