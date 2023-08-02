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
  writeSnapshotId,
  sphinxCancelAbstractTask,
  sphinxExportProxyAbstractTask,
  sphinxImportProxyAbstractTask,
  ensureSphinxInitialized,
  proposeAbstractTask,
  readUserConfigWithOptions,
  readUserConfig,
  getParsedConfig,
  getNetworkType,
  NetworkType,
  resolveNetwork,
  getNetworkDirName,
} from '@sphinx-labs/core'
import ora from 'ora'
import * as dotenv from 'dotenv'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { Signer, utils } from 'ethers/lib/ethers'

import { writeSampleProjectFiles } from '../sample-project'
import { getSignerFromAddress } from './deployments'
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
    signer: string
    silent?: boolean
    noCompile?: boolean
    newOwner?: string
    confirm?: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, newOwner, noCompile, confirm, signer } = args
  const silent = !!args.silent

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const spinner = ora({ isSilent: silent })
  spinner.start('Getting project info...')

  const owner = await resolveSigner(hre, signer)
  const ownerAddress = await owner.getAddress()

  const provider = hre.ethers.provider

  const cre = createSphinxRuntime(
    'hardhat',
    false,
    hre.config.networks.hardhat.allowUnlimitedContractSize,
    confirm,
    hre.config.paths.compilerConfigs,
    hre,
    silent
  )

  await ensureSphinxInitialized(provider, provider.getSigner())

  const compilerConfigPath = hre.config.paths.compilerConfigs
  const deploymentFolder = hre.config.paths.deployments

  const { parsedConfig, configCache, configArtifacts } = await getParsedConfig(
    await readUserConfig(configPath),
    provider,
    cre,
    makeGetConfigArtifacts(hre),
    ownerAddress
  )

  await deployAbstractTask(
    provider,
    owner,
    compilerConfigPath,
    deploymentFolder,
    'hardhat',
    cre,
    parsedConfig,
    configCache,
    configArtifacts,
    newOwner,
    spinner
  )
}

task(TASK_SPHINX_DEPLOY)
  .setDescription('Deploys a Sphinx config file')
  .addParam('configPath', 'Path to the Sphinx config file to deploy')
  .addParam(
    'signer',
    'Account to deploy the Sphinx config. This can either be the index of the signer in the Hardhat config or the address of the signer.'
  )
  .addOptionalParam(
    'newOwner',
    "Address to receive ownership of the project after the deployment is finished. If unspecified, defaults to the signer's address."
  )
  .addFlag('silent', "Hide all of Sphinx's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  .addFlag('confirm', 'Automatically confirm the deployment.')
  .setAction(sphinxDeployTask)

export const sphinxProposeTask = async (
  args: {
    configPath: string
    testnets?: boolean
    mainnets?: boolean
    noCompile?: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, noCompile, testnets, mainnets } = args

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

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const spinner = ora()
  spinner.start(`Getting project info...`)

  const cre = createSphinxRuntime(
    'hardhat',
    true,
    hre.config.networks.hardhat.allowUnlimitedContractSize,
    false, // Users must manually confirm proposals.
    hre.config.paths.compilerConfigs,
    hre,
    false
  )

  await proposeAbstractTask(
    await readUserConfigWithOptions(configPath),
    isTestnet,
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
  .addFlag('testnets', 'Propose on the testnets specified in the Sphinx config')
  .addFlag('mainnets', `Propose on the mainnets specified in the Sphinx config`)
  .addFlag('noCompile', 'Skip compiling your contracts before proposing')
  .setAction(sphinxProposeTask)

task(TASK_NODE)
  .addFlag(
    'disableSphinx',
    "Don't deploy the Sphinx contracts when starting the node."
  )
  .addFlag('hide', "Hide all of Sphinx's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(
    async (
      args: {
        disableSphinx?: boolean
        hide?: boolean
        noCompile?: boolean
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
  .addFlag('log', "Show Sphinx's deployment logs")
  .addOptionalParam(
    'signer',
    'Account to deploy the Sphinx config. This can either be the index of the signer in the Hardhat config or the address of the signer.'
  )
  .addOptionalParam(
    'configPath',
    'Optional path to the single Sphinx config file to test.'
  )
  .setAction(
    async (
      args: {
        signer?: string
        log?: boolean
        noCompile?: boolean
        configPath?: string
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { noCompile, configPath, signer } = args
      const silent = !args.log

      if (!configPath) {
        await runSuper(args)
        return
      }

      if (!signer) {
        throw new Error(
          'Must specify a signer via --signer when running Sphinx tests.'
        )
      }

      const networkType = await getNetworkType(hre.ethers.provider)
      const { networkName, chainId } = await resolveNetwork(
        hre.ethers.provider,
        networkType
      )

      if (networkType !== NetworkType.LIVE_NETWORK) {
        const networkDirName = getNetworkDirName(
          networkName,
          networkType,
          chainId
        )
        try {
          const snapshotIdPath = path.join(
            path.basename(hre.config.paths.deployments),
            networkDirName,
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

          await sphinxDeployTask(
            {
              configPath,
              silent,
              noCompile: true,
              signer,
              confirm: true,
            },
            hre
          )
        }
        await writeSnapshotId(
          hre.ethers.provider,
          networkDirName,
          hre.config.paths.deployments
        )
      }
      await runSuper(args)
    }
  )

export const sphinxCancelTask = async (
  args: {
    configPath: string
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath } = args

  const { projectName } = await readUserConfig(configPath)

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const cre = await createSphinxRuntime(
    'hardhat',
    false,
    hre.config.networks.hardhat.allowUnlimitedContractSize,
    true,
    hre.config.paths.compilerConfigs,
    hre,
    false
  )

  await sphinxCancelAbstractTask(provider, signer, projectName, 'hardhat', cre)
}

task(TASK_SPHINX_CANCEL)
  .setDescription('Cancel an active Sphinx deployment.')
  .addParam('configPath', 'Path to the Sphinx config file to cancel')
  .setAction(sphinxCancelTask)

export const exportProxyTask = async (
  args: {
    projectName: string
    signer: string
    configPath: string
    referenceName: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, projectName, referenceName, silent, signer } = args
  const cre = await createSphinxRuntime(
    'hardhat',
    false,
    hre.config.networks.hardhat.allowUnlimitedContractSize,
    true,
    hre.config.paths.compilerConfigs,
    hre,
    silent
  )

  const provider = hre.ethers.provider

  const owner = await resolveSigner(hre, signer)
  const ownerAddress = await owner.getAddress()

  const { parsedConfig } = await getParsedConfig(
    await readUserConfig(configPath),
    provider,
    cre,
    makeGetConfigArtifacts(hre),
    ownerAddress
  )

  await sphinxExportProxyAbstractTask(
    provider,
    owner,
    projectName,
    referenceName,
    'hardhat',
    parsedConfig,
    cre
  )
}

// task(TASK_SPHINX_EXPORT_PROXY)
//   .setDescription('Transfers ownership of a proxy from Sphinx to the caller')
//   .addParam(
//     'configPath',
//     'Path to the Sphinx config file for the project that owns the target contract'
//   )
//   .addOptionalParam('signer', 'Address of the signer to use.')
//   .addParam(
//     'referenceName',
//     'Reference name of the contract that should be transferred to you'
//   )
//   .addFlag('silent', "Hide all of Sphinx's logs")
//   .setAction(exportProxyTask)

export const importProxyTask = async (
  args: {
    projectName: string
    signer: string
    proxy: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { projectName, proxy, silent, signer } = args

  const owner = await resolveSigner(hre, signer)
  const ownerAddress = await owner.getAddress()

  const provider = hre.ethers.provider

  const cre = await createSphinxRuntime(
    'hardhat',
    false,
    hre.config.networks.hardhat.allowUnlimitedContractSize,
    true,
    hre.config.paths.compilerConfigs,
    hre,
    silent
  )

  await sphinxImportProxyAbstractTask(
    projectName,
    provider,
    owner,
    proxy,
    'hardhat',
    ownerAddress,
    cre
  )
}

// task(TASK_SPHINX_IMPORT_PROXY)
//   .setDescription('Transfers ownership of a proxy to Sphinx')
//   .addParam(
//     'configPath',
//     'Path to the Sphinx config file for the project that you would like to own the target contract'
//   )
//   .addOptionalParam('signer', 'Address of the signer to use.')
//   .addParam(
//     'proxy',
//     'Address of the contract that should have its ownership transferred to Sphinx.'
//   )
//   .addFlag('silent', "Hide all of Sphinx's logs")
//   .setAction(importProxyTask)

export const sphinxInitTask = async (
  args: {
    quickstart?: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const spinner = ora()
  spinner.start('Initializing Sphinx project...')

  // Get the Solidity compiler version from the Hardhat config.
  const [{ version: solcVersion }] = hre.config.solidity.compilers

  // True if the Hardhat config is TypeScript and false if it's JavaScript.
  const isTypeScriptProject =
    path.extname(hre.config.paths.configFile) === '.ts'

  writeSampleProjectFiles(
    hre.config.paths.sphinx,
    hre.config.paths.sources,
    hre.config.paths.tests,
    isTypeScriptProject,
    false,
    solcVersion,
    'hardhat'
  )

  spinner.succeed('Initialized Sphinx project.')
}

task(TASK_SPHINX_INIT)
  .setDescription('Sets up a sample Sphinx project.')
  .setAction(sphinxInitTask)

const resolveSigner = async (
  hre: HardhatRuntimeEnvironment,
  signerStr: string
): Promise<Signer> => {
  if (utils.isAddress(signerStr)) {
    return getSignerFromAddress(hre, signerStr)
  } else {
    const signerIndex = Number(signerStr)
    return hre.ethers.provider.getSigner(signerIndex)
  }
}
