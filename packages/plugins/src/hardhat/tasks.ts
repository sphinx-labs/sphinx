import * as path from 'path'
import * as fs from 'fs'

import { subtask, task, types } from 'hardhat/config'
import {
  TASK_NODE,
  TASK_TEST,
  TASK_COMPILE,
} from 'hardhat/builtin-tasks/task-names'
import {
  chugsplashFetchSubtask,
  deployAbstractTask,
  resolveNetworkName,
  writeSnapshotId,
  chugsplashCancelAbstractTask,
  chugsplashExportProxyAbstractTask,
  chugsplashImportProxyAbstractTask,
  readParsedOwnerConfig,
  ensureChugSplashInitialized,
  isHardhatFork,
  isLocalNetwork,
  proposeAbstractTask,
} from '@chugsplash/core'
import ora from 'ora'
import * as dotenv from 'dotenv'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { Signer } from 'ethers/lib/ethers'

import { writeSampleProjectFiles } from '../sample-project'
import {
  deployAllChugSplashProjects,
  getSignerFromAddress,
} from './deployments'
import { makeGetConfigArtifacts, makeGetProviderFromChainId } from './artifacts'
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
    confirmUpgrade?: boolean
    signer?: string
    useDefaultSigner?: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const {
    configPath,
    project,
    newOwner,
    silent,
    noCompile,
    confirmUpgrade,
    signer,
    useDefaultSigner,
  } = args
  const spinner = ora({ isSilent: silent })

  const owner = await resolveOwner(hre, signer, useDefaultSigner)
  const ownerAddress = await owner.getAddress()

  const provider = hre.ethers.provider

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  spinner.start('Booting up ChugSplash...')

  const cre = await createChugSplashRuntime(
    false,
    confirmUpgrade,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  await ensureChugSplashInitialized(provider, provider.getSigner())

  spinner.succeed('ChugSplash is ready!')

  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments

  const { parsedConfig, configCache, configArtifacts } =
    await readParsedOwnerConfig(
      configPath,
      project,
      provider,
      cre,
      makeGetConfigArtifacts(hre),
      ownerAddress
    )

  await deployAbstractTask(
    provider,
    owner,
    canonicalConfigPath,
    deploymentFolder,
    'hardhat',
    cre,
    parsedConfig.projects[project],
    configCache[project],
    configArtifacts[project],
    newOwner,
    spinner
  )
}

task(TASK_CHUGSPLASH_DEPLOY)
  .setDescription('Deploys a ChugSplash config file')
  .addParam('configPath', 'Path to the ChugSplash config file to deploy')
  .addParam('project', 'The name of the project to deploy')
  .addOptionalParam(
    'signer',
    'Address of the signer that deploys the ChugSplash config.'
  )
  .addFlag(
    'useDefaultSigner',
    'Use the first signer in the Hardhat config to deploy the ChugSplash config.'
  )
  .addOptionalParam(
    'newOwner',
    "Address to receive ownership of the project after the deployment is finished. If unspecified, defaults to the signer's address."
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  // .addFlag(
  //   'confirmUpgrade',
  //   'Automatically confirm contract upgrade. Only applicable if upgrading on a live network.'
  // )
  .setAction(chugsplashDeployTask)

export const chugsplashProposeTask = async (
  args: {
    configPath: string
    project: string
    dryRun: boolean
    noCompile: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, project, noCompile, dryRun } = args

  const dryRunOrProposal = dryRun ? 'Dry run' : 'Proposal'
  const spinner = ora()
  spinner.start(`${dryRunOrProposal} in progress...`)

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const cre = createChugSplashRuntime(
    true,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    false
  )

  await proposeAbstractTask(
    configPath,
    project,
    dryRun,
    cre,
    makeGetConfigArtifacts(hre),
    makeGetProviderFromChainId(hre),
    spinner
  )
}

task(TASK_CHUGSPLASH_PROPOSE)
  .setDescription(
    `Propose the latest version of a config file. Signs a proposal meta transaction and relays it to ChugSplash's back-end.`
  )
  .addParam('configPath', 'Path to the ChugSplash config file')
  .addParam('project', 'The name of the project to propose')
  .addFlag(
    'dryRun',
    'Dry run the proposal without signing or relaying it to the back-end.'
  )
  .addFlag('noCompile', 'Skip compiling your contracts before proposing')
  .setAction(chugsplashProposeTask)

task(TASK_NODE)
  .addFlag(
    'disableChugsplash',
    "Completely disable all of ChugSplash's activity."
  )
  .addFlag('hide', "Hide all of ChugSplash's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(
    async (
      args: {
        disableChugsplash: boolean
        hide: boolean
        noCompile: boolean
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { disableChugsplash, hide: silent, noCompile } = args

      if (!noCompile) {
        await hre.run(TASK_COMPILE, {
          quiet: true,
        })
      }

      if (!disableChugsplash) {
        const spinner = ora({ isSilent: silent })
        spinner.start('Booting up ChugSplash...')

        await ensureChugSplashInitialized(
          hre.ethers.provider,
          hre.ethers.provider.getSigner()
        )

        spinner.succeed('ChugSplash has been initialized.')
      }
      await runSuper(args)
    }
  )

task(TASK_TEST)
  .setDescription(
    `Runs mocha tests. By default, deploys all ChugSplash configs in 'chugsplash/' before running the tests.`
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .addFlag(
    'disableChugsplash',
    "Completely disable all of ChugSplash's activity."
  )
  .addOptionalParam(
    'signer',
    'Address of the signer that deploys the ChugSplash config.'
  )
  .addFlag(
    'useDefaultSigner',
    'Use the first signer in the Hardhat config to deploy the ChugSplash config.'
  )
  .addOptionalParam(
    'configPath',
    'Optional path to the single ChugSplash config file to test.'
  )
  .addOptionalParam(
    'project',
    'Name of a ChugSplash project to deploy before running the tests.'
  )
  .addOptionalParam(
    'projects',
    `Names of ChugSplash projects to deploy before running the tests. ` +
      `Format must be a comma-separated string, such as: 'Project1, Project2'.`
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
        disableChugsplash?: boolean
        signer?: string
        useDefaultSigner?: boolean
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
        disableChugsplash,
        signer,
        useDefaultSigner,
      } = args

      if (!disableChugsplash) {
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
            await ensureChugSplashInitialized(
              hre.ethers.provider,
              hre.ethers.provider.getSigner()
            )
            if (!noCompile) {
              await hre.run(TASK_COMPILE, {
                quiet: true,
              })
            }

            if (configPath) {
              let projectNames: string[]
              if (project) {
                projectNames = [project]
              } else if (projects) {
                projectNames = projects.replace(/\s+/g, '').split(',')
              } else {
                throw new Error(
                  'Must specify a ChugSplash project name using --project or --projects'
                )
              }

              const owner = await resolveOwner(hre, signer, useDefaultSigner)

              await deployAllChugSplashProjects(
                hre,
                silent,
                configPath,
                owner,
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
  const { project } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const cre = await createChugSplashRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    false
  )

  await chugsplashCancelAbstractTask(provider, signer, project, 'hardhat', cre)
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
    signer?: string
    useDefaultSigner?: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const {
    configPath,
    project,
    referenceName,
    silent,
    signer,
    useDefaultSigner,
  } = args
  const cre = await createChugSplashRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  const provider = hre.ethers.provider

  const owner = await resolveOwner(hre, signer, useDefaultSigner)
  const ownerAddress = await owner.getAddress()

  const { parsedConfig } = await readParsedOwnerConfig(
    configPath,
    project,
    provider,
    cre,
    makeGetConfigArtifacts(hre),
    ownerAddress
  )

  await chugsplashExportProxyAbstractTask(
    provider,
    owner,
    project,
    referenceName,
    'hardhat',
    parsedConfig.projects,
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
  .addOptionalParam('signer', 'Address of the signer to use.')
  .addFlag(
    'useDefaultSigner',
    'Use the first signer in the Hardhat config file.'
  )
  .addParam('project', 'The name of the project this proxy is a part of')
  .addParam(
    'referenceName',
    'Reference name of the contract that should be transferred to you'
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .setAction(exportProxyTask)

export const importProxyTask = async (
  args: {
    proxy: string
    silent: boolean
    signer?: string
    useDefaultSigner?: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { proxy, silent, signer, useDefaultSigner } = args

  const owner = await resolveOwner(hre, signer, useDefaultSigner)
  const ownerAddress = await owner.getAddress()

  const provider = hre.ethers.provider

  const cre = await createChugSplashRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  await chugsplashImportProxyAbstractTask(
    provider,
    owner,
    proxy,
    'hardhat',
    ownerAddress,
    cre
  )
}

task(TASK_CHUGSPLASH_IMPORT_PROXY)
  .setDescription('Transfers ownership of a proxy to ChugSplash')
  .addParam(
    'configPath',
    'Path to the ChugSplash config file for the project that you would like to own the target contract'
  )
  .addOptionalParam('signer', 'Address of the signer to use.')
  .addFlag(
    'useDefaultSigner',
    'Use the first signer in the Hardhat config file.'
  )
  .addParam(
    'proxy',
    'Address of the contract that should have its ownership transferred to ChugSplash.'
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
  .setDescription('Sets up a sample ChugSplash project.')
  .addFlag('silent', "Hide ChugSplash's logs")
  .setAction(chugsplashInitTask)

const resolveOwner = async (
  hre: HardhatRuntimeEnvironment,
  signerAddress?: string,
  useDefaultSigner?: boolean
): Promise<Signer> => {
  if (!signerAddress && !useDefaultSigner) {
    throw new Error(
      'Must specify either --signer <address> or --use-default-signer'
    )
  } else if (signerAddress && useDefaultSigner) {
    throw new Error(
      'Cannot specify both --signer <address> and --use-default-signer'
    )
  } else if (signerAddress) {
    return getSignerFromAddress(hre, signerAddress)
  } else {
    return hre.ethers.provider.getSigner()
  }
}
