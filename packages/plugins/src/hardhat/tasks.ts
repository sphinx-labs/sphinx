import * as path from 'path'
import * as fs from 'fs'

import '@nomiclabs/hardhat-ethers'
import { ethers } from 'ethers'
import { subtask, task, types } from 'hardhat/config'
import { SolcBuild } from 'hardhat/types'
import {
  TASK_NODE,
  TASK_COMPILE,
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
  TASK_TEST,
  TASK_RUN,
} from 'hardhat/builtin-tasks/task-names'
import { create, IPFSHTTPClient } from 'ipfs-http-client'
import { add0x } from '@eth-optimism/core-utils'
import {
  computeBundleId,
  makeActionBundleFromConfig,
  ChugSplashConfig,
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  loadChugSplashConfig,
  writeSnapshotId,
  deployChugSplashPredeploys,
  registerChugSplashProject,
  chugsplashContractsAreDeployedAndInitialized,
  getChugSplashRegistry,
  parseChugSplashConfig,
} from '@chugsplash/core'
import { ChugSplashManagerABI } from '@chugsplash/contracts'
import ora from 'ora'
import { SingleBar, Presets } from 'cli-progress'
import Hash from 'ipfs-only-hash'
import * as dotenv from 'dotenv'

import {
  getDeployedBytecode,
  getImmutableVariables,
  getStorageLayout,
} from './artifacts'
import { deployContracts } from './deployments'

// Load environment variables from .env
dotenv.config()

// internal tasks
const TASK_CHUGSPLASH_LOAD = 'chugsplash-load'
const TASK_CHUGSPLASH_FETCH = 'chugsplash-fetch'
const TASK_CHUGSPLASH_BUNDLE_LOCAL = 'chugsplash-bundle-local'
const TASK_CHUGSPLASH_BUNDLE_REMOTE = 'chugsplash-bundle-remote'

// public tasks
const TASK_CHUGSPLASH_DEPLOY = 'chugsplash-deploy'
const TASK_CHUGSPLASH_REGISTER = 'chugsplash-register'
const TASK_CHUGSPLASH_LIST_ALL_PROJECTS = 'chugsplash-list-projects'
const TASK_CHUGSPLASH_CHECK_BUNDLE = 'chugsplash-check-bundle'
const TASK_CHUGSPLASH_COMMIT = 'chugsplash-commit'
const TASK_CHUGSPLASH_PROPOSE = 'chugsplash-propose'
const TASK_CHUGSPLASH_APPROVE = 'chugsplash-approve'
const TASK_CHUGSPLASH_LIST_BUNDLES = 'chugsplash-list-bundles'
const TASK_CHUGSPLASH_STATUS = 'chugsplash-status'

subtask(TASK_CHUGSPLASH_LOAD)
  .addParam('deployConfig', undefined, undefined, types.string)
  .setAction(
    async (args: { deployConfig: string }, hre): Promise<ChugSplashConfig> => {
      // Make sure we have the latest compiled code.
      await hre.run(TASK_COMPILE, {
        quiet: true,
      })
      const config = loadChugSplashConfig(args.deployConfig)
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
      const parsed = parseChugSplashConfig(config)

      const artifacts = {}
      for (const [referenceName, contractConfig] of Object.entries(
        parsed.contracts
      )) {
        const storageLayout = await getStorageLayout(contractConfig.contract)
        const deployedBytecode = await getDeployedBytecode(
          hre.ethers.provider,
          parsed,
          referenceName
        )
        const immutableVariables = await getImmutableVariables(contractConfig)
        artifacts[referenceName] = {
          deployedBytecode,
          storageLayout,
          immutableVariables,
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
      for (const contract of args.deployConfig.inputs) {
        const solcBuild: SolcBuild = await hre.run(
          TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
          {
            quiet: true,
            solcVersion: contract.solcVersion,
          }
        )

        let output: any // TODO: Compiler output
        if (solcBuild.isSolcJs) {
          output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, {
            input: contract.input,
            solcJsPath: solcBuild.compilerPath,
          })
        } else {
          output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLC, {
            input: contract.input,
            solcPath: solcBuild.compilerPath,
          })
        }

        for (const fileOutput of Object.values(output.contracts)) {
          for (const [contractName, contractOutput] of Object.entries(
            fileOutput
          )) {
            // const deployedBytecode = await getDeployedBytecode(
            //   hre.ethers.provider,
            //   contractConfig
            // )
            artifacts[contractName] = {
              // deployedBytecode,
              deployedBytecode: add0x(
                contractOutput.evm.deployedBytecode.object
              ),
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
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(
    async (args: {
      configUri: string
      ipfsUrl: string
    }): Promise<CanonicalChugSplashConfig> => {
      let config: CanonicalChugSplashConfig
      let ipfs: IPFSHTTPClient
      if (args.ipfsUrl) {
        ipfs = create({
          url: args.ipfsUrl,
        })
      } else if (
        process.env.IPFS_PROJECT_ID &&
        process.env.IPFS_API_KEY_SECRET
      ) {
        const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
        ipfs = create({
          host: 'ipfs.infura.io',
          port: 5001,
          protocol: 'https',
          headers: {
            authorization: `Basic ${Buffer.from(projectCredentials).toString(
              'base64'
            )}`,
          },
        })
      } else {
        throw new Error(
          'You must either set your IPFS credentials in an environment file or call this task with an IPFS url.'
        )
      }

      if (args.configUri.startsWith('ipfs://')) {
        const decoder = new TextDecoder()
        let data = ''
        const stream = await ipfs.cat(args.configUri.replace('ipfs://', ''))
        for await (const chunk of stream) {
          // Chunks of data are returned as a Uint8Array. Convert it back to a string
          data += decoder.decode(chunk, { stream: true })
        }
        config = JSON.parse(data)
      } else {
        throw new Error('unsupported URI type')
      }

      return config
    }
  )

task(TASK_CHUGSPLASH_DEPLOY)
  .addFlag('log', "Log all of ChugSplash's output")
  .addFlag('hide', "Hide all of ChugSplash's output")
  .setAction(
    async (
      args: {
        log: boolean
        hide: boolean
      },
      hre: any
    ) => {
      const signer = await hre.ethers.getSigner()
      if (
        (await chugsplashContractsAreDeployedAndInitialized(signer)) === false
      ) {
        await deployChugSplashPredeploys(hre, signer)
      }
      await deployContracts(hre, args.log, args.hide)
    }
  )

task(TASK_CHUGSPLASH_REGISTER)
  .setDescription('Registers a new ChugSplash project')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .addFlag('log', 'Log the output for this task')
  .setAction(
    async (
      args: {
        deployConfig: string
        log: boolean
      },
      hre
    ) => {
      const spinner = ora({ isSilent: !args.log })

      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })

      const signer = hre.ethers.provider.getSigner()

      await registerChugSplashProject(
        config.options.projectName,
        config.options.projectOwner,
        signer
      )

      spinner.succeed('Project successfully created.')
    }
  )

task(TASK_CHUGSPLASH_LIST_ALL_PROJECTS)
  .setDescription('Lists all existing ChugSplash projects')
  .setAction(async (_, hre) => {
    const spinner = ora()

    spinner.start('Getting list of all projects...')

    const ChugSplashRegistry = getChugSplashRegistry(
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
  .addFlag('log', 'Log the output for this task')
  .addFlag(
    'local',
    'Propose the bundle without committing it to IPFS. To be used for local deployments.'
  )
  .setAction(
    async (
      args: {
        deployConfig: string
        ipfsUrl: string
        local: boolean
        log: boolean
      },
      hre
    ): Promise<{
      bundle: ChugSplashActionBundle
      configUri: string
      bundleId: string
    }> => {
      const spinner = ora({ isSilent: !args.log })

      // First, commit the bundle to IPFS and get the bundle hash that it returns.
      const { bundle, configUri, bundleId } = await hre.run(
        TASK_CHUGSPLASH_COMMIT,
        {
          deployConfig: args.deployConfig,
          ipfsUrl: args.ipfsUrl,
          local: args.local,
          log: args.log,
        }
      )

      // Next, verify that the bundle has been committed to IPFS with the correct bundle hash.
      // Skip this step if the deployment is local.
      let config: ChugSplashConfig
      if (args.local === false) {
        ;({ config } = await hre.run(TASK_CHUGSPLASH_CHECK_BUNDLE, {
          configUri,
          bundleId: computeBundleId(
            bundle.root,
            bundle.actions.length,
            configUri
          ),
          ipfsUrl: args.ipfsUrl,
          spinner,
        }))
      } else {
        config = await hre.run(TASK_CHUGSPLASH_LOAD, {
          deployConfig: args.deployConfig,
        })
      }

      spinner.start('Proposing the bundle...')

      const ChugSplashRegistry = getChugSplashRegistry(
        hre.ethers.provider.getSigner()
      )

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(config.options.projectName),
        ChugSplashManagerABI,
        hre.ethers.provider.getSigner()
      )

      const bundleState: ChugSplashBundleState =
        await ChugSplashManager.bundles(bundleId)
      if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
        const tx = await ChugSplashManager.proposeChugSplashBundle(
          bundle.root,
          bundle.actions.length,
          configUri
        )
        await tx.wait()
        spinner.succeed('Bundle successfully proposed.')
      } else if (bundleState.status === ChugSplashBundleStatus.PROPOSED) {
        spinner.fail('Bundle already proposed.')
      } else if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
        spinner.fail('Bundle is currently active.')
      }
      return { bundle, configUri, bundleId }
    }
  )

task(TASK_CHUGSPLASH_APPROVE)
  .setDescription('Allows a manager to approve a bundle to be executed.')
  .addParam('projectName', 'name of the chugsplash project')
  .addParam('bundleId', 'ID of the bundle')
  .addFlag('log', 'Log the output for this task')
  .setAction(
    async (
      args: {
        projectName: string
        bundleId: string
        log: boolean
      },
      hre
    ) => {
      const spinner = ora({ isSilent: !args.log })

      const ChugSplashRegistry = getChugSplashRegistry(
        hre.ethers.provider.getSigner()
      )

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(args.projectName),
        ChugSplashManagerABI,
        hre.ethers.provider.getSigner()
      )

      // Get the bundle state of the inputted bundle ID.
      const bundleState: ChugSplashBundleState =
        await ChugSplashManager.bundles(args.bundleId)
      if (bundleState.status !== ChugSplashBundleStatus.PROPOSED) {
        spinner.fail('Bundle must first be proposed.')
        return
      }

      spinner.start('Approving the bundle...')

      const activeBundleId = await ChugSplashManager.activeBundleId()
      if (activeBundleId === ethers.constants.HashZero) {
        const tx = await ChugSplashManager.approveChugSplashBundle(
          args.bundleId
        )
        await tx.wait()
        spinner.succeed('Bundle successfully approved.')
      } else if (activeBundleId === args.bundleId) {
        spinner.fail('Bundle is already approved.')
      } else {
        spinner.fail('A different bundle is currently approved.')
      }
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
      const spinner = ora()

      spinner.start(`Getting list of all bundles...`)

      const ChugSplashRegistry = getChugSplashRegistry(
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

subtask(TASK_CHUGSPLASH_COMMIT)
  .setDescription('Commits a ChugSplash config file with artifacts to IPFS')
  .addParam('deployConfig', 'path to chugsplash deploy config')
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .addFlag(
    'local',
    'Propose the bundle without committing it to IPFS. To be used for local deployments.'
  )
  .addFlag('log', 'Log the output for this task')
  .setAction(
    async (
      args: {
        deployConfig: string
        ipfsUrl: string
        local: boolean
        log: boolean
      },
      hre
    ): Promise<{
      bundle: ChugSplashActionBundle
      configUri: string
      bundleId: string
    }> => {
      const spinner = ora({ isSilent: !args.log })

      spinner.start('Compiling deploy config...')

      const config: ChugSplashConfig = await hre.run(TASK_CHUGSPLASH_LOAD, {
        deployConfig: args.deployConfig,
      })
      spinner.succeed('Compiled deploy config')

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

      const ipfsData = JSON.stringify(
        {
          ...config,
          inputs,
        },
        null,
        2
      )

      if (args.local) {
        spinner.start('Getting bundle hash from IPFS...')
      } else {
        spinner.start('Publishing config to IPFS...')
      }

      let ipfsHash
      if (args.local) {
        ipfsHash = await Hash.of(ipfsData)
      } else if (args.ipfsUrl) {
        const ipfs = create({
          url: args.ipfsUrl,
        })
        ipfsHash = (await ipfs.add(ipfsData)).path
      } else if (
        process.env.IPFS_PROJECT_ID &&
        process.env.IPFS_API_KEY_SECRET
      ) {
        const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
        const ipfs = create({
          host: 'ipfs.infura.io',
          port: 5001,
          protocol: 'https',
          headers: {
            authorization: `Basic ${Buffer.from(projectCredentials).toString(
              'base64'
            )}`,
          },
        })
        ipfsHash = (await ipfs.add(ipfsData)).path
      } else {
        throw new Error(
          'You must either deploy locally, set your IPFS credentials in an environment file, or call this task with an IPFS url.'
        )
      }

      if (args.local) {
        spinner.succeed('Got IPFS bundle hash locally')
      } else {
        spinner.succeed('Published config to IPFS')
      }

      spinner.start('Building artifact bundle...')
      const bundle = await hre.run(TASK_CHUGSPLASH_BUNDLE_LOCAL, {
        deployConfig: args.deployConfig,
      })
      spinner.succeed('Built artifact bundle')

      const configUri = `ipfs://${ipfsHash}`
      const bundleId = computeBundleId(
        bundle.root,
        bundle.actions.length,
        configUri
      )

      spinner.succeed(`Config: ${configUri}`)
      spinner.succeed(`Bundle: ${bundleId}`)

      return { bundle, configUri, bundleId }
    }
  )

task(TASK_CHUGSPLASH_CHECK_BUNDLE)
  .setDescription('Checks if a deployment config matches a bundle hash')
  .addParam('configUri', 'location of the config file')
  .addParam('bundleId', 'hash of the bundle')
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .addFlag('log', 'Log the output for this task')
  .setAction(
    async (
      args: {
        configUri: string
        bundleId: string
        ipfsUrl: string
        log: boolean
      },
      hre
    ): Promise<{
      config: CanonicalChugSplashConfig
      bundle: ChugSplashActionBundle
    }> => {
      const spinner = ora({ isSilent: !args.log })

      spinner.start('Fetching config from IPFS...')
      const config: CanonicalChugSplashConfig = await hre.run(
        TASK_CHUGSPLASH_FETCH,
        {
          configUri: args.configUri,
          ipfsUrl: args.ipfsUrl,
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

      const bundleId = computeBundleId(
        bundle.root,
        bundle.actions.length,
        args.configUri
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

task(TASK_CHUGSPLASH_STATUS)
  .setDescription('Displays the status of a ChugSplash bundle')
  .addParam('projectName', 'name of the chugsplash project')
  .addParam('bundleId', 'hash of the bundle')
  .setAction(
    async (
      args: {
        projectName: string
        bundleId: string
      },
      hre
    ) => {
      const progressBar = new SingleBar({}, Presets.shades_classic)

      const ChugSplashRegistry = getChugSplashRegistry(hre.ethers.provider)

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(args.projectName),
        ChugSplashManagerABI,
        hre.ethers.provider
      )

      // Get the bundle state of the inputted bundle ID.
      const bundleState: ChugSplashBundleState =
        await ChugSplashManager.bundles(args.bundleId)

      // Handle cases where the bundle is completed, cancelled, or not yet approved.
      if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
        // Display a completed status bar then exit.
        progressBar.start(
          bundleState.actionsExecuted,
          bundleState.actionsExecuted
        )
        console.log('\n Bundle is already completed.')
        process.exit()
      } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
        // Set the progress bar to be the number of executions that had occurred when the bundle was
        // cancelled.
        progressBar.start(
          bundleState.executions.length,
          bundleState.actionsExecuted
        )
        console.log('\n Bundle was cancelled.')
        process.exit()
      } else if (bundleState.status !== ChugSplashBundleStatus.APPROVED) {
        console.log('Bundle has not been approved by the project owner yet.')
        process.exit()
      }

      // If we make it to this point, we know that the given bundle is active, since its status is
      // ChugSplashBundleStatus.APPROVED.

      // Define event filters
      const actionExecutedFilter = {
        address: ChugSplashManager.address,
        topics: [
          ethers.utils.id('ChugSplashActionExecuted(bytes32,address,uint256)'),
        ],
      }
      const cancellationFilter = {
        address: ChugSplashManager.address,
        topics: [
          ethers.utils.id('ChugSplashBundleCancelled(bytes32,address,uint256)'),
        ],
      }

      // Set the status bar to display the number of actions executed so far.
      progressBar.start(
        bundleState.executions.length,
        bundleState.actionsExecuted
      )

      // Declare a listener for the ChugSplashActionExecuted event on the project's
      // ChugSplashManager contract.
      hre.ethers.provider.on(actionExecutedFilter, (log) => {
        // Throw an error if the bundle ID inputted by the user is not active. This shouldn't ever
        // happen, since we already checked that this bundle ID was active earlier.
        const emittedBundleId = ChugSplashManagerABI.parseLog(log).args.bundleId
        if (emittedBundleId !== args.bundleId) {
          throw new Error(
            `Bundle ID ${args.bundleId} is inactive. Did you recently cancel this bundle?`
          )
        }

        const actionIndex = ChugSplashManagerABI.parseLog(log).args.actionIndex

        // If the bundle is complete, set the progress bar to be 100% and exit.
        if (actionIndex.eq(bundleState.executions.length)) {
          progressBar.update(actionIndex)
          process.exit()
        }
        // If the bundle is not complete, update the progress bar.
        progressBar.update(actionIndex.toNumber())
      })

      // Also declare an event listener for the ChugSplashBundleCancelled event in case the bundle
      // is cancelled.
      hre.ethers.provider.on(cancellationFilter, (log) => {
        // Throw an error if the emitted bundle ID emitted does not match the bundle ID inputted by
        // the user. This shouldn't ever happen, since we checked earlier that the inputted bundle
        // ID is the active bundle ID.
        const emittedBundleId = ChugSplashManagerABI.parseLog(log).args.bundleId
        if (emittedBundleId !== args.bundleId) {
          throw new Error(
            `Bundle ID ${emittedBundleId} was cancelled, but does not match inputted bundle ID ${args.bundleId}.
            Something went wrong.`
          )
        }

        const actionIndex = ChugSplashManagerABI.parseLog(log).args.actionIndex

        // Set the progress bar to be the number of executions that had occurred when the bundle was
        // cancelled.
        progressBar.update(actionIndex.toNumber())
        console.log('\n Bundle was cancelled :(')
        process.exit()
      })
    }
  )

// TODO: change 'any' type
task(TASK_NODE)
  .addFlag('disable', 'Disable ChugSplash from deploying on startup')
  .addFlag('log', "Log all of ChugSplash's output")
  .addFlag('hide', "Hide all of ChugSplash's output")
  .setAction(
    async (
      args: { disable: boolean; log: boolean; hide: boolean },
      hre: any,
      runSuper
    ) => {
      if (!args.disable) {
        if ((await hre.getChainId()) === '31337') {
          const deployer = await hre.ethers.getSigner()
          await deployChugSplashPredeploys(hre, deployer)

          await deployContracts(hre, args.log, args.hide)
          await writeSnapshotId(hre)
        }
      }
      await runSuper(args)
    }
  )

task(TASK_TEST)
  .addFlag('show', 'Show ChugSplash deployment information')
  .setAction(async (args: { show: boolean }, hre: any, runSuper) => {
    if ((await hre.getChainId()) === '31337') {
      try {
        const snapshotIdPath = path.join(
          path.basename(hre.config.paths.deployed),
          '31337',
          '.snapshotId'
        )
        const snapshotId = fs.readFileSync(snapshotIdPath, 'utf8')
        const snapshotReverted = await hre.network.provider.send('evm_revert', [
          snapshotId,
        ])
        if (!snapshotReverted) {
          throw new Error('Snapshot failed to be reverted.')
        }
      } catch {
        await deployChugSplashPredeploys(hre, await hre.ethers.getSigner())
        await deployContracts(hre, false, !args.show)
      } finally {
        await writeSnapshotId(hre)
      }
    }
    await runSuper(args)
  })

task(TASK_RUN).setAction(async (args, hre: any, runSuper) => {
  await hre.run(TASK_CHUGSPLASH_DEPLOY, hre)
  await runSuper(args)
})
