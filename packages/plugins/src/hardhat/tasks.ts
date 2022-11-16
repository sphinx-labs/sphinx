import * as path from 'path'
import * as fs from 'fs'

import { Contract, ethers } from 'ethers'
import { subtask, task, types } from 'hardhat/config'
import {
  TASK_NODE,
  TASK_TEST,
  TASK_RUN,
} from 'hardhat/builtin-tasks/task-names'
import { create, IPFSHTTPClient } from 'ipfs-http-client'
import { getChainId } from '@eth-optimism/core-utils'
import {
  computeBundleId,
  makeActionBundleFromConfig,
  ChugSplashConfig,
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  registerChugSplashProject,
  getChugSplashRegistry,
  parseChugSplashConfig,
  isSetImplementationAction,
  fromRawChugSplashAction,
  getProxyAddress,
  getProjectOwnerAddress,
  chugsplashLog,
  displayDeploymentTable,
  getChugSplashManagerProxyAddress,
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
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import {
  createDeploymentArtifacts,
  getArtifactsFromParsedCanonicalConfig,
  getBuildInfo,
  getContractArtifact,
  getCreationCode,
  getImmutableVariables,
  getStorageLayout,
} from './artifacts'
import {
  deployChugSplashConfig,
  deployAllChugSplashConfigs,
} from './deployments'
import { deployChugSplashPredeploys } from './predeploys'
import {
  loadParsedChugSplashConfig,
  writeHardhatSnapshotId,
  isProjectRegistered,
  cleanThenCompile,
} from './utils'
import {
  alreadyProposedMessage,
  errorProjectNotRegistered,
  successfulProposalMessage,
} from '../messages'
import { getExecutionAmountPlusBuffer } from './fund'
import { monitorRemoteExecution } from './execution'

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
export const TASK_CHUGSPLASH_EXECUTE = 'chugsplash-execute'

// public tasks
export const TASK_CHUGSPLASH_DEPLOY = 'chugsplash-deploy'
export const TASK_CHUGSPLASH_REGISTER = 'chugsplash-register'
export const TASK_CHUGSPLASH_PROPOSE = 'chugsplash-propose'
export const TASK_TEST_REMOTE_EXECUTION = 'test-remote-execution'
export const TASK_FUND = 'fund'
export const TASK_CHUGSPLASH_APPROVE = 'chugsplash-approve'
export const TASK_CHUGSPLASH_STATUS = 'chugsplash-status'

subtask(TASK_CHUGSPLASH_BUNDLE_LOCAL)
  .addOptionalParam('configPath', undefined, undefined, types.string)
  .setAction(
    async (args: { configPath: string }): Promise<ChugSplashActionBundle> => {
      const parsedConfig = loadParsedChugSplashConfig(args.configPath)

      const artifacts = {}
      for (const [referenceName, contractConfig] of Object.entries(
        parsedConfig.contracts
      )) {
        const storageLayout = await getStorageLayout(contractConfig.contract)

        const { abi, sourceName, contractName, bytecode } = getContractArtifact(
          contractConfig.contract
        )
        const { output: compilerOutput } = await getBuildInfo(
          sourceName,
          contractName
        )
        const creationCode = getCreationCode(
          bytecode,
          parsedConfig,
          referenceName,
          abi,
          compilerOutput,
          sourceName,
          contractName
        )
        const immutableVariables = getImmutableVariables(
          compilerOutput,
          sourceName,
          contractName
        )
        artifacts[referenceName] = {
          creationCode,
          storageLayout,
          immutableVariables,
        }
      }

      return makeActionBundleFromConfig(parsedConfig, artifacts, process.env)
    }
  )

subtask(TASK_CHUGSPLASH_BUNDLE_REMOTE)
  .addParam('canonicalConfig', undefined, undefined, types.any)
  .setAction(
    async (
      args: { canonicalConfig: CanonicalChugSplashConfig },
      hre
    ): Promise<ChugSplashActionBundle> => {
      const parsedCanonicalConfig = parseChugSplashConfig(
        args.canonicalConfig
      ) as CanonicalChugSplashConfig

      const artifacts = await getArtifactsFromParsedCanonicalConfig(
        hre,
        parsedCanonicalConfig
      )

      return makeActionBundleFromConfig(
        parsedCanonicalConfig,
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

export const chugsplashDeploySubtask = async (
  args: {
    configPath: string
    ipfsUrl: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const signer = hre.ethers.provider.getSigner()
  await deployChugSplashPredeploys(hre, signer)
  const remoteExecution = (await getChainId(hre.ethers.provider)) !== 31337
  await deployChugSplashConfig(
    hre,
    args.configPath,
    args.silent,
    remoteExecution,
    args.ipfsUrl
  )
}

task(TASK_CHUGSPLASH_DEPLOY)
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to deploy'
  )
  .addOptionalParam(
    'ipfsUrl',
    'Optional IPFS gateway URL for publishing ChugSplash projects to IPFS.'
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .setAction(chugsplashDeploySubtask)

task(TASK_CHUGSPLASH_REGISTER)
  .setDescription('Registers a new ChugSplash project')
  .addVariadicPositionalParam(
    'configPaths',
    'Paths to ChugSplash config files',
    []
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .setAction(
    async (
      args: {
        configPaths: string[]
        silent: boolean
      },
      hre
    ) => {
      if (args.configPaths.length === 0) {
        throw new Error('You must specify a path to a ChugSplash config file.')
      }

      const provider = hre.ethers.provider
      const signer = provider.getSigner()

      await deployChugSplashPredeploys(hre, signer)

      const spinner = ora({ isSilent: args.silent })

      for (const configPath of args.configPaths) {
        const parsedConfig = loadParsedChugSplashConfig(configPath)

        spinner.start(`Registering ${parsedConfig.options.projectName}...`)

        const isFirstTimeRegistered = await registerChugSplashProject(
          provider,
          parsedConfig.options.projectName,
          parsedConfig.options.projectOwner
        )

        isFirstTimeRegistered
          ? spinner.succeed('Project successfully registered.')
          : spinner.succeed('Project was already registered by the caller.')
      }
    }
  )

export const chugsplashProposeSubtask = async (
  args: {
    configPath: string
    ipfsUrl: string
    silent: boolean
    noCompile: boolean
    remoteExecution: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, ipfsUrl, silent, noCompile, remoteExecution } = args

  const chainId = await getChainId(hre.ethers.provider)
  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  await deployChugSplashPredeploys(hre, signer)

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  const ChugSplashRegistry = getChugSplashRegistry(signer)
  const chugsplashManagerAddress = await ChugSplashRegistry.projects(
    parsedConfig.options.projectName
  )

  if (!isProjectRegistered(chugsplashManagerAddress)) {
    errorProjectNotRegistered(
      await getChainId(hre.ethers.provider),
      hre.network.name,
      configPath
    )
  }

  const ChugSplashManager = new ethers.Contract(
    chugsplashManagerAddress,
    ChugSplashManagerABI,
    signer
  )

  // Get the bundle info by calling the commit subtask locally (i.e. without publishing the
  // bundle to IPFS). This allows us to ensure that the bundle state is empty before we submit
  // it to IPFS.
  const { bundle, configUri, bundleId } = await chugsplashCommitSubtask(
    {
      configPath,
      ipfsUrl,
      commitToIpfs: false,
      compile: !noCompile,
    },
    hre
  )

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  const spinner = ora({ isSilent: silent })
  spinner.start(`Proposing the project on ${hre.network.name}...`)
  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.succeed(
      `Project was already proposed and is currently being executed on ${hre.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.succeed(`Project was already completed on ${hre.network.name}.`)
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${hre.network.name}. Please propose a new project with a name other than ${parsedConfig.options.projectName}`
    )
  } else {
    // Bundle is either in the `EMPTY` or `PROPOSED` state.

    // Get the amount that the user must send in order to execute the bundle including a buffer in
    // case the gas price increases during execution.
    const executionAmountPlusBuffer = await getExecutionAmountPlusBuffer(
      hre,
      parsedConfig
    )

    if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
      if (remoteExecution || chainId !== 31337) {
        // Commit the bundle to IPFS if the network is live (i.e. not the local Hardhat network) or
        // if we explicitly specify remote execution.
        await chugsplashCommitSubtask(
          {
            configPath,
            ipfsUrl,
            commitToIpfs: true,
            compile: false,
          },
          hre
        )

        // Verify that the bundle has been committed to IPFS with the correct bundle hash.
        await hre.run(TASK_CHUGSPLASH_VERIFY_BUNDLE, {
          configUri,
          bundleId: computeBundleId(
            bundle.root,
            bundle.actions.length,
            configUri
          ),
          ipfsUrl,
        })
      }

      // Propose the bundle.
      await (
        await ChugSplashManager.proposeChugSplashBundle(
          bundle.root,
          bundle.actions.length,
          configUri
        )
      ).wait()
      spinner.succeed(
        successfulProposalMessage(
          executionAmountPlusBuffer,
          configPath,
          hre.network.name
        )
      )
    } else {
      // Bundle was already in the `PROPOSED` state before the call to this task.
      spinner.succeed(
        alreadyProposedMessage(
          executionAmountPlusBuffer,
          configPath,
          hre.network.name
        )
      )
    }
  }
}

task(TASK_CHUGSPLASH_PROPOSE)
  .setDescription('Proposes a new ChugSplash project')
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to propose'
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addOptionalParam(
    'ipfsUrl',
    'Optional IPFS gateway URL for publishing ChugSplash projects to IPFS.'
  )
  .setAction(chugsplashProposeSubtask)

subtask(TASK_CHUGSPLASH_EXECUTE)
  .setDescription('Executes an approved bundle.')
  .addParam(
    'chugSplashManager',
    'ChugSplashManager Contract',
    undefined,
    types.any
  )
  .addParam(
    'bundleState',
    'State of the bundle to be executed',
    undefined,
    types.any
  )
  .addParam('bundle', 'The bundle to be executed', undefined, types.any)
  .addParam(
    'parsedConfig',
    'Parsed ChugSplash configuration',
    undefined,
    types.any
  )
  .addParam('deployer', 'Deploying signer', undefined, types.any)
  .addFlag('silent', "Hide ChugSplash's output")
  .setAction(
    async (
      args: {
        chugSplashManager: Contract
        bundleState: ChugSplashBundleState
        bundle: any // todo - figure out a type for this
        parsedConfig: ChugSplashConfig
        deployer: any // todo - figure out a type for this
        silent: boolean
      },
      hre: any
    ) => {
      const {
        chugSplashManager,
        bundleState,
        bundle,
        parsedConfig,
        deployer,
        silent,
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

      // execute actions in series
      for (
        let i = bundleState.actionsExecuted.toNumber();
        i < firstSetImplementationActionIndex;
        i++
      ) {
        const action = bundle.actions[i]
        await (
          await chugSplashManager.executeChugSplashAction(
            action.action,
            action.proof.actionIndex,
            action.proof.siblings
          )
        ).wait()
      }

      // If the bundle hasn't already been completed in an earlier call, complete the bundle by
      // executing all the SetImplementation actions in a single transaction.
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
        await finalDeploymentTxn.wait()
      }

      // Withdraw all available funds from the chugSplashManager.
      const totalDebt = await chugSplashManager.totalDebt()
      const chugsplashManagerBalance = await hre.ethers.provider.getBalance(
        chugSplashManager.address
      )
      if (chugsplashManagerBalance.sub(totalDebt).gt(0)) {
        await (await chugSplashManager.withdrawOwnerETH()).wait()
      }
      const deployerDebt = await chugSplashManager.debt(
        await deployer.getAddress()
      )
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

      displayDeploymentTable(parsedConfig, silent)
      chugsplashLog(`Deployed: ${parsedConfig.options.projectName}`, silent)
    }
  )

export const chugsplashApproveSubtask = async (
  args: {
    configPath: string
    silent: boolean
    remoteExecution: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, silent, remoteExecution } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  const ChugSplashRegistry = getChugSplashRegistry(signer)

  const chugsplashManagerAddress = await ChugSplashRegistry.projects(
    parsedConfig.options.projectName
  )

  if (!isProjectRegistered(chugsplashManagerAddress)) {
    errorProjectNotRegistered(
      await getChainId(provider),
      hre.network.name,
      configPath
    )
  }

  const projectOwnerAddress = await getProjectOwnerAddress(
    provider,
    parsedConfig.options.projectName
  )
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project already registered by: ${projectOwnerAddress}.`)
  }

  const ChugSplashManager = new ethers.Contract(
    chugsplashManagerAddress,
    ChugSplashManagerABI,
    signer
  )

  // Call the commit subtask locally to get the bundle ID without publishing
  // anything to IPFS.
  const { bundleId } = await chugsplashCommitSubtask(
    {
      configPath,
      ipfsUrl: '',
      commitToIpfs: false,
      compile: false,
    },
    hre
  )
  const spinner = ora({ isSilent: silent })
  spinner.start('Approving the bundle...')
  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )
  const activeBundleId = await ChugSplashManager.activeBundleId()
  if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
    throw new Error(`You must first propose the project before it can be approved. To propose the project, run the command:

  npx hardhat chugsplash-propose --network ${hre.network.name} ${configPath}`)
  } else if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.succeed(`Project has already been approved. It should be executed shortly. Run the following command to monitor its status:

  npx hardhat chugsplash-status --network ${hre.network.name} ${configPath}`)
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.succeed(`Project was already completed on ${hre.network.name}.`)
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${hre.network.name}. Please propose a new project with a name other than ${parsedConfig.options.projectName}`
    )
  } else if (activeBundleId !== ethers.constants.HashZero) {
    throw new Error(
      `Another project is currently being executed. Please wait a couple minutes then try again.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.PROPOSED) {
    await (await ChugSplashManager.approveChugSplashBundle(bundleId)).wait()
    spinner.succeed(`Project approved on ${hre.network.name}.`)

    if (remoteExecution) {
      spinner.start(`Monitoring deployment...`)
      const finalDeploymentTxnHash = await monitorRemoteExecution(
        hre,
        parsedConfig,
        bundleId,
        silent
      )
      await createDeploymentArtifacts(hre, parsedConfig, finalDeploymentTxnHash)
      displayDeploymentTable(parsedConfig, silent)
      spinner.start(
        `Project ${parsedConfig.options.projectName} successfully executed.`
      )
    }
  }
}

task(TASK_CHUGSPLASH_APPROVE)
  .setDescription('Allows a manager to approve a bundle to be executed.')
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to approve'
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .setAction(chugsplashApproveSubtask)

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
    configPath: string
    ipfsUrl: string
    commitToIpfs: boolean
    compile: boolean
  },
  hre
): Promise<{
  bundle: ChugSplashActionBundle
  configUri: string
  bundleId: string
}> => {
  const { configPath, ipfsUrl, commitToIpfs, compile } = args

  if (compile) {
    await cleanThenCompile(hre)
  }

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  let configSourceNames = Object.values(parsedConfig.contracts)
    .map((contractConfig) => contractConfig.contract)
    .map((name) => getContractArtifact(name).sourceName)
  // Get unique source names for the contracts in the ChugSplash config
  configSourceNames = Array.from(new Set(configSourceNames))

  // We'll need this later
  const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')

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
      ...parsedConfig,
      inputs,
    },
    null,
    2
  )

  let ipfsHash
  if (!commitToIpfs) {
    // Get the IPFS hash without publishing anything on IPFS.
    ipfsHash = await Hash.of(ipfsData)
  } else if (ipfsUrl) {
    const ipfs = create({
      url: ipfsUrl,
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else if (process.env.IPFS_PROJECT_ID && process.env.IPFS_API_KEY_SECRET) {
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
      `To deploy on ${hre.network.name}, you must first setup an IPFS project with Infura: https://app.infura.io/. Once you've done this, copy and paste the following variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const bundle = await hre.run(TASK_CHUGSPLASH_BUNDLE_LOCAL, {
    configPath,
  })

  const configUri = `ipfs://${ipfsHash}`
  const bundleId = computeBundleId(
    bundle.root,
    bundle.actions.length,
    configUri
  )

  return { bundle, configUri, bundleId }
}

subtask(TASK_CHUGSPLASH_COMMIT)
  .setDescription('Commits a ChugSplash config file with artifacts to IPFS')
  .addParam('configPath', 'path to chugsplash deploy config')
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
  .setAction(
    async (
      args: {
        configUri: string
        bundleId: string
        ipfsUrl: string
        silent: boolean
      },
      hre
    ): Promise<{
      config: CanonicalChugSplashConfig
      bundle: ChugSplashActionBundle
    }> => {
      const config: CanonicalChugSplashConfig = await hre.run(
        TASK_CHUGSPLASH_FETCH,
        {
          configUri: args.configUri,
          ipfsUrl: args.ipfsUrl,
        }
      )

      const bundle: ChugSplashActionBundle = await hre.run(
        TASK_CHUGSPLASH_BUNDLE_REMOTE,
        {
          canonicalConfig: config,
        }
      )

      const bundleId = computeBundleId(
        bundle.root,
        bundle.actions.length,
        args.configUri
      )

      if (bundleId !== args.bundleId) {
        throw new Error(
          'Bundle ID generated from downloaded config does NOT match given hash. Please report this error.'
        )
      }

      return {
        config,
        bundle,
      }
    }
  )

task(TASK_CHUGSPLASH_STATUS)
  .setDescription('Displays the status of a ChugSplash bundle')
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to monitor'
  )
  .setAction(
    async (
      args: {
        configPath: string
      },
      hre
    ) => {
      const { configPath } = args

      const progressBar = new SingleBar({}, Presets.shades_classic)

      const parsedConfig = loadParsedChugSplashConfig(configPath)

      // Get the bundle info by calling the commit subtask locally (i.e. without publishing the
      // bundle to IPFS).
      const { bundleId } = await chugsplashCommitSubtask(
        {
          configPath,
          ipfsUrl: '',
          commitToIpfs: false,
          compile: false,
        },
        hre
      )

      const ChugSplashRegistry = getChugSplashRegistry(
        hre.ethers.provider.getSigner()
      )

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(parsedConfig.options.projectName),
        ChugSplashManagerABI,
        hre.ethers.provider
      )

      // Get the bundle state of the inputted bundle ID.
      const bundleState: ChugSplashBundleState =
        await ChugSplashManager.bundles(bundleId)

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
        const emittedBundleId = ChugSplashManagerABI.parseLog(log).bundleId
        if (emittedBundleId !== bundleId) {
          throw new Error(
            `Bundle ID ${bundleId} is inactive. Did you recently cancel this bundle?`
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
        const emittedBundleId = ChugSplashManagerABI.parseLog(log).bundleId
        if (emittedBundleId !== bundleId) {
          throw new Error(
            `Bundle ID ${emittedBundleId} was cancelled, but does not match inputted bundle ID ${bundleId}.
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

task(TASK_FUND)
  .setDescription('Fund a ChugSplash deployment')
  .addParam('amount', 'Amount to send in wei')
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addPositionalParam('configPath', 'Path to the ChugSplash config file')
  .setAction(
    async (
      args: {
        amount: number
        silent: boolean
        configPath: string
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      const { amount, silent, configPath } = args

      const spinner = ora({ isSilent: silent })

      const signer = hre.ethers.provider.getSigner()
      const parsedConfig = loadParsedChugSplashConfig(configPath)
      const projectName = parsedConfig.options.projectName
      const chugsplashManagerAddress =
        getChugSplashManagerProxyAddress(projectName)
      const signerBalance = await signer.getBalance()

      if (signerBalance.lt(amount)) {
        throw new Error(`Signer's balance is less than the specified amount.

  Signer's balance: ${ethers.utils.formatEther(signerBalance)} ETH
  Amount: ${ethers.utils.formatEther(amount)} ETH`)
      }

      spinner.start(
        `Depositing ${ethers.utils.formatEther(
          amount
        )} ETH for the project: ${projectName}...`
      )
      await (
        await signer.sendTransaction({
          value: amount,
          to: chugsplashManagerAddress,
        })
      ).wait()
      spinner.succeed(
        `Deposited ${ethers.utils.formatEther(
          amount
        )} ETH for the project: ${projectName}.`
      )
    }
  )

task(TASK_TEST_REMOTE_EXECUTION)
  .setDescription(
    'Test remote execution for deployments on the Hardhat network. For testing purposes only.'
  )
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to deploy'
  )
  .setAction(
    async (
      args: {
        configPath: string
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (hre.network.name !== 'localhost') {
        throw new Error(
          `You can only test remote execution on localhost. Got network: ${hre.network.name}`
        )
      }

      const signer = hre.ethers.provider.getSigner()
      await deployChugSplashPredeploys(hre, signer)
      await deployChugSplashConfig(hre, args.configPath, false, true, '')
    }
  )

// TODO: change 'any' type
task(TASK_NODE)
  .addFlag(
    'setupInternals',
    'Setup the internal ChugSplash contracts. Skip executing all contracts defined in ChugSplash config files.'
  )
  .addFlag(
    'disableChugsplash',
    "Completely disable all of ChugSplash's activity."
  )
  .addFlag('hide', "Hide all of ChugSplash's output")
  .setAction(
    async (
      args: {
        setupInternals: boolean
        disableChugsplash: boolean
        hide: boolean
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      if (!args.disableChugsplash) {
        const deployer = hre.ethers.provider.getSigner()
        await deployChugSplashPredeploys(hre, deployer)
        if (!args.setupInternals) {
          await deployAllChugSplashConfigs(hre, args.hide, '')
        }
        await writeHardhatSnapshotId(hre)
      }
      await runSuper(args)
    }
  )

task(TASK_TEST)
  .addFlag('show', 'Show ChugSplash deployment information')
  .setAction(async (args: { show: boolean }, hre: any, runSuper) => {
    const chainId = await getChainId(hre.ethers.provider)
    if (chainId === 31337) {
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
        await deployChugSplashPredeploys(hre, hre.ethers.provider.getSigner())
        await deployAllChugSplashConfigs(hre, !args.show, '')
      } finally {
        await writeHardhatSnapshotId(hre)
      }
    }
    await runSuper(args)
  })

task(TASK_RUN)
  .addFlag(
    'disableChugsplash',
    "Completely disable all of ChugSplash's activity."
  )
  .setAction(
    async (
      args: {
        disableChugsplash: boolean
      },
      hre: any,
      runSuper
    ) => {
      if (!args.disableChugsplash) {
        const signer = hre.ethers.provider.getSigner()
        await deployChugSplashPredeploys(hre, signer)
        await deployAllChugSplashConfigs(hre, true, '')
      }
      await runSuper(args)
    }
  )
