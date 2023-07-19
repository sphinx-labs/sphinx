import * as path from 'path'
import * as fs from 'fs'

import { subtask, task, types } from 'hardhat/config'
import {
  TASK_NODE,
  TASK_TEST,
  TASK_COMPILE,
} from 'hardhat/builtin-tasks/task-names'
import {
  sphinxFetchSubtask,
  deployAbstractTask,
  resolveNetworkName,
  writeSnapshotId,
  sphinxCancelAbstractTask,
  sphinxExportProxyAbstractTask,
  sphinxImportProxyAbstractTask,
  readParsedOwnerConfig,
  ensureSphinxInitialized,
  isHardhatFork,
  isLocalNetwork,
  proposeAbstractTask,
} from '@sphinx/core'
import ora from 'ora'
import * as dotenv from 'dotenv'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { Signer } from 'ethers/lib/ethers'

import { writeSampleProjectFiles } from '../sample-project'
import { deployAllSphinxProjects, getSignerFromAddress } from './deployments'
import { makeGetConfigArtifacts, makeGetProviderFromChainId } from './artifacts'
import { createSphinxRuntime } from '../cre'

// Load environment variables from .env
dotenv.config()

// internal tasks
export const TASK_SPHINX_FETCH = 'sphinx-fetch'

// public tasks
export const TASK_SPHINX_INIT = 'sphinx-init'
export const TASK_SPHINX_DEPLOY = 'sphinx-deploy'
export const TASK_SPHINX_PROPOSE = 'sphinx-propose'
export const TASK_SPHINX_CANCEL = 'sphinx-cancel'
export const TASK_SPHINX_IMPORT_PROXY = 'sphinx-import-proxy'
export const TASK_SPHINX_EXPORT_PROXY = 'sphinx-export-proxy'

subtask(TASK_SPHINX_FETCH)
  .addParam('configUri', undefined, undefined, types.string)
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(sphinxFetchSubtask)

export const sphinxDeployTask = async (
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

  spinner.start('Booting up Sphinx...')

  const cre = await createSphinxRuntime(
    false,
    confirmUpgrade,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  await ensureSphinxInitialized(provider, provider.getSigner())

  spinner.succeed('Sphinx is ready!')

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

task(TASK_SPHINX_DEPLOY)
  .setDescription('Deploys a Sphinx config file')
  .addParam('configPath', 'Path to the Sphinx config file to deploy')
  .addParam('project', 'The name of the project to deploy')
  .addOptionalParam(
    'signer',
    'Address of the signer that deploys the Sphinx config.'
  )
  .addFlag(
    'useDefaultSigner',
    'Use the first signer in the Hardhat config to deploy the Sphinx config.'
  )
  .addOptionalParam(
    'newOwner',
    "Address to receive ownership of the project after the deployment is finished. If unspecified, defaults to the signer's address."
  )
  .addFlag('silent', "Hide all of Sphinx's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  // .addFlag(
  //   'confirmUpgrade',
  //   'Automatically confirm contract upgrade. Only applicable if upgrading on a live network.'
  // )
  .setAction(sphinxDeployTask)

export const sphinxProposeTask = async (
  args: {
    configPath: string
    project: string
    dryRun: boolean
    testnets: boolean
    mainnets: boolean
    noCompile: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, project, noCompile, dryRun, testnets, mainnets } = args

  let isTestnet: boolean
  if (testnets && mainnets) {
    throw new Error('Cannot specify both --testnets and --mainnets')
  } else if (testnets) {
    isTestnet = true
  } else if (mainnets) {
    isTestnet = false
  } else {
    throw new Error('Must specify either --testnets or --mainnets')
  }

  const dryRunOrProposal = dryRun ? 'Dry run' : 'Proposal'
  const spinner = ora()
  spinner.start(`${dryRunOrProposal} in progress...`)

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const cre = createSphinxRuntime(
    true,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    false
  )

  await proposeAbstractTask(
    configPath,
    isTestnet,
    project,
    dryRun,
    cre,
    makeGetConfigArtifacts(hre),
    makeGetProviderFromChainId(hre),
    spinner
  )
}

task(TASK_SPHINX_PROPOSE)
  .setDescription(
    `Propose the latest version of a config file. Signs a proposal meta transaction and relays it to Sphinx's back-end.`
  )
  .addParam('configPath', 'Path to the Sphinx config file')
  .addParam('project', 'The name of the project to propose')
  .addFlag('testnets', 'Propose on the testnets specified in the Sphinx config')
  .addFlag('mainnets', `Propose on the mainnets specified in the Sphinx config`)
  .addFlag(
    'dryRun',
    'Dry run the proposal without signing or relaying it to the back-end.'
  )
  .addFlag('noCompile', 'Skip compiling your contracts before proposing')
  .setAction(sphinxProposeTask)

task(TASK_NODE)
  .addFlag('disableSphinx', "Completely disable all of Sphinx's activity.")
  .addFlag('hide', "Hide all of Sphinx's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(
    async (
      args: {
        disableSphinx: boolean
        hide: boolean
        noCompile: boolean
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { disableSphinx, hide: silent, noCompile } = args

      if (!noCompile) {
        await hre.run(TASK_COMPILE, {
          quiet: true,
        })
      }

      if (!disableSphinx) {
        const spinner = ora({ isSilent: silent })
        spinner.start('Booting up Sphinx...')

        await ensureSphinxInitialized(
          hre.ethers.provider,
          hre.ethers.provider.getSigner()
        )

        spinner.succeed('Sphinx has been initialized.')
      }
      await runSuper(args)
    }
  )

task(TASK_TEST)
  .setDescription(
    `Runs mocha tests. By default, deploys all Sphinx configs in 'sphinx/' before running the tests.`
  )
  .addFlag('silent', "Hide all of Sphinx's logs")
  .addFlag('disableSphinx', "Completely disable all of Sphinx's activity.")
  .addOptionalParam(
    'signer',
    'Address of the signer that deploys the Sphinx config.'
  )
  .addFlag(
    'useDefaultSigner',
    'Use the first signer in the Hardhat config to deploy the Sphinx config.'
  )
  .addOptionalParam(
    'configPath',
    'Optional path to the single Sphinx config file to test.'
  )
  .addOptionalParam(
    'project',
    'Name of a Sphinx project to deploy before running the tests.'
  )
  .addOptionalParam(
    'projects',
    `Names of Sphinx projects to deploy before running the tests. ` +
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
        disableSphinx?: boolean
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
        disableSphinx,
        signer,
        useDefaultSigner,
      } = args

      if (!disableSphinx) {
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
            await ensureSphinxInitialized(
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
                  'Must specify a Sphinx project name using --project or --projects'
                )
              }

              const owner = await resolveOwner(hre, signer, useDefaultSigner)

              await deployAllSphinxProjects(
                hre,
                silent,
                configPath,
                owner,
                projectNames
              )
            } else {
              if (project || projects) {
                throw new Error('Must specify a sphinx config path')
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

export const sphinxCancelTask = async (
  args: {
    configPath: string
    project: string
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { project } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const cre = await createSphinxRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    false
  )

  await sphinxCancelAbstractTask(provider, signer, project, 'hardhat', cre)
}

task(TASK_SPHINX_CANCEL)
  .setDescription('Cancel an active Sphinx project.')
  .addParam('configPath', 'Path to the Sphinx config file to cancel')
  .addParam('project', 'Name of the Sphinx project to cancel')
  .setAction(sphinxCancelTask)

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
  const cre = await createSphinxRuntime(
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

  await sphinxExportProxyAbstractTask(
    provider,
    owner,
    project,
    referenceName,
    'hardhat',
    parsedConfig.projects,
    cre
  )
}

task(TASK_SPHINX_EXPORT_PROXY)
  .setDescription('Transfers ownership of a proxy from Sphinx to the caller')
  .addParam(
    'configPath',
    'Path to the Sphinx config file for the project that owns the target contract'
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
  .addFlag('silent', "Hide all of Sphinx's logs")
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

  const cre = await createSphinxRuntime(
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  await sphinxImportProxyAbstractTask(
    provider,
    owner,
    proxy,
    'hardhat',
    ownerAddress,
    cre
  )
}

task(TASK_SPHINX_IMPORT_PROXY)
  .setDescription('Transfers ownership of a proxy to Sphinx')
  .addParam(
    'configPath',
    'Path to the Sphinx config file for the project that you would like to own the target contract'
  )
  .addOptionalParam('signer', 'Address of the signer to use.')
  .addFlag(
    'useDefaultSigner',
    'Use the first signer in the Hardhat config file.'
  )
  .addParam(
    'proxy',
    'Address of the contract that should have its ownership transferred to Sphinx.'
  )
  .addFlag('silent', "Hide all of Sphinx's logs")
  .setAction(importProxyTask)

export const sphinxInitTask = async (
  args: {
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { silent } = args
  const spinner = ora({ isSilent: silent })
  spinner.start('Initializing Sphinx project...')

  // Get the Solidity compiler version from the Hardhat config.
  const [{ version: solcVersion }] = hre.config.solidity.compilers

  // True if the Hardhat project is TypeScript and false if it's JavaScript.
  const isTypeScriptProject =
    path.extname(hre.config.paths.configFile) === '.ts'

  writeSampleProjectFiles(
    hre.config.paths.sphinx,
    hre.config.paths.sources,
    hre.config.paths.tests,
    isTypeScriptProject,
    solcVersion,
    'hardhat'
  )

  spinner.succeed('Initialized Sphinx project.')
}

task(TASK_SPHINX_INIT)
  .setDescription('Sets up a sample Sphinx project.')
  .addFlag('silent', "Hide Sphinx's logs")
  .setAction(sphinxInitTask)

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
