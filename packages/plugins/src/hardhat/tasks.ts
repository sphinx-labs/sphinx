import * as path from 'path'
import * as fs from 'fs'

import { ethers } from 'ethers'
import { subtask, task, types } from 'hardhat/config'
import {
  TASK_NODE,
  TASK_TEST,
  TASK_RUN,
  TASK_COMPILE,
} from 'hardhat/builtin-tasks/task-names'
import {
  ParsedChugSplashConfig,
  getChugSplashRegistry,
  chugsplashFetchSubtask,
  chugsplashClaimAbstractTask,
  chugsplashCommitAbstractSubtask,
  chugsplashProposeAbstractTask,
  chugsplashDeployAbstractTask,
  resolveNetworkName,
  writeSnapshotId,
  chugsplashCancelAbstractTask,
  chugsplashListProjectsAbstractTask,
  chugsplashExportProxyAbstractTask,
  chugsplashImportProxyAbstractTask,
  bundleRemoteSubtask,
  ChugSplashBundles,
  readValidatedChugSplashConfig,
  readUnvalidatedChugSplashConfig,
  isLiveNetwork,
  ensureChugSplashInitialized,
  ConfigArtifacts,
} from '@chugsplash/core'
import { ChugSplashManagerABI } from '@chugsplash/contracts'
import ora from 'ora'
import * as dotenv from 'dotenv'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import {
  getSampleContractFile,
  sampleChugSplashFileJavaScript,
  sampleChugSplashFileTypeScript,
} from '../sample-project'
import { deployAllChugSplashConfigs } from './deployments'
import {
  sampleTestFileJavaScript,
  sampleTestFileTypeScript,
} from '../sample-project/sample-tests'
import { getConfigArtifacts } from './artifacts'
import { createChugSplashRuntime } from '../utils'

// Load environment variables from .env
dotenv.config()

// internal tasks
export const TASK_CHUGSPLASH_FETCH = 'chugsplash-fetch'
export const TASK_CHUGSPLASH_BUNDLE_REMOTE = 'chugsplash-bundle-remote'
export const TASK_CHUGSPLASH_LIST_ALL_PROJECTS = 'chugsplash-list-projects'
export const TASK_CHUGSPLASH_LIST_DEPLOYMENTS = 'chugsplash-list-deployments'
export const TASK_CHUGSPLASH_COMMIT = 'chugsplash-commit'

// public tasks
export const TASK_CHUGSPLASH_INIT = 'chugsplash-init'
export const TASK_CHUGSPLASH_DEPLOY = 'chugsplash-deploy'
export const TASK_CHUGSPLASH_CLAIM = 'chugsplash-claim'
export const TASK_CHUGSPLASH_PROPOSE = 'chugsplash-propose'
export const TASK_CHUGSPLASH_CANCEL = 'chugsplash-cancel'
export const TASK_CHUGSPLASH_LIST_PROJECTS = 'chugsplash-list-projects'
export const TASK_CHUGSPLASH_ADD_PROPOSER = 'chugsplash-add-proposers'
export const TASK_CHUGSPLASH_IMPORT_PROXY = 'chugsplash-import-proxy'
export const TASK_CHUGSPLASH_EXPORT_PROXY = 'chugsplash-export-proxy'

subtask(TASK_CHUGSPLASH_FETCH)
  .addParam('configUri', undefined, undefined, types.string)
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(chugsplashFetchSubtask)

subtask(TASK_CHUGSPLASH_BUNDLE_REMOTE)
  .addParam('canonicalConfig', undefined, undefined, types.any)
  .setAction(bundleRemoteSubtask)

export const chugsplashDeployTask = async (
  args: {
    configPath: string
    newOwner: string
    silent: boolean
    noCompile: boolean
    confirm: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, newOwner, silent, noCompile, confirm } = args
  const cre = await createChugSplashRuntime(
    configPath,
    false,
    confirm,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const provider = hre.ethers.provider
  const signer = hre.ethers.provider.getSigner()
  const signerAddress = await signer.getAddress()
  await ensureChugSplashInitialized(provider, signer)

  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const deploymentFolder = hre.config.paths.deployments

  const userConfig = await readUnvalidatedChugSplashConfig(configPath)
  const configArtifacts = await getConfigArtifacts(hre, userConfig.contracts)
  const parsedConfig = await readValidatedChugSplashConfig(
    provider,
    configPath,
    configArtifacts,
    'hardhat',
    cre
  )

  await chugsplashDeployAbstractTask(
    provider,
    signer,
    configPath,
    newOwner ?? signerAddress,
    configArtifacts,
    canonicalConfigPath,
    deploymentFolder,
    'hardhat',
    cre,
    parsedConfig
  )
}

task(TASK_CHUGSPLASH_DEPLOY)
  .setDescription('Deploys a ChugSplash config file')
  .addParam('configPath', 'Path to the ChugSplash config file to deploy')
  .addOptionalParam(
    'newOwner',
    "Address to receive ownership of the project after the deployment is finished. If unspecified, defaults to the caller's address."
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  .addFlag(
    'confirm',
    'Automatically confirm contract upgrades. Only applicable if upgrading on a live network.'
  )
  .setAction(chugsplashDeployTask)

export const chugsplashClaimTask = async (
  args: {
    configPath: string
    allowManagedProposals: boolean
    owner: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, silent, owner, allowManagedProposals } = args
  const cre = await createChugSplashRuntime(
    configPath,
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  const provider = hre.ethers.provider
  const signer = hre.ethers.provider.getSigner()
  await ensureChugSplashInitialized(provider, signer)

  const userConfig = await readUnvalidatedChugSplashConfig(configPath)
  const configArtifacts = await getConfigArtifacts(hre, userConfig.contracts)

  const parsedConfig = await readValidatedChugSplashConfig(
    provider,
    configPath,
    configArtifacts,
    'hardhat',
    cre
  )

  await chugsplashClaimAbstractTask(
    provider,
    signer,
    parsedConfig,
    allowManagedProposals,
    owner,
    'hardhat',
    cre
  )
}

task(TASK_CHUGSPLASH_CLAIM)
  .setDescription('Claims a new ChugSplash project')
  .addParam('configPath', 'Path to the ChugSplash config file to propose')
  .addFlag(
    'allowManagedProposals',
    'Allow the ChugSplash Managed Service to propose deployments and upgrades on your behalf.'
  )
  .addParam('owner', 'Owner of the ChugSplash project')
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .setAction(chugsplashClaimTask)

export const chugsplashProposeTask = async (
  args: {
    configPath: string
    ipfsUrl: string
    silent: boolean
    noCompile: boolean
    confirm: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, ipfsUrl, silent, noCompile, confirm } = args
  const cre = await createChugSplashRuntime(
    configPath,
    true,
    confirm,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const userConfig = await readUnvalidatedChugSplashConfig(configPath)
  const canonicalConfigPath = hre.config.paths.canonicalConfigs

  const provider = hre.ethers.provider
  const signer = hre.ethers.provider.getSigner()
  await ensureChugSplashInitialized(provider, signer)

  const configArtifacts = await getConfigArtifacts(hre, userConfig.contracts)

  const parsedConfig = await readValidatedChugSplashConfig(
    provider,
    configPath,
    configArtifacts,
    'hardhat',
    cre
  )

  await chugsplashProposeAbstractTask(
    provider,
    signer,
    parsedConfig,
    configPath,
    ipfsUrl,
    'hardhat',
    configArtifacts,
    canonicalConfigPath,
    cre
  )
}

task(TASK_CHUGSPLASH_PROPOSE)
  .setDescription('Proposes a new ChugSplash project')
  .addParam('configPath', 'Path to the ChugSplash config file to propose')
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

subtask(TASK_CHUGSPLASH_LIST_ALL_PROJECTS)
  .setDescription('Lists all existing ChugSplash projects')
  .setAction(async (_, hre) => {
    const signer = hre.ethers.provider.getSigner()

    await ensureChugSplashInitialized(hre.ethers.provider, signer)

    const ChugSplashRegistry = getChugSplashRegistry(
      hre.ethers.provider.getSigner()
    )

    const events = await ChugSplashRegistry.queryFilter(
      ChugSplashRegistry.filters.ChugSplashProjectClaimed()
    )

    console.table(
      events.map((event) => {
        if (event.args === undefined) {
          throw new Error(
            `ChugSplashProjectClaimed event does not have arguments.`
          )
        }

        return {
          name: event.args.organizationID,
          manager: event.args.manager,
        }
      })
    )
  })

export const chugsplashCommitSubtask = async (
  args: {
    parsedConfig: ParsedChugSplashConfig
    ipfsUrl: string
    commitToIpfs: boolean
    noCompile: boolean
    configArtifacts: ConfigArtifacts
    spinner?: ora.Ora
  },
  hre: HardhatRuntimeEnvironment
): Promise<{
  bundles: ChugSplashBundles
  configUri: string
  deploymentId: string
}> => {
  const {
    parsedConfig,
    ipfsUrl,
    commitToIpfs,
    noCompile,
    spinner,
    configArtifacts,
  } = args

  if (!noCompile) {
    await hre.run(TASK_COMPILE, {
      quiet: true,
    })
  }

  const canonicalConfigPath = hre.config.paths.canonicalConfigs
  const provider = hre.ethers.provider
  return chugsplashCommitAbstractSubtask(
    provider,
    parsedConfig,
    ipfsUrl,
    commitToIpfs,
    configArtifacts,
    canonicalConfigPath,
    'hardhat',
    spinner
  )
}

subtask(TASK_CHUGSPLASH_COMMIT)
  .setDescription('Commits a ChugSplash config file with artifacts to IPFS')
  .addParam('parsedConfig', 'Parsed ChugSplash config')
  .addOptionalParam('ipfsUrl', 'IPFS gateway URL')
  .setAction(chugsplashCommitSubtask)

subtask(TASK_CHUGSPLASH_LIST_DEPLOYMENTS)
  .setDescription('Lists all deployments for a given project')
  .addParam('organizationID', 'Organization ID')
  .addFlag('includeExecuted', 'include deployments that have been executed')
  .setAction(
    async (
      args: {
        organizationID: string
        includeExecuted: boolean
      },
      hre
    ) => {
      const signer = hre.ethers.provider.getSigner()

      await ensureChugSplashInitialized(hre.ethers.provider, signer)

      const ChugSplashRegistry = getChugSplashRegistry(signer)

      const ChugSplashManager = new ethers.Contract(
        await ChugSplashRegistry.projects(args.organizationID),
        ChugSplashManagerABI,
        signer
      )

      // Get events for all deployments that have been proposed. This array includes
      // events that have been approved and executed, which will be filtered out.
      const proposedEvents = await ChugSplashManager.queryFilter(
        ChugSplashManager.filters.ChugSplashDeploymentProposed()
      )

      // Exit early if there are no proposals for the project.
      if (proposedEvents.length === 0) {
        console.log('There are no deployments for this project.')
        return
      }

      // Filter out the approved deployment event if there is a currently active deployment
      const activeDeploymentId = await ChugSplashManager.activeDeploymentId()

      let approvedEvent: any
      if (activeDeploymentId !== ethers.constants.HashZero) {
        for (let i = 0; i < proposedEvents.length; i++) {
          const proposedEvent = proposedEvents[i]
          if (proposedEvent.args === undefined) {
            throw new Error(
              `ChugSplashDeploymentProposed does not have arguments.`
            )
          }

          const deploymentId = proposedEvent.args.deploymentId
          if (deploymentId === activeDeploymentId) {
            // Remove the active deployment event in-place and return it.
            approvedEvent = proposedEvents.splice(i, 1)

            // It's fine to break out of the loop here since there is only one
            // active deployment at a time.
            break
          }
        }
      }

      const executedEvents = await ChugSplashManager.queryFilter(
        ChugSplashManager.filters.ChugSplashDeploymentCompleted()
      )

      for (const executed of executedEvents) {
        for (let i = 0; i < proposedEvents.length; i++) {
          const proposed = proposedEvents[i]
          if (proposed.args === undefined) {
            throw new Error(
              `ChugSplashDeploymentProposed does not have arguments.`
            )
          } else if (executed.args === undefined) {
            throw new Error(
              `ChugSplashDeploymentCompleted event does not have arguments.`
            )
          }
          // Remove the event if the deployment IDs match
          if (proposed.args.deploymentId === executed.args.deploymentId) {
            proposedEvents.splice(i, 1)
          }
        }
      }

      if (proposedEvents.length === 0) {
        // Accounts for the case where there is only one deployment, and it is approved.
        console.log('There are currently no proposed deployments.')
      } else {
        // Display the proposed deployments
        console.log(`Proposals:`)
        proposedEvents.forEach((event) => {
          if (event.args === undefined) {
            throw new Error(
              `ChugSplashDeploymentProposed does not have arguments.`
            )
          }
          console.log(
            `Deployment ID: ${event.args.deploymentId}\t\tConfig URI: ${event.args.configUri}`
          )
        })
      }

      // Display the approved deployment if it exists
      if (activeDeploymentId !== ethers.constants.HashZero) {
        console.log('Approved:')
        console.log(
          `Deployment ID: ${activeDeploymentId}\t\tConfig URI: ${approvedEvent[0].args.configUri}`
        )
      }

      // Display the executed deployments if the user has specified to do so
      if (args.includeExecuted) {
        console.log('\n')
        console.log('Executed:')
        executedEvents.forEach((event) => {
          if (event.args === undefined) {
            throw new Error(
              `ChugSplashDeploymentCompleted event does not have arguments.`
            )
          }
          console.log(
            `Deployment ID: ${event.args.deploymentId}\t\tConfig URI: ${event.args.configUri}`
          )
        })
      }
    }
  )

task(TASK_NODE)
  .addFlag('deployAll', 'Deploy all ChugSplash config files on startup')
  .addFlag(
    'disableChugsplash',
    "Completely disable all of ChugSplash's activity."
  )
  .addFlag('hide', "Hide all of ChugSplash's logs")
  .addFlag('noCompile', "Don't compile when running this task")
  .setAction(
    async (
      args: {
        deployAll: boolean
        disableChugsplash: boolean
        hide: boolean
        noCompile: boolean
        confirm: boolean
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { deployAll, disableChugsplash, hide: silent, noCompile } = args

      if (!disableChugsplash) {
        const spinner = ora({ isSilent: silent })
        spinner.start('Booting up ChugSplash...')

        const signer = hre.ethers.provider.getSigner()

        await ensureChugSplashInitialized(hre.ethers.provider, signer)

        spinner.succeed('ChugSplash has been initialized.')

        if (deployAll) {
          if (!noCompile) {
            await hre.run(TASK_COMPILE, {
              quiet: true,
            })
          }
          await deployAllChugSplashConfigs(hre, silent, '')
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
    `Runs mocha tests. By default, deploys all ChugSplash configs in 'chugsplash/' before running the tests.`
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .addFlag(
    'skipDeploy',
    'Skip deploying any ChugSplash config files before running the test(s)'
  )
  .addOptionalParam(
    'configPath',
    'Optional path to the single ChugSplash config file to test.'
  )
  .addOptionalParam(
    'configPaths',
    'Optional paths to ChugSplash config files to test. Format must be a comma-separated string.'
  )
  .setAction(
    async (
      args: {
        silent: boolean
        noCompile: boolean
        confirm: boolean
        configPath: string
        configPaths: string
        skipDeploy: string
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { silent, noCompile, configPath, configPaths, skipDeploy } = args

      const liveNetwork = await isLiveNetwork(hre.ethers.provider)

      const signer = hre.ethers.provider.getSigner()
      const networkName = await resolveNetworkName(
        hre.ethers.provider,
        'hardhat'
      )
      if (!liveNetwork) {
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
          if (!skipDeploy) {
            let configPathArray: string[] | undefined
            if (configPath && configPaths) {
              throw new Error(
                `Cannot specify both '--config-path' and '--config-paths'.`
              )
            } else if (configPath) {
              configPathArray = [configPath]
            } else if (configPaths) {
              // Remove all whitespace and split by commas
              configPathArray = configPaths.replace(/\s+/g, '').split(',')
            }

            await deployAllChugSplashConfigs(hre, silent, '', configPathArray)
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
  .addFlag(
    'deployAll',
    'Deploy all ChugSplash configs before executing your script.'
  )
  .addFlag(
    'confirm',
    'Automatically confirm contract upgrades. Only applicable if upgrading on a live network.'
  )
  .setAction(
    async (
      args: {
        deployAll: boolean
        noCompile: boolean
        confirm: boolean
      },
      hre: HardhatRuntimeEnvironment,
      runSuper
    ) => {
      const { deployAll, noCompile } = args

      if (deployAll) {
        const signer = hre.ethers.provider.getSigner()

        await ensureChugSplashInitialized(hre.ethers.provider, signer)
        if (!noCompile) {
          await hre.run(TASK_COMPILE, {
            quiet: true,
          })
        }
        await deployAllChugSplashConfigs(hre, true, '')
      }
      await runSuper(args)
    }
  )

export const chugsplashCancelTask = async (
  args: {
    configPath: string
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const cre = await createChugSplashRuntime(
    configPath,
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    false
  )

  await chugsplashCancelAbstractTask(
    provider,
    signer,
    configPath,
    'hardhat',
    cre
  )
}

task(TASK_CHUGSPLASH_CANCEL)
  .setDescription('Cancel an active ChugSplash project.')
  .addParam('configPath', 'Path to the ChugSplash config file to cancel')
  .setAction(chugsplashCancelTask)

export const listProjectsTask = async ({}, hre: HardhatRuntimeEnvironment) => {
  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const cre = await createChugSplashRuntime(
    '',
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    false
  )

  await chugsplashListProjectsAbstractTask(provider, signer, 'hardhat', cre)
}

task(TASK_CHUGSPLASH_LIST_PROJECTS)
  .setDescription('Lists all projects that are owned by the caller.')
  .setAction(listProjectsTask)

export const exportProxyTask = async (
  args: {
    configPath: string
    referenceName: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, referenceName, silent } = args
  const cre = await createChugSplashRuntime(
    configPath,
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const config = await readUnvalidatedChugSplashConfig(configPath)
  const configArtifacts = await getConfigArtifacts(hre, config.contracts)
  const parsedConfig = await readValidatedChugSplashConfig(
    provider,
    configPath,
    configArtifacts,
    'hardhat',
    cre
  )

  await chugsplashExportProxyAbstractTask(
    provider,
    signer,
    configPath,
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
  .addParam(
    'referenceName',
    'Reference name of the contract that should be transferred to you'
  )
  .addFlag('silent', "Hide all of ChugSplash's logs")
  .setAction(exportProxyTask)

export const importProxyTask = async (
  args: {
    configPath: string
    proxy: string
    silent: boolean
  },
  hre: HardhatRuntimeEnvironment
) => {
  const { configPath, proxy, silent } = args

  const provider = hre.ethers.provider
  const signer = provider.getSigner()

  const cre = await createChugSplashRuntime(
    configPath,
    false,
    true,
    hre.config.paths.canonicalConfigs,
    hre,
    silent
  )

  await chugsplashImportProxyAbstractTask(
    provider,
    signer,
    configPath,
    proxy,
    'hardhat',
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

  // Create the ChugSplash folder if it doesn't exist
  if (!fs.existsSync(hre.config.paths.chugsplash)) {
    fs.mkdirSync(hre.config.paths.chugsplash)
  }

  // Create a folder for smart contract source files if it doesn't exist
  if (!fs.existsSync(hre.config.paths.sources)) {
    fs.mkdirSync(hre.config.paths.sources)
  }

  // Create a folder for test files if it doesn't exist
  if (!fs.existsSync(hre.config.paths.tests)) {
    fs.mkdirSync(hre.config.paths.tests)
  }

  // First, we'll create the sample ChugSplash config file.

  // True if the Hardhat project is TypeScript and false if it's JavaScript.
  const isTypeScriptProject =
    path.extname(hre.config.paths.configFile) === '.ts'

  // Check if the sample ChugSplash config file already exists.
  const chugsplashFileName = isTypeScriptProject
    ? 'hello-chugsplash.ts'
    : 'hello-chugsplash.js'
  const chugsplashFilePath = path.join(
    hre.config.paths.chugsplash,
    chugsplashFileName
  )
  if (!fs.existsSync(chugsplashFilePath)) {
    // Create the sample ChugSplash config file.
    fs.writeFileSync(
      chugsplashFilePath,
      isTypeScriptProject
        ? sampleChugSplashFileTypeScript
        : sampleChugSplashFileJavaScript
    )
  }

  // Next, we'll create the sample contract file.

  // Get the Solidity compiler version from the Hardhat config.
  const [{ version: solcVersion }] = hre.config.solidity.compilers

  // Check if the sample smart contract exists.
  const contractFilePath = path.join(
    hre.config.paths.sources,
    'HelloChugSplash.sol'
  )
  if (!fs.existsSync(contractFilePath)) {
    // Create the sample contract file.
    fs.writeFileSync(contractFilePath, getSampleContractFile(solcVersion))
  }

  // Lastly, we'll create the sample test file.

  // Check if the sample test file exists.
  const testFileName = isTypeScriptProject
    ? 'HelloChugSplash.spec.ts'
    : 'HelloChugSplash.test.js'
  const testFilePath = path.join(hre.config.paths.tests, testFileName)
  if (!fs.existsSync(testFilePath)) {
    // Create the sample test file.
    fs.writeFileSync(
      testFilePath,
      isTypeScriptProject ? sampleTestFileTypeScript : sampleTestFileJavaScript
    )
  }

  spinner.succeed('Initialized ChugSplash project.')
}

task(TASK_CHUGSPLASH_INIT)
  .setDescription('Sets up a ChugSplash project.')
  .addFlag('silent', "Hide ChugSplash's logs")
  .setAction(chugsplashInitTask)
