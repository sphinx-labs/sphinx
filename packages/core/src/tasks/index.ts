import process from 'process'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import ora from 'ora'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { ProxyABI } from '@chugsplash/contracts'

import {
  CanonicalChugSplashConfig,
  ChugSplashInput,
  ParsedChugSplashConfig,
  contractKindHashes,
  readUnvalidatedChugSplashConfig,
  UserChugSplashConfig,
  verifyDeployment,
  ConfigArtifacts,
} from '../config'
import {
  computeDeploymentId,
  displayDeploymentTable,
  formatEther,
  generateFoundryTestArtifacts,
  getChainId,
  getChugSplashManager,
  getChugSplashRegistry,
  getDeploymentEvents,
  getEIP1967ProxyAdminAddress,
  getGasPriceOverrides,
  getProjectOwnerAddress,
  isInternalDefaultProxy,
  isProjectClaimed,
  isTransparentProxy,
  isUUPSProxy,
  readCanonicalConfig,
  finalizeRegistration,
  writeCanonicalConfig,
  isLiveNetwork,
  writeSnapshotId,
} from '../utils'
import { getMinimumCompilerInput } from '../languages'
import { Integration } from '../constants'
import {
  alreadyProposedMessage,
  errorProjectNotClaimed,
  resolveNetworkName,
  successfulProposalMessage,
} from '../messages'
import {
  ChugSplashBundles,
  DeploymentState,
  DeploymentStatus,
  executeTask,
  getDeployContractActions,
  makeBundlesFromConfig,
  writeDeploymentArtifacts,
} from '../actions'
import {
  estimateExecutionGas,
  getAmountToDeposit,
  getOwnerWithdrawableAmount,
} from '../fund'
import { monitorExecution, postExecutionActions } from '../execution'
import { ChugSplashRuntimeEnvironment, FoundryContractArtifact } from '../types'
import {
  trackApproved,
  trackCancel,
  trackExportProxy,
  trackDeployed,
  trackListProjects,
  trackProposed,
  trackRegistrationFinalized,
  trackImportProxy,
} from '../analytics'
import {
  isSupportedNetworkOnEtherscan,
  verifyChugSplashConfig,
} from '../etherscan'
import { relaySignedRequest, signMetaTxRequest } from '../metatxs'

// Load environment variables from .env
dotenv.config()

export const chugsplashClaimAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  config: UserChugSplashConfig | ParsedChugSplashConfig,
  allowManagedProposals: boolean,
  owner: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })

  spinner.start(`Claiming ${config.options.projectName}...`)

  const { projectName, organizationID } = config.options

  const isFirstTimeClaimed = await finalizeRegistration(
    provider,
    signer,
    organizationID,
    owner,
    allowManagedProposals
  )

  const networkName = await resolveNetworkName(provider, integration)

  await trackRegistrationFinalized(
    await getProjectOwnerAddress(
      getChugSplashManager(provider, organizationID)
    ),
    organizationID,
    projectName,
    networkName,
    integration
  )

  isFirstTimeClaimed
    ? spinner.succeed(
        `Project successfully claimed on ${networkName}. Owner: ${owner}`
      )
    : spinner.fail(
        `Project was already claimed by the caller on ${networkName}.`
      )
}

export const chugsplashProposeAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  configPath: string,
  ipfsUrl: string,
  integration: Integration,
  configArtifacts: ConfigArtifacts,
  canonicalConfigPath: string,
  cre: ChugSplashRuntimeEnvironment,
  shouldRelay = true
) => {
  const { remoteExecution } = cre

  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  if (integration === 'hardhat') {
    spinner.start('Booting up ChugSplash...')
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.organizationID
  )
  if ((await isProjectClaimed(signer, ChugSplashManager.address)) === false) {
    await errorProjectNotClaimed(provider, configPath, integration)
  }

  if (integration === 'hardhat') {
    spinner.succeed('ChugSplash is ready to go.')
  }

  // Get the deployment info by calling the commit subtask locally (i.e. without publishing the
  // bundle to IPFS). This allows us to ensure that the deployment state is empty before we submit
  // it to IPFS.
  const { bundles, configUri, deploymentId } =
    await chugsplashCommitAbstractSubtask(
      provider,
      parsedConfig,
      '',
      false,
      configArtifacts,
      canonicalConfigPath,
      integration
    )

  spinner.start(`Checking the status of ${parsedConfig.options.projectName}...`)

  const deploymentState: DeploymentState = await ChugSplashManager.deployments(
    deploymentId
  )

  const networkName = await resolveNetworkName(provider, integration)
  if (
    deploymentState.status === DeploymentStatus.APPROVED ||
    deploymentState.status === DeploymentStatus.PROXIES_INITIATED
  ) {
    spinner.fail(
      `Project was already proposed and is currently being executed on ${networkName}.`
    )
  } else {
    // If we make it to this point, we know that the deployment is either currently proposed or can be
    // proposed.

    // Get the amount that the user must send to the ChugSplashManager to execute the deployment
    // including a buffer in case the gas price increases during execution.
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundles,
      0,
      parsedConfig,
      true
    )

    if (deploymentState.status === DeploymentStatus.PROPOSED) {
      spinner.fail(
        await alreadyProposedMessage(
          provider,
          amountToDeposit,
          configPath,
          integration
        )
      )
    } else {
      spinner.succeed(`${parsedConfig.options.projectName} can be proposed.`)
      spinner.start(`Proposing ${parsedConfig.options.projectName}...`)

      const metatxs = await proposeChugSplashDeployment(
        provider,
        signer,
        parsedConfig,
        bundles,
        configUri,
        remoteExecution,
        ipfsUrl,
        spinner,
        configArtifacts,
        canonicalConfigPath,
        integration,
        shouldRelay
      )
      const message = await successfulProposalMessage(
        provider,
        amountToDeposit,
        configPath,
        integration
      )
      spinner.succeed(message)

      return metatxs
    }
  }
}

export const chugsplashCommitAbstractSubtask = async (
  provider: ethers.providers.JsonRpcProvider,
  parsedConfig: ParsedChugSplashConfig,
  ipfsUrl: string,
  commitToIpfs: boolean,
  configArtifacts: ConfigArtifacts,
  canonicalConfigPath: string,
  integration: Integration,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  bundles: ChugSplashBundles
  configUri: string
  deploymentId: string
}> => {
  const networkName = await resolveNetworkName(provider, integration)
  if (spinner) {
    commitToIpfs
      ? spinner.start(
          `Committing ${parsedConfig.options.projectName} on ${networkName}.`
        )
      : spinner.start('Building the project...')
  }

  const chugsplashInputs: Array<ChugSplashInput> = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { buildInfo } = configArtifacts[referenceName]

    const prevChugSplashInput = chugsplashInputs.find(
      (input) => input.solcLongVersion === buildInfo.solcLongVersion
    )

    // Split the contract's fully qualified name
    const [sourceName, contractName] = contractConfig.contract.split(':')

    const { language, settings, sources } = getMinimumCompilerInput(
      buildInfo.input,
      buildInfo.output.contracts,
      sourceName,
      contractName
    )

    if (prevChugSplashInput === undefined) {
      const chugsplashInput: ChugSplashInput = {
        solcVersion: buildInfo.solcVersion,
        solcLongVersion: buildInfo.solcLongVersion,
        id: buildInfo.id,
        input: {
          language,
          settings,
          sources,
        },
      }
      chugsplashInputs.push(chugsplashInput)
    } else {
      prevChugSplashInput.input.sources = {
        ...prevChugSplashInput.input.sources,
        ...sources,
      }
    }
  }

  const canonicalConfig: CanonicalChugSplashConfig = {
    ...parsedConfig,
    inputs: chugsplashInputs,
  }

  const ipfsData = JSON.stringify(canonicalConfig, null, 2)

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
      `To deploy on ${networkName}, you must first setup an IPFS project with
Infura: https://app.infura.io/. Once you've done this, copy and paste the following
variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const bundles = await makeBundlesFromConfig(
    provider,
    parsedConfig,
    configArtifacts
  )

  const configUri = `ipfs://${ipfsHash}`
  const deploymentId = computeDeploymentId(
    bundles.actionBundle.root,
    bundles.targetBundle.root,
    bundles.actionBundle.actions.length,
    bundles.targetBundle.targets.length,
    getDeployContractActions(bundles.actionBundle).length,
    configUri
  )

  // Write the canonical config to the local file system if we aren't committing it to IPFS.
  if (!commitToIpfs) {
    await writeCanonicalConfig(
      provider,
      canonicalConfigPath,
      configUri,
      canonicalConfig
    )
  }

  if (spinner) {
    commitToIpfs
      ? spinner.succeed(
          `${parsedConfig.options.projectName} has been committed to IPFS.`
        )
      : spinner.succeed(
          `Built ${parsedConfig.options.projectName} on ${networkName}.`
        )
  }

  return { bundles, configUri, deploymentId }
}

export const chugsplashApproveAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  skipMonitorStatus: boolean,
  configArtifacts: ConfigArtifacts,
  integration: Integration,
  canonicalConfigPath: string,
  deploymentFolderPath: string,
  parsedConfig: ParsedChugSplashConfig,
  cre: ChugSplashRuntimeEnvironment
) => {
  const { silent, stream } = cre
  const networkName = await resolveNetworkName(provider, integration)

  const spinner = ora({ isSilent: silent, stream })
  spinner.start(
    `Approving ${parsedConfig.options.projectName} on ${networkName}...`
  )

  const { projectName, organizationID } = parsedConfig.options
  const signerAddress = await signer.getAddress()

  const ChugSplashManager = getChugSplashManager(signer, organizationID)

  if (!(await isProjectClaimed(signer, ChugSplashManager.address))) {
    await errorProjectNotClaimed(provider, configPath, integration)
  }

  const projectOwnerAddress = await getProjectOwnerAddress(ChugSplashManager)
  if (signerAddress !== projectOwnerAddress) {
    throw new Error(`Caller is not the project owner on ${networkName}.
Caller's address: ${signerAddress}
Owner's address: ${projectOwnerAddress}`)
  }

  // Call the commit subtask locally to get the deployment ID without publishing
  // anything to IPFS.
  const { deploymentId, bundles } = await chugsplashCommitAbstractSubtask(
    provider,
    parsedConfig,
    '',
    false,
    configArtifacts,
    canonicalConfigPath,
    integration,
    spinner
  )

  const deploymentState: DeploymentState = await ChugSplashManager.deployments(
    deploymentId
  )
  const activeDeploymentId = await ChugSplashManager.activeDeploymentId()
  if (deploymentState.status === DeploymentStatus.EMPTY) {
    throw new Error(`You must first propose the project before it can be approved.
To propose the project, run the command:

npx hardhat chugsplash-propose --network <network> --config-path ${configPath}`)
  } else if (deploymentState.status === DeploymentStatus.APPROVED) {
    spinner.succeed(
      `Project has already been approved. It should be executed shortly.`
    )
  } else if (deploymentState.status === DeploymentStatus.COMPLETED) {
    spinner.succeed(`Project was already completed on ${networkName}.`)
  } else if (deploymentState.status === DeploymentStatus.CANCELLED) {
    throw new Error(`Project was already cancelled on ${networkName}.`)
  } else if (activeDeploymentId !== ethers.constants.HashZero) {
    throw new Error(
      `Another project is currently being executed.
Please wait a couple minutes then try again.`
    )
  } else if (deploymentState.status === DeploymentStatus.PROPOSED) {
    await (
      await ChugSplashManager.approve(
        deploymentId,
        await getGasPriceOverrides(provider)
      )
    ).wait()

    await trackApproved(
      await getProjectOwnerAddress(ChugSplashManager),
      organizationID,
      projectName,
      networkName,
      integration
    )

    spinner.succeed(
      `${parsedConfig.options.projectName} approved on ${networkName}.`
    )

    if (!skipMonitorStatus) {
      await monitorExecution(
        provider,
        signer,
        parsedConfig,
        bundles,
        deploymentId,
        spinner
      )
      await postExecutionActions(
        provider,
        signer,
        parsedConfig,
        await getDeploymentEvents(ChugSplashManager, deploymentId),
        networkName,
        deploymentFolderPath,
        configArtifacts,
        integration,
        undefined,
        spinner
      )
      displayDeploymentTable(parsedConfig, integration, silent)

      spinner.succeed(`${projectName} successfully deployed on ${networkName}.`)
    }
  }
}

export const chugsplashFundAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  configArtifacts: ConfigArtifacts,
  integration: Integration,
  parsedConfig: ParsedChugSplashConfig,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })

  const { projectName, organizationID } = parsedConfig.options
  const ChugSplashManager = getChugSplashManager(provider, organizationID)
  const signerBalance = await signer.getBalance()

  if (!(await isProjectClaimed(signer, ChugSplashManager.address))) {
    await errorProjectNotClaimed(provider, configPath, integration)
  }

  const amountToDeposit = await getAmountToDeposit(
    provider,
    await makeBundlesFromConfig(provider, parsedConfig, configArtifacts),
    0,
    parsedConfig,
    true
  )

  if (signerBalance.lt(amountToDeposit)) {
    throw new Error(`Signer does not have enough funds to deposit.`)
  }

  const txnRequest = await getGasPriceOverrides(provider, {
    value: amountToDeposit,
    to: ChugSplashManager.address,
  })
  await (await signer.sendTransaction(txnRequest)).wait()

  spinner.succeed(
    `Deposited ${formatEther(
      amountToDeposit,
      4
    )} ETH for the project: ${projectName}.`
  )
}

export const chugsplashDeployAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  newOwner: string,
  configArtifacts: ConfigArtifacts,
  canonicalConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig
): Promise<FoundryContractArtifact[] | undefined> => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  const networkName = await resolveNetworkName(provider, integration)

  const signerAddress = await signer.getAddress()

  spinner.start('Parsing ChugSplash config file...')

  const { organizationID, projectName } = parsedConfig.options

  const ChugSplashManager = getChugSplashManager(signer, organizationID)

  const projectPreviouslyClaimed = await isProjectClaimed(
    signer,
    ChugSplashManager.address
  )

  if (projectPreviouslyClaimed === false) {
    spinner.start(`Claiming ${projectName}...`)
    // Claim the project with the signer as the owner. Once we've completed the deployment, we'll
    // transfer ownership to the project owner specified in the config.
    await finalizeRegistration(
      provider,
      signer,
      organizationID,
      signerAddress,
      false
    )
    spinner.succeed(`Successfully claimed ${projectName}.`)
  }

  // Get the deployment ID without publishing anything to IPFS.
  const { deploymentId, bundles, configUri } =
    await chugsplashCommitAbstractSubtask(
      provider,
      parsedConfig,
      '',
      false,
      configArtifacts,
      canonicalConfigPath,
      integration
    )

  spinner.start(`Checking the status of ${projectName}...`)

  if (
    bundles.actionBundle.actions.length === 0 &&
    bundles.targetBundle.targets.length === 0
  ) {
    spinner.succeed(`Nothing to execute in this deployment.`)
    return
  }

  const deploymentState: DeploymentState = await ChugSplashManager.deployments(
    deploymentId
  )
  let currDeploymentStatus = deploymentState.status

  if (currDeploymentStatus === DeploymentStatus.COMPLETED) {
    await writeDeploymentArtifacts(
      provider,
      parsedConfig,
      await getDeploymentEvents(ChugSplashManager, deploymentId),
      networkName,
      deploymentFolder,
      configArtifacts
    )
    spinner.succeed(`${projectName} was already completed on ${networkName}.`)
    if (integration === 'hardhat') {
      displayDeploymentTable(parsedConfig, integration, cre.silent)
      return
    } else {
      return generateFoundryTestArtifacts(parsedConfig)
    }
  } else if (currDeploymentStatus === DeploymentStatus.CANCELLED) {
    spinner.fail(`${projectName} was already cancelled on ${networkName}.`)
    throw new Error(
      `${projectName} was previously cancelled on ${networkName}.`
    )
  }

  if (currDeploymentStatus === DeploymentStatus.EMPTY) {
    spinner.succeed(`${projectName} has not been proposed before.`)
    spinner.start(`Proposing ${projectName}...`)
    await proposeChugSplashDeployment(
      provider,
      signer,
      parsedConfig,
      bundles,
      configUri,
      false,
      '',
      spinner,
      configArtifacts,
      canonicalConfigPath,
      integration,
      false
    )
    currDeploymentStatus = DeploymentStatus.PROPOSED
  }

  if (currDeploymentStatus === DeploymentStatus.PROPOSED) {
    // Approve the deployment.
    await chugsplashApproveAbstractTask(
      provider,
      signer,
      configPath,
      true,
      configArtifacts,
      integration,
      canonicalConfigPath,
      deploymentFolder,
      parsedConfig,
      cre
    )

    currDeploymentStatus = DeploymentStatus.APPROVED
  }

  // At this point, we know that the deployment is active.

  spinner.start(`Executing ${projectName}...`)

  const success = await executeTask({
    chugSplashManager: ChugSplashManager,
    bundles,
    deploymentState,
    executor: signer,
    provider,
    projectName,
  })

  if (!success) {
    throw new Error(
      `Failed to execute ${projectName}, likely because one of the user's constructors reverted during the deployment.`
    )
  }

  spinner.succeed(`Executed ${projectName}.`)

  await postExecutionActions(
    provider,
    signer,
    parsedConfig,
    await getDeploymentEvents(ChugSplashManager, deploymentId),
    networkName,
    deploymentFolder,
    configArtifacts,
    integration,
    newOwner,
    spinner
  )

  await trackDeployed(
    await getProjectOwnerAddress(ChugSplashManager),
    organizationID,
    projectName,
    networkName,
    integration
  )

  if (isSupportedNetworkOnEtherscan(await getChainId(provider))) {
    const etherscanApiKey = process.env.ETHERSCAN_API_KEY
    if (etherscanApiKey) {
      const canonicalConfig = await readCanonicalConfig(
        provider,
        canonicalConfigPath,
        configUri
      )
      await verifyChugSplashConfig(
        canonicalConfig,
        provider,
        networkName,
        etherscanApiKey
      )
    } else {
      spinner.fail(`No Etherscan API Key detected. Skipped verification.`)
    }
  }

  // At this point, the deployment has been completed.
  if (integration === 'hardhat') {
    if (!(await isLiveNetwork(provider))) {
      // We save the snapshot ID here so that tests on the stand-alone Hardhat network can be run
      // against the most recently deployed contracts.
      await writeSnapshotId(provider, networkName, deploymentFolder)
    }

    displayDeploymentTable(parsedConfig, integration, cre.silent)
    spinner.info(
      "Thank you for using ChugSplash! We'd love to see you in the Discord: https://discord.gg/7Gc3DK33Np"
    )
  } else {
    return generateFoundryTestArtifacts(parsedConfig)
  }
}

export const chugsplashCancelAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const networkName = await resolveNetworkName(provider, integration)

  const unvalidatedConfig = await readUnvalidatedChugSplashConfig(configPath)
  const { projectName, organizationID } = unvalidatedConfig.options

  const spinner = ora({ stream: cre.stream })
  spinner.start(`Cancelling ${projectName} on ${networkName}.`)
  const ChugSplashManager = getChugSplashManager(signer, organizationID)

  if (!(await isProjectClaimed(signer, ChugSplashManager.address))) {
    await errorProjectNotClaimed(provider, configPath, integration)
  }

  const projectOwnerAddress = await getProjectOwnerAddress(ChugSplashManager)
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
You attempted to cancel the project using the address: ${await signer.getAddress()}`)
  }

  const activeDeploymentId = await ChugSplashManager.activeDeploymentId()

  if (activeDeploymentId === ethers.constants.HashZero) {
    spinner.fail(
      `${projectName} is not an active project, so there is nothing to cancel.`
    )
    return
  }

  await (
    await ChugSplashManager.cancelActiveChugSplashDeployment(
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Cancelled ${projectName} on ${networkName}.`)
  spinner.start(`Refunding the project owner...`)

  const prevOwnerBalance = await signer.getBalance()
  await (
    await ChugSplashManager.withdrawOwnerETH(
      await getGasPriceOverrides(provider)
    )
  ).wait()
  const refund = (await signer.getBalance()).sub(prevOwnerBalance)

  await trackCancel(
    await getProjectOwnerAddress(ChugSplashManager),
    organizationID,
    projectName,
    networkName,
    integration
  )

  spinner.succeed(
    `Refunded ${formatEther(
      refund,
      4
    )} ETH on ${networkName} to the project owner: ${await signer.getAddress()}.`
  )
}

export const chugsplashListProjectsAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const networkName = await resolveNetworkName(provider, integration)
  const signerAddress = await signer.getAddress()

  const spinner = ora({ stream: cre.stream })
  spinner.start(`Getting projects on ${networkName} owned by: ${signerAddress}`)

  const ChugSplashRegistry = getChugSplashRegistry(signer)

  const projectClaimedEvents = await ChugSplashRegistry.queryFilter(
    ChugSplashRegistry.filters.ChugSplashProjectClaimed()
  )

  const projects = {}
  let numProjectsOwned = 0
  for (const event of projectClaimedEvents) {
    if (event.args === undefined) {
      throw new Error(
        `No event args found for ChugSplashProjectClaimed. Should never happen.`
      )
    }

    const ChugSplashManager = getChugSplashManager(
      signer,
      event.args.organizationID
    )
    const projectOwnerAddress = await getProjectOwnerAddress(ChugSplashManager)
    if (projectOwnerAddress === signerAddress) {
      numProjectsOwned += 1
      const hasActiveDeployment =
        (await ChugSplashManager.activeDeploymentId()) !==
        ethers.constants.HashZero
      const totalEthBalance = await provider.getBalance(
        ChugSplashManager.address
      )
      const ownerBalance = await getOwnerWithdrawableAmount(
        provider,
        event.args.organizationID
      )

      const formattedTotalEthBalance = totalEthBalance.gt(0)
        ? formatEther(totalEthBalance, 4)
        : 0
      const formattedOwnerBalance = ownerBalance.gt(0)
        ? formatEther(ownerBalance, 4)
        : 0

      projects[numProjectsOwned] = {
        'Organization ID': event.args.organizationID,
        'Is Active': hasActiveDeployment ? 'Yes' : 'No',
        "Project Owner's ETH": formattedOwnerBalance,
        'Total ETH Stored': formattedTotalEthBalance,
      }
    }
  }

  await trackListProjects(signerAddress, networkName, integration)

  if (numProjectsOwned > 0) {
    spinner.succeed(
      `Retrieved all projects on ${networkName} owned by: ${signerAddress}`
    )
    console.table(projects)
  } else {
    spinner.fail(`No projects on ${networkName} owned by: ${signerAddress}`)
  }
}

export const chugsplashExportProxyAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  referenceName: string,
  integration: Integration,
  parsedConfig: ParsedChugSplashConfig,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const { projectName, organizationID } = parsedConfig.options

  const manager = getChugSplashManager(signer, organizationID)

  // Throw an error if the project has not been claimed
  if ((await isProjectClaimed(signer, manager.address)) === false) {
    await errorProjectNotClaimed(provider, configPath, integration)
  }

  const owner = await getProjectOwnerAddress(manager)

  const signerAddress = await signer.getAddress()
  if (owner !== signerAddress) {
    throw new Error(
      `Caller does not own the project ${parsedConfig.options.projectName}`
    )
  }

  spinner.succeed('Project registration detected')
  spinner.start('Claiming proxy ownership...')

  const activeDeploymentId = await manager.activeDeploymentId()
  if (activeDeploymentId !== ethers.constants.HashZero) {
    throw new Error(
      `A project is currently being executed. Proxy ownership has not been transferred.
  Please wait a couple of minutes before trying again.`
    )
  }

  await (
    await manager.exportProxy(
      parsedConfig.contracts[referenceName].address,
      contractKindHashes[parsedConfig.contracts[referenceName].kind],
      signerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  const networkName = await resolveNetworkName(provider, integration)
  await trackExportProxy(
    await getProjectOwnerAddress(manager),
    organizationID,
    projectName,
    networkName,
    integration
  )

  spinner.succeed(`Proxy ownership claimed by address ${signerAddress}`)
}

export const chugsplashImportProxyAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  proxy: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const parsedConfig = await readUnvalidatedChugSplashConfig(configPath)
  const { projectName, organizationID } = parsedConfig.options
  const ChugSplashManager = getChugSplashManager(signer, organizationID)

  // Throw an error if the project has not been claimed
  if ((await isProjectClaimed(signer, ChugSplashManager.address)) === false) {
    await errorProjectNotClaimed(provider, configPath, integration)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Checking proxy compatibility...')

  const networkName = await resolveNetworkName(provider, integration)
  if ((await provider.getCode(proxy)) === '0x') {
    throw new Error(`Proxy is not deployed on ${networkName}: ${proxy}`)
  }

  if (
    (await isInternalDefaultProxy(provider, proxy)) === false &&
    (await isTransparentProxy(provider, proxy)) === false &&
    (await isUUPSProxy(provider, proxy)) === false
  ) {
    throw new Error(`ChugSplash does not support your proxy type.
Currently ChugSplash only supports UUPS and Transparent proxies that implement EIP-1967 which yours does not appear to do.
If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.`)
  }

  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxy)

  // If proxy owner is already ChugSplash, then throw an error
  if (
    ethers.utils.getAddress(ChugSplashManager.address) ===
    ethers.utils.getAddress(ownerAddress)
  ) {
    throw new Error('Proxy is already owned by ChugSplash')
  }

  // If the signer doesn't own the proxy, then throw an error
  const signerAddress = await signer.getAddress()
  if (
    ethers.utils.getAddress(ownerAddress) !==
    ethers.utils.getAddress(signerAddress)
  ) {
    throw new Error(`Proxy is owned by: ${ownerAddress}.
  You attempted to transfer ownership of the proxy using the address: ${signerAddress}`)
  }

  spinner.succeed('Proxy compatibility verified')
  spinner.start('Transferring proxy ownership to ChugSplash...')

  // Transfer ownership of the proxy to the ChugSplashManager.
  const Proxy = new ethers.Contract(proxy, ProxyABI, signer)
  await (
    await Proxy.changeAdmin(
      ChugSplashManager.address,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  await trackImportProxy(
    await getProjectOwnerAddress(ChugSplashManager),
    organizationID,
    projectName,
    networkName,
    integration
  )

  spinner.succeed('Proxy ownership successfully transferred to ChugSplash')
}

export const proposeChugSplashDeployment = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  bundles: ChugSplashBundles,
  configUri: string,
  remoteExecution: boolean,
  ipfsUrl: string,
  spinner: ora.Ora = ora({ isSilent: true }),
  configArtifacts: ConfigArtifacts,
  canonicalConfigPath: string,
  integration: Integration,
  shouldRelay: boolean
) => {
  const { projectName, organizationID } = parsedConfig.options
  const ChugSplashManager = getChugSplashManager(signer, organizationID)
  const signerAddress = await signer.getAddress()

  spinner.start(`Checking if the caller is a proposer...`)

  // Throw an error if the caller isn't the project owner or a proposer.
  if (!(await ChugSplashManager.isProposer(signerAddress))) {
    throw new Error(
      `Caller is not a proposer for this project. Caller's address: ${signerAddress}`
    )
  }

  spinner.succeed(`Caller is a proposer.`)

  spinner.start(`Proposing ${projectName}...`)

  const deploymentId = computeDeploymentId(
    bundles.actionBundle.root,
    bundles.targetBundle.root,
    bundles.actionBundle.actions.length,
    bundles.targetBundle.targets.length,
    getDeployContractActions(bundles.actionBundle).length,
    configUri
  )

  if (remoteExecution) {
    await chugsplashCommitAbstractSubtask(
      provider,
      parsedConfig,
      ipfsUrl,
      true,
      configArtifacts,
      canonicalConfigPath,
      integration,
      spinner
    )

    // Verify that the deployment has been committed to IPFS with the correct bundle hash.
    await verifyDeployment(provider, configUri, deploymentId, ipfsUrl)
  }

  // Propose the deployment.
  if (shouldRelay) {
    if (!process.env.PRIVATE_KEY) {
      throw new Error(
        'Must provide a PRIVATE_KEY environment variable to sign gasless proposal transactions'
      )
    }

    if (!process.env.CHUGSPLASH_API_KEY) {
      throw new Error(
        'Must provide a CHUGSPLASH_API_KEY environment variable to use gasless proposals'
      )
    }

    const { signature, request } = await signMetaTxRequest(
      provider,
      process.env.PRIVATE_KEY,
      {
        from: signerAddress,
        to: ChugSplashManager.address,
        data: ChugSplashManager.interface.encodeFunctionData(
          'gaslesslyPropose',
          [
            bundles.actionBundle.root,
            bundles.targetBundle.root,
            bundles.actionBundle.actions.length,
            bundles.targetBundle.targets.length,
            getDeployContractActions(bundles.actionBundle).length,
            configUri,
            remoteExecution,
          ]
        ),
      }
    )

    // Send the signed meta transaction to the ChugSplashManager via relay
    if (process.env.LOCAL_TEST_METATX_PROPOSE !== 'true') {
      const estimatedCost = await estimateExecutionGas(
        provider,
        bundles,
        0,
        parsedConfig
      )
      await relaySignedRequest(
        signature,
        request,
        parsedConfig.options.organizationID,
        deploymentId,
        parsedConfig.options.projectName,
        provider.network.chainId,
        estimatedCost
      )
    }

    // Returning these values allows us to test meta transactions locally
    return { signature, request, deploymentId }
  } else {
    await (
      await ChugSplashManager.propose(
        bundles.actionBundle.root,
        bundles.targetBundle.root,
        bundles.actionBundle.actions.length,
        bundles.targetBundle.targets.length,
        getDeployContractActions(bundles.actionBundle).length,
        configUri,
        remoteExecution,
        await getGasPriceOverrides(provider)
      )
    ).wait()
  }

  const networkName = await resolveNetworkName(provider, integration)
  await trackProposed(
    await getProjectOwnerAddress(ChugSplashManager),
    organizationID,
    projectName,
    networkName,
    integration
  )

  spinner.succeed(`Proposed ${projectName}.`)
}
