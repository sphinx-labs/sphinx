import * as path from 'path'
import * as fs from 'fs'

import { Contract, providers } from 'ethers'
import { subtask, task, types } from 'hardhat/config'
import { SolcBuild } from 'hardhat/types'
import {
  TASK_COMPILE,
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names'
import { create } from 'ipfs-http-client'
import fetch from 'node-fetch'
import { add0x } from '@eth-optimism/core-utils'
import {
  validateChugSplashConfig,
  makeActionBundleFromConfig,
  ChugSplashConfig,
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
} from '@chugsplash/core'
import { ChugSplashRegistryABI } from '@chugsplash/contracts'
import ora from 'ora'

import { getContractArtifact, getStorageLayout } from './artifacts'

// internal tasks
const TASK_CHUGSPLASH_LOAD = 'chugsplash-load'
const TASK_CHUGSPLASH_FETCH = 'chugsplash-fetch'
const TASK_CHUGSPLASH_BUNDLE_LOCAL = 'chugsplash-bundle-local'
const TASK_CHUGSPLASH_BUNDLE_REMOTE = 'chugsplash-bundle-remote'

// public tasks
const TASK_CHUGSPLASH_INIT = 'chugsplash-init'
const TASK_CHUGSPLASH_LIST_ALL_PROJECTS = 'chugsplash-list-all-projects'
const TASK_CHUGSPLASH_VERIFY = 'chugsplash-verify'
const TASK_CHUGSPLASH_COMMIT = 'chugsplash-commit'
const TASK_CHUGSPLASH_PROPOSE = 'chugsplash-propose'
const TASK_CHUGSPLASH_APPROVE = 'chugsplash-approve'
const TASK_CHUGSPLASH_LIST_PROPOSALS = 'chugsplash-list-proposals'

// This address was generated using Create2 so it shouldn't need to be changed for now
const CHUGSPLASH_REGISTRY_ADDRESS = '0x236151FE7938Fc16600a894E8c40C2E862503D3b'

const spinner = ora()

subtask(TASK_CHUGSPLASH_LOAD)
  .addParam('deployConfig', undefined, undefined, types.string)
  .setAction(
    async (args: { deployConfig: string }, hre): Promise<ChugSplashConfig> => {
      // Make sure we have the latest compiled code.
      await hre.run(TASK_COMPILE, {
        quiet: true,
      })
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      let config = require(path.resolve(args.deployConfig))
      config = config.default || config
      validateChugSplashConfig(config)
      return config
    }
  )

subtask(TASK_CHUGSPLASH_BUNDLE_LOCAL)
  .addParam('deployConfig', undefined, undefined, types.string)
  .setAction(
    async (
      args: { deployConfig: string },
      hre
    ): Promise<ChugSplashActionBundle> => {
      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      const artifacts = {}
      for (const contract of Object.values(config.contracts)) {
        const artifact = await getContractArtifact(contract.source)
        const storageLayout = await getStorageLayout(contract.source)
        artifacts[contract.source] = {
          bytecode: artifact.bytecode,
          storageLayout,
        }
      }

      return makeActionBundleFromConfig(config, artifacts, process.env)
    }
  )

subtask(TASK_CHUGSPLASH_BUNDLE_REMOTE)
  .addParam('deployConfig', undefined, undefined, types.any)
  .setAction(
    async (
      args: { deployConfig: CanonicalChugSplashConfig },
      hre
    ): Promise<ChugSplashActionBundle> => {
      const artifacts = {}
      for (const source of args.deployConfig.inputs) {
        const solcBuild: SolcBuild = await hre.run(
          TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
          {
            quiet: true,
            solcVersion: source.solcVersion,
          }
        )

        let output: any // TODO: Compiler output
        if (solcBuild.isSolcJs) {
          output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, {
            input: source.input,
            solcJsPath: solcBuild.compilerPath,
          })
        } else {
          output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLC, {
            input: source.input,
            solcPath: solcBuild.compilerPath,
          })
        }

        for (const fileOutput of Object.values(output.contracts)) {
          for (const [contractName, contractOutput] of Object.entries(
            fileOutput
          )) {
            artifacts[contractName] = {
              bytecode: add0x(contractOutput.evm.bytecode.object),
              storageLayout: contractOutput.storageLayout,
            }
          }
        }
      }

      return makeActionBundleFromConfig(
        args.deployConfig,
        artifacts,
        process.env
      )
    }
  )

subtask(TASK_CHUGSPLASH_FETCH)
  .addParam('configUri', undefined, undefined, types.string)
  .setAction(
    async (args: { configUri: string }): Promise<CanonicalChugSplashConfig> => {
      let config: CanonicalChugSplashConfig
      if (args.configUri.startsWith('ipfs://')) {
        config = await (
          await fetch(
            `https://cloudflare-ipfs.com/ipfs/${args.configUri.replace(
              'ipfs://',
              ''
            )}`
          )
        ).json()
      } else {
        throw new Error('unsupported URI type')
      }

      return config
    }
  )

// TODO: Change provider to a non-local RPC provider after demo
task(TASK_CHUGSPLASH_INIT)
  .setDescription('Creates a new ChugSplash project')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .setAction(
    async (
      args: {
        deployConfig: string
      },
      hre
    ) => {
      spinner.start('Creating new project...')

      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      const provider = new providers.JsonRpcProvider()
      const ChugSplashRegistry = new Contract(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryABI,
        await provider.getSigner()
      )

      await ChugSplashRegistry.register(
        config.options.name,
        config.options.owner
      )

      spinner.succeed('Project successfully created')
    }
  )

task(TASK_CHUGSPLASH_LIST_ALL_PROJECTS)
  .setDescription('Lists all existing ChugSplash projects')
  .setAction(async () => {
    spinner.start('Getting list of all projects...')

    const provider = new providers.JsonRpcProvider()
    const ChugSplashRegistry = new Contract(
      CHUGSPLASH_REGISTRY_ADDRESS,
      ChugSplashRegistryABI,
      provider
    )

    const events = await ChugSplashRegistry.queryFilter(
      ChugSplashRegistry.filters.ChugSplashProjectRegistered()
    )

    spinner.stop()
    events.forEach((event) =>
      console.log(
        `Project: ${event.args.nonIndexedProjectName}\t\tManager: ${event.args.manager}`
      )
    )
  })

task(TASK_CHUGSPLASH_PROPOSE)
  .setDescription('Proposes a new ChugSplash bundle')
  .addParam('bundleHash', 'hash of the bundle')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .setAction(
    async (
      args: {
        bundleHash: string
        deployConfig: string
      },
      hre
    ) => {
      spinner.start('Proposing the bundle...')

      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      const provider = new providers.JsonRpcProvider()
      const ChugSplashRegistry = new Contract(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryABI,
        await provider.getSigner()
      )

      const bundle: ChugSplashActionBundle = await hre.run(
        TASK_CHUGSPLASH_BUNDLE_LOCAL,
        {
          deployConfig: args.deployConfig,
        }
      )

      await ChugSplashRegistry.proposeChugSplashBundle(
        config.options.name,
        args.bundleHash,
        bundle.actions.length,
        args.deployConfig
      )
      spinner.succeed('Bundle successfully proposed')
    }
  )

task(TASK_CHUGSPLASH_APPROVE)
  .setDescription('Allows a manager to approve a bundle to be executed.')
  .addParam('bundleHash', 'hash of the bundle')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .setAction(
    async (
      args: {
        bundleHash: string
        deployConfig: string
      },
      hre
    ) => {
      spinner.start('Approving the bundle...')

      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      const provider = new providers.JsonRpcProvider()
      const ChugSplashRegistry = new Contract(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryABI,
        await provider.getSigner()
      )

      await ChugSplashRegistry.approveChugSplashBundle(
        config.options.name,
        args.bundleHash
      )
      spinner.succeed('Bundle successfully approved')
    }
  )

// TODO: Exclude listing bundles that have been executed
task(TASK_CHUGSPLASH_LIST_PROPOSALS)
  .setDescription('Lists all proposals for a given project')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .setAction(
    async (
      args: {
        deployConfig: string
      },
      hre
    ) => {
      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      const projectName = config.options.name
      spinner.start(`Getting list of all proposals for ${projectName}...`)

      const provider = new providers.JsonRpcProvider()
      const ChugSplashRegistry = new Contract(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryABI,
        provider
      )

      const proposalEvents = await ChugSplashRegistry.queryFilter(
        ChugSplashRegistry.filters.ChugSplashBundleProposed()
      )

      spinner.stop()
      console.log(`Proposals for ${projectName}:`)
      proposalEvents.forEach((event) =>
        console.log(
          `Bundle Hash: ${event.args.bundleHash}\t\tConfig URI: ${event.args.configUri}`
        )
      )
    }
  )

task(TASK_CHUGSPLASH_COMMIT)
  .setDescription('Commits a ChugSplash config file with artifacts to IPFS')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(
    async (
      args: {
        deployConfig: string
        ipfsUrl: string
      },
      hre
    ) => {
      spinner.start('Compiling deploy config...')
      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })
      spinner.succeed('Compiled deploy config')

      const ipfs = create({
        url: args.ipfsUrl || 'https://ipfs.infura.io:5001/api/v0',
      })

      // We'll need this later
      const buildInfoFolder = path.join(
        hre.config.paths.artifacts,
        'build-info'
      )

      // Extract compiler inputs
      const inputs = fs
        .readdirSync(buildInfoFolder)
        .filter((file) => {
          return file.endsWith('.json')
        })
        .map((file) => {
          return JSON.parse(
            fs.readFileSync(path.join(buildInfoFolder, file), 'utf8')
          )
        })
        .map((content) => {
          return {
            solcVersion: content.solcVersion,
            solcLongVersion: content.solcLongVersion,
            input: content.input,
          }
        })

      // Publish config to IPFS
      spinner.start('Publishing config to IPFS...')
      const configPublishResult = await ipfs.add(
        JSON.stringify(
          {
            ...config,
            inputs,
          },
          null,
          2
        )
      )
      spinner.succeed('Published config to IPFS')

      spinner.start('Building artifact bundle...')
      const bundle = await hre.run(TASK_CHUGSPLASH_BUNDLE_LOCAL, {
        deployConfig: args.deployConfig,
      })
      spinner.succeed('Built artifact bundle')

      spinner.succeed(`Config: ipfs://${configPublishResult.path}`)
      spinner.succeed(`Bundle: ${bundle.root}`)
    }
  )

task(TASK_CHUGSPLASH_VERIFY)
  .setDescription('Checks if a deployment config matches a bundle hash')
  // TODO: Should `deployConfig` be changed to `configUri` so that deployConfig
  // has a consistent meaning across tasks?
  .addParam('deployConfig', 'location of the config file')
  .addParam('bundleHash', 'hash of the bundle')
  .setAction(
    async (
      args: {
        deployConfig: string
        bundleHash: string
      },
      hre
    ): Promise<{
      config: CanonicalChugSplashConfig
      bundle: ChugSplashActionBundle
    }> => {
      spinner.start('Fetching config, this might take a while...')
      const config: CanonicalChugSplashConfig = await hre.run(
        TASK_CHUGSPLASH_FETCH,
        {
          configUri: args.deployConfig,
        }
      )
      spinner.succeed('Fetched config')

      spinner.start('Building artifact bundle...')
      const bundle: ChugSplashActionBundle = await hre.run(
        TASK_CHUGSPLASH_BUNDLE_REMOTE,
        {
          deployConfig: config,
        }
      )
      spinner.succeed('Built artifact bundle')

      if (bundle.root !== args.bundleHash) {
        spinner.fail(
          'Bundle hash generated from downloaded config does NOT match given hash'
        )
      } else {
        spinner.succeed('Bundle hash verified')
      }

      return {
        config,
        bundle,
      }
    }
  )
