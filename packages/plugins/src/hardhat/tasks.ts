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
  chugsplashLog,
  displayDeploymentTable,
  getChugSplashManagerProxyAddress,
  getChugSplashManager,
  getProjectOwnerAddress,
  isDeployImplementationAction,
} from '@chugsplash/core'
import {
  ChugSplashManagerABI,
  EXECUTOR_BOND_AMOUNT,
} from '@chugsplash/contracts'
import ora from 'ora'
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
  proposeChugSplashBundle,
  getFinalDeploymentTxnHash,
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
import {
  getExecutionAmountPlusBuffer,
  getOwnerBalanceInChugSplashManager,
} from './fund'
import { monitorRemoteExecution, postExecutionActions } from './execution'

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
export const TASK_CHUGSPLASH_FUND = 'chugsplash-fund'
export const TASK_CHUGSPLASH_APPROVE = 'chugsplash-approve'
export const TASK_CHUGSPLASH_MONITOR = 'chugsplash-monitor'
export const TASK_CHUGSPLASH_CANCEL = 'chugsplash-cancel'
export const TASK_CHUGSPLASH_WITHDRAW = 'chugsplash-withdraw'
export const TASK_CHUGSPLASH_LIST_PROJECTS = 'chugsplash-list-projects'

export const bundleLocalSubtask = async (args: {
  parsedConfig: ChugSplashConfig
}): Promise<ChugSplashActionBundle> => {
  const { parsedConfig } = args
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

subtask(TASK_CHUGSPLASH_BUNDLE_LOCAL)
  .addParam('parsedConfig', undefined, undefined)
  .setAction(bundleLocalSubtask)

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

export const chugsplashDeployTask = async (
  args: {
    configPath: string
    ipfsUrl: string
    silent: boolean
    noCompile: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, ipfsUrl, silent, noCompile } = args

  const spinner = ora({ isSilent: silent })
  spinner.start('Booting up ChugSplash...')

  const remoteExecution = (await getChainId(hre.ethers.provider)) !== 31337
  await deployChugSplashPredeploys(hre, hre.ethers.provider.getSigner())

  spinner.succeed('ChugSplash is ready to go.')

  await deployChugSplashConfig(
    hre,
    configPath,
    silent,
    remoteExecution,
    ipfsUrl,
    noCompile,
    spinner
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
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(chugsplashDeployTask)

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
          ? spinner.succeed(
              `Project successfully registered on ${hre.network.name}. Owner: ${parsedConfig.options.projectOwner}`
            )
          : spinner.fail(
              `Project was already registered by the caller on ${hre.network.name}.`
            )
      }
    }
  )

export const chugsplashProposeTask = async (
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

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const spinner = ora({ isSilent: silent })

  spinner.start('Booting up ChugSplash...')

  await deployChugSplashPredeploys(hre, signer)

  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const projectName = parsedConfig.options.projectName

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(
      await getChainId(hre.ethers.provider),
      hre.network.name,
      configPath
    )
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  spinner.succeed('ChugSplash is ready to go.')

  // The spinner interferes with Hardhat's compilation logs, so we only display this message if
  // compilation is being skipped.
  if (noCompile) {
    spinner.start(`Committing ${projectName}... on ${hre.network.name}.`)
  }

  // Get the bundle info by calling the commit subtask locally (i.e. without publishing the
  // bundle to IPFS). This allows us to ensure that the bundle state is empty before we submit
  // it to IPFS.
  const { bundle, configUri, bundleId } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl,
      commitToIpfs: false,
      noCompile,
    },
    hre
  )

  if (noCompile) {
    spinner.succeed(`Committed ${projectName} on ${hre.network.name}.`)
  }

  spinner.start('Proposing the project...')

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.fail(
      `Project was already proposed and is currently being executed on ${hre.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.fail(`Project was already completed on ${hre.network.name}.`)
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${hre.network.name}. Please propose a new project
with a name other than ${parsedConfig.options.projectName}`
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
      await proposeChugSplashBundle(
        hre,
        parsedConfig,
        bundle,
        configUri,
        remoteExecution,
        ipfsUrl
      )
      spinner.succeed(
        successfulProposalMessage(
          executionAmountPlusBuffer,
          configPath,
          hre.network.name
        )
      )
    } else {
      // Bundle was already in the `PROPOSED` state before the call to this task.
      spinner.fail(
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
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(chugsplashProposeTask)

export const executeTask = async (
  args: {
    chugSplashManager: Contract
    bundleId: string
    bundle: ChugSplashActionBundle
    parsedConfig: ChugSplashConfig
    executor: ethers.Signer
    silent: boolean
    isLocalExecution: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const {
    chugSplashManager,
    bundleId,
    bundle,
    parsedConfig,
    executor,
    silent,
    isLocalExecution,
  } = args

  const bundleState: ChugSplashBundleState = await chugSplashManager.bundles(
    bundleId
  )
  const executorAddress = await executor.getAddress()

  if (
    bundleState.status !== ChugSplashBundleStatus.APPROVED &&
    bundleState.status !== ChugSplashBundleStatus.COMPLETED
  ) {
    throw new Error(`Bundle is not approved or completed.`)
  }

  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
      await (
        await chugSplashManager.claimBundle({
          value: EXECUTOR_BOND_AMOUNT,
        })
      ).wait()
    } else if (bundleState.selectedExecutor !== executorAddress) {
      throw new Error(`Another executor has already claimed the bundle.`)
    }

    // Execute actions that have not been executed yet.
    let currActionsExecuted = bundleState.actionsExecuted.toNumber()

    // The actions have already been sorted in the order: SetStorage,
    // DeployImplementation, SetImplementation. Here, we get the indexes
    // of the first DeployImplementation and SetImplementation action.
    const firstDeployImplIndex = bundle.actions.findIndex((action) =>
      isDeployImplementationAction(fromRawChugSplashAction(action.action))
    )
    const firstSetImplIndex = bundle.actions.findIndex((action) =>
      isSetImplementationAction(fromRawChugSplashAction(action.action))
    )

    // We execute the SetStorage actions in batches, which have a size based on the maximum
    // block gas limit. This speeds up execution considerably. To get the batch size, we divide
    // the block gas limit by 150,000, which is the approximate gas cost of a single SetStorage
    // action. We then divide this quantity by 2 to ensure that we're not approaching the block
    // gas limit. For example, a network with a 30 million block gas limit would result in a
    // batch size of (30 million / 150,000) / 2 = 100 SetStorage actions.
    const { gasLimit: blockGasLimit } = await hre.ethers.provider.getBlock(
      'latest'
    )
    const batchSize = blockGasLimit.div(150_000).div(2).toNumber()

    // Execute SetStorage actions in batches.
    const setStorageActions = bundle.actions.slice(0, firstDeployImplIndex)
    for (
      let i = currActionsExecuted;
      i < firstDeployImplIndex;
      i += batchSize
    ) {
      const setStorageBatch = setStorageActions.slice(i, i + batchSize)
      await (
        await chugSplashManager.executeMultipleActions(
          setStorageBatch.map((action) => action.action),
          setStorageBatch.map((action) => action.proof.actionIndex),
          setStorageBatch.map((action) => action.proof.siblings)
        )
      ).wait()
      currActionsExecuted += setStorageBatch.length
    }

    // Execute DeployImplementation actions in series. We execute them one by one since each one
    // costs significantly more gas than a setStorage action (usually in the millions).
    for (let i = currActionsExecuted; i < firstSetImplIndex; i++) {
      const action = bundle.actions[i]
      await (
        await chugSplashManager.executeChugSplashAction(
          action.action,
          action.proof.actionIndex,
          action.proof.siblings
        )
      ).wait()
      currActionsExecuted += 1
    }

    if (currActionsExecuted === firstSetImplIndex) {
      // Complete the bundle by executing all the SetImplementation actions in a single
      // transaction.
      const setImplActions = bundle.actions.slice(firstSetImplIndex)
      await (
        await chugSplashManager.completeChugSplashBundle(
          setImplActions.map((action) => action.action),
          setImplActions.map((action) => action.proof.actionIndex),
          setImplActions.map((action) => action.proof.siblings)
        )
      ).wait()
    }
  }

  // At this point, the bundle has been completed.

  const finalDeploymentTxnHash = await getFinalDeploymentTxnHash(
    chugSplashManager,
    bundleId
  )

  // Withdraw any debt owed to the executor.
  const executorDebt = await chugSplashManager.debt(executorAddress)
  if (executorDebt.gt(0)) {
    await (await chugSplashManager.claimExecutorPayment()).wait()
  }

  if (isLocalExecution) {
    await postExecutionActions(hre.ethers.provider, parsedConfig)
    await createDeploymentArtifacts(hre, parsedConfig, finalDeploymentTxnHash)
  }

  displayDeploymentTable(parsedConfig, silent)
  bundleState.status === ChugSplashBundleStatus.APPROVED
    ? chugsplashLog(
        `Deployed: ${parsedConfig.options.projectName} on ${hre.network.name}.`,
        silent
      )
    : chugsplashLog(
        `${parsedConfig.options.projectName} was already deployed on ${hre.network.name}.`,
        silent
      )
}

subtask(TASK_CHUGSPLASH_EXECUTE)
  .setDescription('Executes an approved bundle.')
  .addParam(
    'chugSplashManager',
    'ChugSplashManager Contract',
    undefined,
    types.any
  )
  .addParam(
    'bundleId',
    'ID of the bundle to be executed',
    undefined,
    types.string
  )
  .addParam('bundle', 'The bundle to be executed', undefined, types.any)
  .addParam(
    'parsedConfig',
    'Parsed ChugSplash configuration',
    undefined,
    types.any
  )
  .addParam('executor', 'Wallet of the executor', undefined, types.any)
  .addFlag('silent', "Hide ChugSplash's output")
  .addFlag(
    'isLocalExecution',
    "True if execution is occurring on the user's local machine"
  )
  .setAction(executeTask)

export const chugsplashApproveTask = async (
  args: {
    configPath: string
    silent: boolean
    remoteExecution: boolean
    amount: ethers.BigNumber
    skipMonitorStatus: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, silent, remoteExecution, amount, skipMonitorStatus } =
    args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const spinner = ora({ isSilent: silent })
  spinner.start('Approving the bundle...')

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  await registerChugSplashProject(
    provider,
    parsedConfig.options.projectName,
    parsedConfig.options.projectOwner
  )

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )
  // Call the commit subtask locally to get the bundle ID without publishing
  // anything to IPFS.
  const { bundleId } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl: '',
      commitToIpfs: false,
      noCompile: true,
    },
    hre
  )

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )
  const activeBundleId = await ChugSplashManager.activeBundleId()
  if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
    throw new Error(`You must first propose the project before it can be approved.
No funds were sent. To propose the project, run the command:

npx hardhat chugsplash-propose --network ${hre.network.name} ${configPath}`)
  } else if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.succeed(`Project has already been approved. It should be executed shortly.
No funds were sent. Run the following command to monitor its status:

npx hardhat chugsplash-monitor --network ${hre.network.name} ${configPath}`)
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.succeed(
      `Project was already completed on ${hre.network.name}. No funds were sent.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${hre.network.name}. No funds were sent.`
    )
  } else if (activeBundleId !== ethers.constants.HashZero) {
    throw new Error(
      `Another project is currently being executed. No funds were sent.
Please wait a couple minutes then try again.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.PROPOSED) {
    await chugsplashFundTask(
      {
        configPath,
        amount,
        silent: true,
      },
      hre
    )

    await (await ChugSplashManager.approveChugSplashBundle(bundleId)).wait()
    spinner.succeed(`Project approved on ${hre.network.name}.`)

    if (remoteExecution && !skipMonitorStatus) {
      spinner.start('The deployment is being executed. This may take a moment.')
      const finalDeploymentTxnHash = await monitorRemoteExecution(
        hre,
        parsedConfig,
        bundleId
      )
      await postExecutionActions(provider, parsedConfig)
      await createDeploymentArtifacts(hre, parsedConfig, finalDeploymentTxnHash)
      displayDeploymentTable(parsedConfig, silent)
      spinner.succeed(
        `${parsedConfig.options.projectName} successfully deployed on ${hre.network.name}.`
      )
    }
  }
}

task(TASK_CHUGSPLASH_APPROVE)
  .setDescription('Allows a manager to approve a bundle to be executed.')
  .addParam(
    'amount',
    'Amount to send to fund the deployment, denominated in wei'
  )
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to approve'
  )
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
        return {
          name: event.args.projectName,
          manager: event.args.manager,
        }
      })
    )
  })

export const chugsplashCommitSubtask = async (
  args: {
    parsedConfig: ChugSplashConfig
    ipfsUrl: string
    commitToIpfs: boolean
    noCompile: boolean
  },
  hre
): Promise<{
  bundle: ChugSplashActionBundle
  configUri: string
  bundleId: string
}> => {
  const { parsedConfig, ipfsUrl, commitToIpfs, noCompile } = args

  if (!noCompile) {
    await cleanThenCompile(hre)
  }

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
      `To deploy on ${hre.network.name}, you must first setup an IPFS project with
Infura: https://app.infura.io/. Once you've done this, copy and paste the following
variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const bundle = await bundleLocalSubtask({
    parsedConfig,
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

export const monitorTask = async (
  args: {
    configPath: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, silent } = args

  if (hre.network.name === 'hardhat') {
    throw new Error(
      `Cannot check the status of deployments on the in-process Hardhat network.
Did you forget the --network flag?`
    )
  }

  const spinner = ora({ isSilent: silent })
  spinner.start(`Loading project information...`)

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(
      await getChainId(provider),
      hre.network.name,
      configPath
    )
  }

  const { bundleId } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl: '',
      commitToIpfs: false,
      noCompile: true,
    },
    hre
  )
  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  spinner.succeed(`Loaded project information.`)

  if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
    throw new Error(
      `${parsedConfig.options.projectName} has not been proposed or approved for
execution on ${hre.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.PROPOSED) {
    throw new Error(
      `${parsedConfig.options.projectName} has not been proposed but not yet
approved for execution on ${hre.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${hre.network.name}. Please propose a new
project with a name other than ${parsedConfig.options.projectName}`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.start(
      'The deployment was already executed. Performing cleanup functions...'
    )
  } else if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.start(
      'The deployment is currently being executed. This may take a moment.'
    )

    const finalDeploymentTxnHash = await monitorRemoteExecution(
      hre,
      parsedConfig,
      bundleId
    )
    await postExecutionActions(provider, parsedConfig)
    await createDeploymentArtifacts(hre, parsedConfig, finalDeploymentTxnHash)

    bundleState.status === ChugSplashBundleStatus.APPROVED
      ? spinner.succeed(
          `${parsedConfig.options.projectName} successfully deployed on ${hre.network.name}.`
        )
      : spinner.succeed(
          `${parsedConfig.options.projectName} was already deployed on ${hre.network.name}.`
        )

    displayDeploymentTable(parsedConfig, silent)
  }
}

task(TASK_CHUGSPLASH_MONITOR)
  .setDescription('Displays the status of a ChugSplash bundle')
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to monitor'
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

  const spinner = ora({ isSilent: silent })

  const signer = hre.ethers.provider.getSigner()
  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const projectName = parsedConfig.options.projectName
  const chugsplashManagerAddress = getChugSplashManagerProxyAddress(projectName)
  const signerBalance = await signer.getBalance()

  if (signerBalance.lt(amount)) {
    throw new Error(`Signer's balance is less than the amount required to fund your project.

Signer's balance: ${ethers.utils.formatEther(signerBalance)} ETH
Amount: ${ethers.utils.formatEther(amount)} ETH

Please send more ETH to ${await signer.getAddress()} on ${
      hre.network.name
    } then try again.`)
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

task(TASK_CHUGSPLASH_FUND)
  .setDescription('Fund a ChugSplash deployment')
  .addParam('amount', 'Amount to send in wei')
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addPositionalParam('configPath', 'Path to the ChugSplash config file')
  .setAction(chugsplashFundTask)

task(TASK_TEST_REMOTE_EXECUTION)
  .setDescription(
    'Test remote execution for deployments on the Hardhat network. For testing purposes only.'
  )
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to deploy'
  )
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(
    async (
      args: {
        configPath: string
        noCompile: boolean
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      const { configPath, noCompile } = args

      if (hre.network.name !== 'localhost') {
        throw new Error(
          `You can only test remote execution on localhost. Got network: ${hre.network.name}`
        )
      }

      const signer = hre.ethers.provider.getSigner()
      await deployChugSplashPredeploys(hre, signer)
      await deployChugSplashConfig(hre, configPath, false, true, '', noCompile)
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
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(
    async (
      args: {
        setupInternals: boolean
        disableChugsplash: boolean
        hide: boolean
        noCompile: boolean
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { setupInternals, disableChugsplash, hide, noCompile } = args
      if (!disableChugsplash) {
        const deployer = hre.ethers.provider.getSigner()
        await deployChugSplashPredeploys(hre, deployer)
        if (!setupInternals) {
          await deployAllChugSplashConfigs(hre, hide, '', noCompile)
        }
        await writeHardhatSnapshotId(hre)
      }
      await runSuper(args)
    }
  )

task(TASK_TEST)
  .addFlag('show', 'Show ChugSplash deployment information')
  .setAction(
    async (args: { show: boolean; noCompile: boolean }, hre: any, runSuper) => {
      const { show, noCompile } = args
      const chainId = await getChainId(hre.ethers.provider)
      if (chainId === 31337) {
        try {
          const snapshotIdPath = path.join(
            path.basename(hre.config.paths.deployed),
            hre.network.name === 'localhost' ? 'localhost' : 'hardhat',
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
          await deployChugSplashPredeploys(hre, hre.ethers.provider.getSigner())
          await deployAllChugSplashConfigs(hre, !show, '', noCompile)
        } finally {
          await writeHardhatSnapshotId(hre)
        }
      }
      await runSuper(args)
    }
  )

task(TASK_RUN)
  .addFlag(
    'disableChugsplash',
    "Completely disable all of ChugSplash's activity."
  )
  .setAction(
    async (
      args: {
        disableChugsplash: boolean
        noCompile: boolean
      },
      hre: any,
      runSuper
    ) => {
      const { disableChugsplash, noCompile } = args
      if (!disableChugsplash) {
        const signer = hre.ethers.provider.getSigner()
        await deployChugSplashPredeploys(hre, signer)
        await deployAllChugSplashConfigs(hre, true, '', noCompile)
      }
      await runSuper(args)
    }
  )

export const chugsplashCancelTask = async (
  args: {
    configPath: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, silent } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const projectName = parsedConfig.options.projectName

  const spinner = ora({ isSilent: silent })
  spinner.start(`Cancelling ${projectName} on ${hre.network.name}.`)

  if (!(await isProjectRegistered(signer, projectName))) {
    errorProjectNotRegistered(
      await getChainId(provider),
      hre.network.name,
      configPath
    )
  }

  const projectOwnerAddress = await getProjectOwnerAddress(
    provider,
    projectName
  )
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
You attempted to cancel the project using the address: ${await signer.getAddress()}`)
  }

  // Get the bundle info by calling the commit subtask locally (which doesn't publish anything to
  // IPFS).
  const { bundleId } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl: '',
      commitToIpfs: false,
      noCompile: true,
    },
    hre
  )

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status !== ChugSplashBundleStatus.APPROVED) {
    throw new Error(
      `Project is not active. Current project state: ${
        ChugSplashBundleStatus[bundleState.status]
      }`
    )
  }

  await (await ChugSplashManager.cancelActiveChugSplashBundle()).wait()

  spinner.succeed(`Cancelled ${projectName} on ${hre.network.name}.`)
  spinner.start(`Refunding the project owner...`)

  const prevOwnerBalance = await signer.getBalance()
  await (await ChugSplashManager.withdrawOwnerETH()).wait()
  const refund = (await signer.getBalance()).sub(prevOwnerBalance)

  spinner.succeed(
    `Refunded ${ethers.utils.formatEther(refund)} ETH on ${
      hre.network.name
    } to the project owner: ${await signer.getAddress()}.`
  )
}

task(TASK_CHUGSPLASH_CANCEL)
  .setDescription('Cancel an active ChugSplash project.')
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addPositionalParam(
    'configPath',
    'Path to the ChugSplash config file to cancel'
  )
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
  const parsedConfig = loadParsedChugSplashConfig(configPath)
  const projectName = parsedConfig.options.projectName

  const spinner = ora({ isSilent: silent })
  spinner.start(
    `Withdrawing ETH in the project ${projectName} on ${hre.network.name}.`
  )

  if (!(await isProjectRegistered(signer, projectName))) {
    errorProjectNotRegistered(
      await getChainId(provider),
      hre.network.name,
      configPath
    )
  }

  const projectOwnerAddress = await getProjectOwnerAddress(
    provider,
    projectName
  )
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
Caller attempted to claim funds using the address: ${await signer.getAddress()}`)
  }

  // Get the bundle info by calling the commit subtask locally (which doesn't publish anything to
  // IPFS).
  const { bundleId } = await chugsplashCommitSubtask(
    {
      parsedConfig,
      ipfsUrl: '',
      commitToIpfs: false,
      noCompile: true,
    },
    hre
  )

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    throw new Error(
      `Project is currently active. You must cancel the project in order to withdraw funds:

npx hardhat chugsplash-cancel --network ${hre.network.name} ${configPath}
        `
    )
  }

  const amountToWithdraw = await getOwnerBalanceInChugSplashManager(
    provider,
    projectName
  )

  if (amountToWithdraw.gt(0)) {
    await (await ChugSplashManager.withdrawOwnerETH()).wait()

    spinner.succeed(
      `Withdrew ${ethers.utils.formatEther(amountToWithdraw)} ETH on ${
        hre.network.name
      } to the project owner: ${await signer.getAddress()}.`
    )
  } else {
    spinner.fail(
      `No funds available to withdraw on ${hre.network.name} for the project: ${projectName}.`
    )
  }
}

task(TASK_CHUGSPLASH_WITHDRAW)
  .setDescription(
    'Withdraw funds in a ChugSplash project belonging to the project owner.'
  )
  .addFlag('silent', "Hide all of ChugSplash's output")
  .addPositionalParam('configPath', 'Path to the ChugSplash config file')
  .setAction(chugsplashWithdrawTask)

export const listProjectsTask = async ({}, hre: HardhatRuntimeEnvironment) => {
  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  const signerAddress = await signer.getAddress()

  const spinner = ora()
  spinner.start(
    `Getting projects on ${hre.network.name} owned by: ${signerAddress}`
  )

  const ChugSplashRegistry = getChugSplashRegistry(signer)

  const projectRegisteredEvents = await ChugSplashRegistry.queryFilter(
    ChugSplashRegistry.filters.ChugSplashProjectRegistered()
  )

  const projects = {}
  let numProjectsOwned = 0
  for (const event of projectRegisteredEvents) {
    const ChugSplashManager = getChugSplashManager(
      signer,
      event.args.projectName
    )
    const projectOwnerAddress = await getProjectOwnerAddress(
      provider,
      event.args.projectName
    )
    if (projectOwnerAddress === signerAddress) {
      numProjectsOwned += 1
      const hasActiveBundle =
        (await ChugSplashManager.activeBundleId()) !== ethers.constants.HashZero
      const totalEthBalance = await provider.getBalance(
        ChugSplashManager.address
      )
      const ownerBalance = await getOwnerBalanceInChugSplashManager(
        provider,
        event.args.projectName
      )

      const formattedTotalEthBalance = totalEthBalance.gt(0)
        ? parseFloat(ethers.utils.formatEther(totalEthBalance)).toFixed(4)
        : 0
      const formattedOwnerBalance = ownerBalance.gt(0)
        ? parseFloat(ethers.utils.formatEther(ownerBalance)).toFixed(4)
        : 0

      projects[numProjectsOwned] = {
        'Project Name': event.args.projectName,
        'Is Active': hasActiveBundle ? 'Yes' : 'No',
        "Project Owner's ETH": formattedOwnerBalance,
        'Total ETH': formattedTotalEthBalance,
      }
    }
  }

  if (numProjectsOwned > 0) {
    spinner.succeed(
      `Got all projects on ${hre.network.name} owned by: ${signerAddress}`
    )
    console.table(projects)
  } else {
    spinner.fail(
      `No projects on ${hre.network.name} owned by: ${signerAddress}`
    )
  }
}

task(TASK_CHUGSPLASH_LIST_PROJECTS)
  .setDescription('Lists all projects that are owned by the caller.')
  .setAction(listProjectsTask)
