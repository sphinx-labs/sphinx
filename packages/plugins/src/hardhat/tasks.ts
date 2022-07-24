import * as path from 'path'
import * as fs from 'fs'

import '@nomiclabs/hardhat-ethers'
import { ethers } from 'ethers'
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
import {
  ChugSplashRegistryABI,
  ChugSplashManagerABI,
} from '@chugsplash/contracts'
import ora from 'ora'

import { getContractArtifact, getStorageLayout } from './artifacts'

// internal tasks
const TASK_CHUGSPLASH_LOAD = 'chugsplash-load'
const TASK_CHUGSPLASH_FETCH = 'chugsplash-fetch'
const TASK_CHUGSPLASH_BUNDLE_LOCAL = 'chugsplash-bundle-local'
const TASK_CHUGSPLASH_BUNDLE_REMOTE = 'chugsplash-bundle-remote'

// public tasks
const TASK_CHUGSPLASH_REGISTER = 'chugsplash-register'
const TASK_CHUGSPLASH_LIST_ALL_PROJECTS = 'chugsplash-list-projects'
const TASK_CHUGSPLASH_VERIFY = 'chugsplash-verify'
const TASK_CHUGSPLASH_COMMIT = 'chugsplash-commit'
const TASK_CHUGSPLASH_PROPOSE = 'chugsplash-propose'
const TASK_CHUGSPLASH_APPROVE = 'chugsplash-approve'
const TASK_CHUGSPLASH_LIST_BUNDLES = 'chugsplash-list-bundles'

// This address was generated using Create2. For now, it needs to be changed manually each time
// the contract is updated.
const CHUGSPLASH_REGISTRY_ADDRESS = '0x29C464320fD8af9Ec8261DC238EA725FE18E2395'

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

task(TASK_CHUGSPLASH_REGISTER)
  .setDescription('Registers a new ChugSplash project')
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

      const ChugSplashRegistry = new ethers.Contract(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryABI,
        hre.ethers.provider.getSigner()
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
  .setAction(async (_, hre) => {
    spinner.start('Getting list of all projects...')

    const ChugSplashRegistry = new ethers.Contract(
      CHUGSPLASH_REGISTRY_ADDRESS,
      ChugSplashRegistryABI,
      hre.ethers.provider.getSigner()
    )

    const events = await ChugSplashRegistry.queryFilter(
      ChugSplashRegistry.filters.ChugSplashProjectRegistered()
    )

    spinner.stop()

    console.table(
      events.map((event) => {
        return {
          name: event.args.projectName,
          manager: event.args.manager,
        }
      })
    )
  })

task(TASK_CHUGSPLASH_PROPOSE)
  .setDescription('Proposes a new ChugSplash bundle')
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
      // First, commit the bundle to IPFS and get the bundle hash that it returns.
      const { configUri, bundleId } = await hre.run(TASK_CHUGSPLASH_COMMIT, {
        deployConfig: args.deployConfig,
        ipfsUrl: args.ipfsUrl,
      })

      // Next, verify that the bundle has been committed to IPFS with the correct bundle hash.
      const { bundle } = await hre.run(TASK_CHUGSPLASH_VERIFY, {
        configUri,
        bundleId,
      })

      spinner.start('Proposing the bundle...')

      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      const ChugSplashRegistry = new ethers.Contract(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryABI,
        hre.ethers.provider.getSigner()
      )

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(config.options.name),
        ChugSplashManagerABI,
        hre.ethers.provider.getSigner()
      )

      await ChugSplashManager.proposeChugSplashBundle(
        bundle.root,
        bundle.actions.length,
        configUri
      )

      spinner.succeed('Bundle successfully proposed')
    }
  )

task(TASK_CHUGSPLASH_APPROVE)
  .setDescription('Allows a manager to approve a bundle to be executed.')
  .addParam('projectName', 'name of the chugsplash project')
  .addParam('bundleId', 'ID of the bundle')
  .setAction(
    async (
      args: {
        projectName: string
        bundleId: string
      },
      hre
    ) => {
      spinner.start('Approving the bundle...')

      const ChugSplashRegistry = new ethers.Contract(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryABI,
        hre.ethers.provider.getSigner()
      )

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(args.projectName),
        ChugSplashManagerABI,
        hre.ethers.provider.getSigner()
      )

      await ChugSplashManager.approveChugSplashBundle(args.bundleId)

      spinner.succeed('Bundle successfully approved')
    }
  )

task(TASK_CHUGSPLASH_LIST_BUNDLES)
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
      spinner.start(`Getting list of all bundles...`)

      const ChugSplashRegistry = new ethers.Contract(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryABI,
        hre.ethers.provider.getSigner()
      )

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(args.projectName),
        ChugSplashManagerABI,
        hre.ethers.provider.getSigner()
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
      const activebundleId = await ChugSplashManager.activebundleId()

      let approvedEvent: any
      if (activebundleId !== ethers.constants.HashZero) {
        for (let i = 0; i < proposedEvents.length; i++) {
          const bundleId = proposedEvents[i].args.bundleId
          if (bundleId === activebundleId) {
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

      spinner.stop()

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
      if (activebundleId !== ethers.constants.HashZero) {
        console.log('Approved:')
        console.log(
          `Bundle ID: ${activebundleId}\t\tConfig URI: ${approvedEvent[0].args.configUri}`
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
    ): Promise<{
      configUri: string
      bundleId: string
    }> => {
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

      const configUri = `ipfs://${configPublishResult.path}`
      const bundleId = ethers.utils.solidityKeccak256(
        ['bytes32', 'uint256', 'string'],
        [bundle.root, bundle.actions.length, configUri]
      )

      spinner.succeed(`Config: ${configUri}`)
      spinner.succeed(`Bundle: ${bundleId}`)

      return { configUri, bundleId }
    }
  )

task(TASK_CHUGSPLASH_VERIFY)
  .setDescription('Checks if a deployment config matches a bundle hash')
  .addParam('configUri', 'location of the config file')
  .addParam('bundleId', 'hash of the bundle')
  .setAction(
    async (
      args: {
        configUri: string
        bundleId: string
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
          configUri: args.configUri,
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

      const bundleId = ethers.utils.solidityKeccak256(
        ['bytes32', 'uint256', 'string'],
        [bundle.root, bundle.actions.length, args.configUri]
      )

      if (bundleId !== args.bundleId) {
        spinner.fail(
          'Bundle ID generated from downloaded config does NOT match given hash'
        )
      } else {
        spinner.succeed('Bundle verified')
      }

      return {
        config,
        bundle,
      }
    }
  )
