import * as path from 'path'
import * as fs from 'fs'

import { Contract, ethers } from 'ethers'
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
import { create } from 'ipfs-http-client'
import { add0x, getChainId } from '@eth-optimism/core-utils'
import {
  computeBundleId,
  makeActionBundleFromConfig,
  ChugSplashConfig,
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  loadChugSplashConfig,
  registerChugSplashProject,
  getChugSplashRegistry,
  parseChugSplashConfig,
  isSetImplementationAction,
  fromRawChugSplashAction,
  getProxyAddress,
  createDeploymentFolderForNetwork,
  writeDeploymentArtifact,
  log as ChugSplashLog,
} from '@chugsplash/core'
import {
  ChugSplashManagerABI,
  EXECUTOR_BOND_AMOUNT,
  ProxyABI,
} from '@chugsplash/contracts'
import ora from 'ora'
import { SingleBar, Presets } from 'cli-progress'
import Hash from 'ipfs-only-hash'
import * as dotenv from 'dotenv'

import {
  getBuildInfo,
  getConstructorArgs,
  getContractArtifact,
  getCreationCode,
  getImmutableVariables,
  getStorageLayout,
} from './artifacts'
import { deployContracts } from './deployments'
import { deployLocalChugSplash } from './predeploys'
import { writeHardhatSnapshotId } from './utils'

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
const TASK_CHUGSPLASH_EXECUTE = 'chugsplash-execute'
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
        const creationCode = await getCreationCode(parsed, referenceName)
        const immutableVariables = await getImmutableVariables(contractConfig)
        artifacts[referenceName] = {
          creationCode,
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
            // const deployedBytecode = await generateRuntimeBytecode(
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

// subtask(TASK_CHUG`SPLASH_FETCH)
//   .addParam('configUri', undefined, undefined, types.string)
//   .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
//   .setAction(
//     async (args: {
//       configUri: string
//       ipfsUrl: string
//     }): Promise<CanonicalChugSplashConfig> => {
//       let config: CanonicalChugSplashConfig
//       let ipfs: IPFSHTTPClient
//       if (args.ipfsUrl) {
//         ipfs = create({
//           url: args.ipfsUrl,
//         })
//       } else if (
//         process.env.IPFS_PROJECT_ID &&
//         process.env.IPFS_API_KEY_SECRET
//       ) {
//         const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
//         ipfs = create({
//           host: 'ipfs.infura.io',
//           port: 5001,
//           protocol: 'https',
//           headers: {
//             authorization: `Basic ${Buffer.from(projectCredentials).toString(
//               'base64'
//             )}`,
//           },
//         })
//       } else {
//         throw new Error(
//           'You must either set your IPFS credentials in an environment file or call this task with an IPFS url.'
//         )
//       }

//       if (args.configUri.startsWith('ipfs://')) {
//         const decoder = new TextDecoder()
//         let data = ''
//         const stream = await ipfs.cat(args.configUri.replace('ipfs://', ''))
//         for await (const chunk of stream) {
//           // Chunks of data are returned as a Uint8Array. Convert it back to a string
//           data += decoder.decode(chunk, { stream: true })
//         }
//         config = JSON.parse(data)
//       } else {
//         throw new Error('unsupported URI type')
//       }

//       return config
//     }
//   )`

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
      await deployLocalChugSplash(hre, signer)
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

task(TASK_CHUGSPLASH_EXECUTE)
  .setDescription('Executes an approved bundle.')
  .addParam('chugSplashManager', 'ChugSplashManager Contract')
  .addParam('bundleState', 'State of the bundle to be executed')
  .addParam('bundle', 'The bundle to be executed')
  .addParam('deployerAddress', 'Address of the user deploying the bundle')
  .addParam('parsedConfig', 'Parsed ChugSplash configuration')
  .addParam('deployer', 'Deploying signer')
  .addFlag('hide', 'Whether to hide logging or not')
  .setAction(
    async (
      args: {
        chugSplashManager: Contract
        bundleState: ChugSplashBundleState
        bundle: any // todo - figure out a type for this
        deployerAddress: any // todo - figure out a type for this
        parsedConfig: ChugSplashConfig
        deployer: any // todo - figure out a type for this
        hide: boolean
      },
      hre: any
    ) => {
      const {
        chugSplashManager,
        bundleState,
        bundle,
        deployerAddress,
        parsedConfig,
        deployer,
        hide,
      } = args

      if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
        const tx = await chugSplashManager.claimBundle({
          value: EXECUTOR_BOND_AMOUNT,
        })
        await tx.wait()
      }

      // Execute the SetCode and DeployImplementation actions that have not been executed yet. Note that
      // the SetImplementation actions have already been sorted so that they are at the end of the
      // actions array.
      const firstSetImplementationActionIndex = bundle.actions.findIndex(
        (action) =>
          isSetImplementationAction(fromRawChugSplashAction(action.action))
      )
      for (
        let i = bundleState.actionsExecuted;
        i < firstSetImplementationActionIndex;
        i++
      ) {
        const action = bundle.actions[i]
        const tx = await chugSplashManager.executeChugSplashAction(
          action.action,
          action.proof.actionIndex,
          action.proof.siblings
        )
        await tx.wait()
      }

      // If the bundle hasn't already been completed in an earlier call, complete the bundle by
      // executing all the SetImplementation actions in a single transaction.
      let finalDeploymentTxnHash: string
      let finalDeploymentReceipt: any
      if (bundleState.status !== ChugSplashBundleStatus.COMPLETED) {
        const setImplActions = bundle.actions.slice(
          firstSetImplementationActionIndex
        )
        const finalDeploymentTxn =
          await chugSplashManager.completeChugSplashBundle(
            setImplActions.map((action) => action.action),
            setImplActions.map((action) => action.proof.actionIndex),
            setImplActions.map((action) => action.proof.siblings)
          )
        finalDeploymentReceipt = await finalDeploymentTxn.wait()
        finalDeploymentTxnHash = finalDeploymentTxn.hash
      }

      // Withdraw all available funds from the chugSplashManager.
      const totalDebt = await chugSplashManager.totalDebt()
      const chugsplashManagerBalance = await hre.ethers.provider.getBalance(
        chugSplashManager.address
      )
      if (chugsplashManagerBalance.sub(totalDebt).gt(0)) {
        await (await chugSplashManager.withdrawOwnerETH()).wait()
      }
      const deployerDebt = await chugSplashManager.debt(deployerAddress)
      if (deployerDebt.gt(0)) {
        await (await chugSplashManager.claimExecutorPayment()).wait()
      }

      // Transfer ownership of the deployments to the project owner.
      for (const referenceName of Object.keys(parsedConfig.contracts)) {
        // First, check if the Proxy's owner is the chugSplashManager by getting the latest
        // `AdminChanged` event on the Proxy.
        const Proxy = new ethers.Contract(
          getProxyAddress(parsedConfig.options.projectName, referenceName),
          new ethers.utils.Interface(ProxyABI),
          deployer
        )
        const { args: eventArgs } = (
          await Proxy.queryFilter('AdminChanged')
        ).at(-1)
        if (eventArgs.newAdmin === chugSplashManager.address) {
          await (
            await chugSplashManager.transferProxyOwnership(
              referenceName,
              parsedConfig.options.projectOwner
            )
          ).wait()
        }
      }

      if (
        parsedConfig.options.projectOwner !== (await chugSplashManager.owner())
      ) {
        if (
          parsedConfig.options.projectOwner === ethers.constants.AddressZero
        ) {
          await (await chugSplashManager.renounceOwnership()).wait()
        } else {
          await (
            await chugSplashManager.transferOwnership(
              parsedConfig.options.projectOwner
            )
          ).wait()
        }
      }

      if ((await getChainId(hre.ethers.provider)) !== 31337) {
        createDeploymentFolderForNetwork(
          hre.network.name,
          hre.config.paths.deployed
        )

        for (const [referenceName, contractConfig] of Object.entries(
          parsedConfig.contracts
        )) {
          const artifact = getContractArtifact(contractConfig.contract)
          const { sourceName, contractName, bytecode, abi } = artifact

          const buildInfo = await getBuildInfo(sourceName, contractName)
          const output = buildInfo.output.contracts[sourceName][contractName]
          const immutableReferences: {
            [astId: number]: {
              length: number
              start: number
            }[]
          } = output.evm.deployedBytecode.immutableReferences

          const metadata =
            buildInfo.output.contracts[sourceName][contractName].metadata
          const { devdoc, userdoc } = JSON.parse(metadata).output
          const { constructorArgValues } = await getConstructorArgs(
            parsedConfig,
            referenceName,
            abi,
            buildInfo.output.sources,
            immutableReferences
          )
          const deploymentArtifact = {
            contractName,
            address: contractConfig.address,
            abi,
            transactionHash: finalDeploymentTxnHash,
            solcInputHash: buildInfo.id,
            receipt: finalDeploymentReceipt,
            numDeployments: 1,
            metadata,
            args: constructorArgValues,
            bytecode,
            deployedBytecode: await hre.ethers.provider.getCode(
              contractConfig.address
            ),
            devdoc,
            userdoc,
            storageLayout: await getStorageLayout(contractConfig.contract),
          }

          writeDeploymentArtifact(
            hre.network.name,
            hre.config.paths.deployed,
            deploymentArtifact,
            referenceName
          )
        }
      }

      if (!hide) {
        const deployments = {}
        Object.entries(parsedConfig.contracts).forEach(
          ([referenceName, contractConfig], i) =>
            (deployments[i + 1] = {
              Reference: referenceName,
              Contract: contractConfig.contract,
              Address: contractConfig.address,
            })
        )
        console.table(deployments)
      }

      ChugSplashLog(`Deployed: ${parsedConfig.options.projectName}`, hide)
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

      let configSourceNames = Object.values(config.contracts)
        .map((contractConfig) => contractConfig.contract)
        .map((name) => getContractArtifact(name).sourceName)
      // Get unique source names for the contracts in the ChugSplash config
      configSourceNames = Array.from(new Set(configSourceNames))

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
        .filter((buildInfo) => {
          // Get an array of the source names for the current build info file
          const inputSourceNames = Object.keys(buildInfo.input.sources)
          // Get the intersection of source names between the current build info file
          // and the ChugSplash config file
          const intersection = configSourceNames.filter((name) =>
            inputSourceNames.includes(name)
          )
          // Keep this build info file if the arrays share at least one source name in common
          return intersection.length > 0
        })
        .map((compilerInput) => {
          return {
            solcVersion: compilerInput.solcVersion,
            solcLongVersion: compilerInput.solcLongVersion,
            input: compilerInput.input,
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
        if ((await getChainId(hre.ethers.provider)) === 31337) {
          const deployer = await hre.ethers.getSigner()
          await deployLocalChugSplash(hre, deployer)
          await deployContracts(hre, args.log, args.hide)
          await writeHardhatSnapshotId(hre)
        }
      }
      await runSuper(args)
    }
  )

task(TASK_TEST)
  .addFlag('show', 'Show ChugSplash deployment information')
  .setAction(async (args: { show: boolean }, hre: any, runSuper) => {
    if ((await getChainId(hre.ethers.provider)) === 31337) {
      try {
        const snapshotIdPath = path.join(
          path.basename(hre.config.paths.deployed),
          hre.network.name === 'localhost' ? 'localhost' : 'hardhat',
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
        await deployLocalChugSplash(hre, await hre.ethers.getSigner())
        await deployContracts(hre, false, !args.show)
      } finally {
        await writeHardhatSnapshotId(hre)
      }
    }
    await runSuper(args)
  })

task(TASK_RUN).setAction(async (args, hre: any, runSuper) => {
  await hre.run(TASK_CHUGSPLASH_DEPLOY, hre)
  await runSuper(args)
})
