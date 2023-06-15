import process from 'process'

import * as dotenv from 'dotenv'
import { ethers, providers } from 'ethers'
import ora from 'ora'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { ProxyABI } from '@chugsplash/contracts'

import {
  CanonicalChugSplashConfig,
  ChugSplashInput,
  ParsedChugSplashConfig,
  contractKindHashes,
  UserChugSplashConfig,
  ConfigArtifacts,
  ConfigCache,
} from '../config/types'
import {
  getDeploymentId,
  displayDeploymentTable,
  formatEther,
  getChugSplashManager,
  getChugSplashRegistry,
  getDeploymentEvents,
  getEIP1967ProxyAdminAddress,
  getGasPriceOverrides,
  isProjectClaimed,
  finalizeRegistration,
  writeCanonicalConfig,
  writeSnapshotId,
  transferProjectOwnership,
  isHardhatFork,
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
  executeDeployment,
  getNumDeployContractActions,
  makeBundlesFromConfig,
  writeDeploymentArtifacts,
} from '../actions'
import {
  estimateExecutionGas,
  getAmountToDeposit,
  getOwnerWithdrawableAmount,
} from '../fund'
import { monitorExecution } from '../execution'
import { ChugSplashRuntimeEnvironment, ProposalRoute } from '../types'
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
import { readUserChugSplashConfig } from '../config'
import { verifyDeployment } from '../config/fetch'

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

  const { organizationID, projectName } = config.options

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(signer, organizationID)

  await finalizeRegistration(
    registry,
    manager,
    organizationID,
    owner,
    allowManagedProposals,
    provider,
    spinner
  )

  const networkName = await resolveNetworkName(provider, integration)
  const projectOwner = await getChugSplashManager(
    signer,
    organizationID
  ).owner()

  await trackRegistrationFinalized(
    projectOwner,
    organizationID,
    projectName,
    networkName,
    integration
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
  route: ProposalRoute,
  cre: ChugSplashRuntimeEnvironment,
  configCache: ConfigCache
) => {
  const { networkName } = configCache
  const { organizationID, projectName } = parsedConfig.options

  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  if (integration === 'hardhat') {
    spinner.start('Booting up ChugSplash...')
  }

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(
    signer,
    parsedConfig.options.organizationID
  )
  if (!(await isProjectClaimed(registry, manager.address))) {
    errorProjectNotClaimed(organizationID)
  }

  if (integration === 'hardhat') {
    spinner.succeed('ChugSplash is ready to go.')
  }

  const { configUri, bundles } = await getBundleInfo(
    parsedConfig,
    configArtifacts,
    configCache
  )
  const deploymentId = getDeploymentId(bundles, configUri)

  spinner.start(`Checking the status of ${parsedConfig.options.projectName}...`)

  const deploymentState: DeploymentState = await manager.deployments(
    deploymentId
  )

  if (
    deploymentState.status === DeploymentStatus.APPROVED ||
    deploymentState.status === DeploymentStatus.PROXIES_INITIATED
  ) {
    throw new Error(
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
      throw new Error(
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

      const signerAddress = await signer.getAddress()
      const metatxs = await proposeChugSplashDeployment(
        manager,
        deploymentId,
        bundles,
        configUri,
        route,
        signerAddress,
        provider,
        parsedConfig,
        configCache,
        configArtifacts,
        spinner,
        ipfsUrl
      )

      const message = await successfulProposalMessage(
        provider,
        amountToDeposit,
        configPath,
        integration
      )
      spinner.succeed(message)

      await trackProposed(
        await manager.owner(),
        organizationID,
        projectName,
        networkName,
        integration
      )

      return metatxs
    }
  }
}

export const chugsplashCommitAbstractSubtask = async (
  parsedConfig: ParsedChugSplashConfig,
  commitToIpfs: boolean,
  configArtifacts: ConfigArtifacts,
  ipfsUrl?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  configUri: string
  canonicalConfig: CanonicalChugSplashConfig
}> => {
  if (spinner) {
    commitToIpfs
      ? spinner.start(`Committing ${parsedConfig.options.projectName}...`)
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
      `To commit to IPFS, you must first setup an IPFS project with
Infura: https://app.infura.io/. Once you've done this, copy and paste the following
variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const configUri = `ipfs://${ipfsHash}`

  if (spinner) {
    commitToIpfs
      ? spinner.succeed(
          `${parsedConfig.options.projectName} has been committed to IPFS.`
        )
      : spinner.succeed(`Built ${parsedConfig.options.projectName}.`)
  }

  return { configUri, canonicalConfig }
}

export const chugsplashApproveAbstractTask = async (
  configCache: ConfigCache,
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  skipMonitorStatus: boolean,
  configArtifacts: ConfigArtifacts,
  integration: Integration,
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

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(signer, organizationID)

  if (!(await isProjectClaimed(registry, manager.address))) {
    errorProjectNotClaimed(organizationID)
  }

  const { configUri, bundles } = await getBundleInfo(
    parsedConfig,
    configArtifacts,
    configCache
  )

  const deploymentId = getDeploymentId(bundles, configUri)
  const deploymentState: DeploymentState = await manager.deployments(
    deploymentId
  )
  const activeDeploymentId = await manager.activeDeploymentId()
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
    await approveDeployment(deploymentId, manager, signerAddress, provider)

    await trackApproved(
      await manager.owner(),
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
      displayDeploymentTable(parsedConfig, silent)

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
  configCache: ConfigCache,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })

  const { projectName, organizationID } = parsedConfig.options

  const manager = getChugSplashManager(signer, organizationID)
  const registry = getChugSplashRegistry(signer)

  const signerBalance = await signer.getBalance()

  if (!(await isProjectClaimed(registry, manager.address))) {
    errorProjectNotClaimed(organizationID)
  }

  const amountToDeposit = await getAmountToDeposit(
    provider,
    makeBundlesFromConfig(parsedConfig, configArtifacts, configCache),
    0,
    parsedConfig,
    true
  )

  if (signerBalance.lt(amountToDeposit)) {
    throw new Error(`Signer does not have enough funds to deposit.`)
  }

  const txnRequest = await getGasPriceOverrides(provider, {
    value: amountToDeposit,
    to: manager.address,
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
  canonicalConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  configCache: ConfigCache,
  configArtifacts: ConfigArtifacts,
  newOwner?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<void> => {
  const { organizationID, projectName } = parsedConfig.options
  const { networkName, blockGasLimit, localNetwork } = configCache

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(signer, organizationID)

  // Claim the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the user-defined new owner, if it exists.
  const signerAddress = await signer.getAddress()
  await finalizeRegistration(
    registry,
    manager,
    organizationID,
    signerAddress,
    false,
    provider,
    spinner
  )

  spinner.start(`Checking the status of ${projectName}...`)

  const { configUri, bundles, canonicalConfig } = await getBundleInfo(
    parsedConfig,
    configArtifacts,
    configCache
  )

  if (
    bundles.actionBundle.actions.length === 0 &&
    bundles.targetBundle.targets.length === 0
  ) {
    spinner.succeed(`Nothing to execute in this deployment. Exiting early.`)
    return
  }

  const deploymentId = getDeploymentId(bundles, configUri)
  const deploymentState: DeploymentState = await manager.deployments(
    deploymentId
  )
  const initialDeploymentStatus = deploymentState.status
  let currDeploymentStatus = deploymentState.status

  if (currDeploymentStatus === DeploymentStatus.CANCELLED) {
    throw new Error(
      `${projectName} was previously cancelled on ${networkName}.`
    )
  }

  if (currDeploymentStatus === DeploymentStatus.EMPTY) {
    spinner.succeed(`${projectName} has not been proposed before.`)
    spinner.start(`Proposing ${projectName}...`)
    await proposeChugSplashDeployment(
      manager,
      deploymentId,
      bundles,
      configUri,
      ProposalRoute.LOCAL_EXECUTION,
      signerAddress,
      provider,
      parsedConfig,
      configCache,
      configArtifacts,
      spinner
    )
    currDeploymentStatus = DeploymentStatus.PROPOSED
  }

  if (currDeploymentStatus === DeploymentStatus.PROPOSED) {
    await (
      await manager.approve(deploymentId, await getGasPriceOverrides(provider))
    ).wait()
    currDeploymentStatus = DeploymentStatus.APPROVED
  }

  if (
    currDeploymentStatus === DeploymentStatus.APPROVED ||
    currDeploymentStatus === DeploymentStatus.PROXIES_INITIATED
  ) {
    spinner.start(`Executing ${projectName}...`)

    const success = await executeDeployment(
      manager,
      bundles,
      blockGasLimit,
      configArtifacts,
      provider
    )

    if (!success) {
      throw new Error(
        `Failed to execute ${projectName}, likely because one of the user's constructors reverted during the deployment.`
      )
    }
  }

  initialDeploymentStatus === DeploymentStatus.COMPLETED
    ? spinner.succeed(`${projectName} was already completed on ${networkName}.`)
    : spinner.succeed(`Executed ${projectName}.`)

  if (newOwner) {
    spinner.start(`Transferring ownership to: ${newOwner}`)
    await transferProjectOwnership(
      manager,
      newOwner,
      signerAddress,
      provider,
      spinner
    )
    spinner.succeed(`Transferred ownership to: ${newOwner}`)
  }

  // TODO(post): foundry: this must only be called if the deployment was broadcasted.
  await postDeploymentActions(
    canonicalConfig,
    configArtifacts,
    deploymentId,
    canonicalConfigPath,
    configUri,
    localNetwork,
    networkName,
    deploymentFolder,
    integration,
    cre.silent,
    manager.owner(),
    provider,
    manager,
    spinner,
    process.env.ETHERSCAN_API_KEY
  )
}

// TODO(post): we need to make `provider` an optional parameter. it should be undefined on the in-process
// anvil node, and defined in all other cases, including the stand-alone anvil node.
export const postDeploymentActions = async (
  canonicalConfig: CanonicalChugSplashConfig,
  configArtifacts: ConfigArtifacts,
  deploymentId: string,
  canonicalConfigPath: string,
  configUri: string,
  localNetwork: boolean,
  networkName: string,
  deploymentFolder: string,
  integration: Integration,
  silent: boolean,
  owner: string,
  provider: ethers.providers.JsonRpcProvider,
  manager: ethers.Contract,
  spinner?: ora.Ora,
  etherscanApiKey?: string
) => {
  spinner?.start(`Writing deployment artifacts...`)
  const { projectName, organizationID } = canonicalConfig.options

  if (integration === 'hardhat') {
    writeCanonicalConfig(canonicalConfigPath, configUri, canonicalConfig)
  }

  await trackDeployed(
    owner,
    organizationID,
    projectName,
    networkName,
    integration
  )

  // Only write deployment artifacts if the deployment was completed in the last 150 blocks.
  // This can be anywhere from 5 minutes to half an hour depending on the network
  await writeDeploymentArtifacts(
    provider,
    canonicalConfig,
    await getDeploymentEvents(manager, deploymentId),
    networkName,
    deploymentFolder,
    configArtifacts
  )

  spinner?.succeed(`Wrote deployment artifacts.`)

  // TODO(post): wait to see if Foundry can automatically verify the contracts. It's unlikely because we
  // deploy them in a non-standard way, but it's possible. If foundry can do it, we should just
  // never pass in the `etherscanApiKey`. if foundry can't do it, we should  retrieve the api key
  // via `execAsync(forge config --json)` and pass it in here

  if (isSupportedNetworkOnEtherscan(networkName) && etherscanApiKey) {
    if (etherscanApiKey) {
      await verifyChugSplashConfig(
        canonicalConfig,
        configArtifacts,
        provider,
        networkName,
        etherscanApiKey
      )
    } else {
      spinner?.fail(`No Etherscan API Key detected. Skipped verification.`)
    }
  }

  if (integration === 'hardhat') {
    if (localNetwork || (await isHardhatFork(provider))) {
      // We save the snapshot ID here so that tests on the stand-alone Hardhat network can be run
      // against the most recently deployed contracts.
      await writeSnapshotId(provider, networkName, deploymentFolder)
    }

    displayDeploymentTable(canonicalConfig, silent)
    spinner?.info(
      "Thank you for using ChugSplash! We'd love to see you in the Discord: https://discord.gg/7Gc3DK33Np"
    )
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

  const userConfig = await readUserChugSplashConfig(configPath)
  const { projectName, organizationID } = userConfig.options

  const spinner = ora({ stream: cre.stream })
  spinner.start(`Cancelling ${projectName} on ${networkName}.`)
  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(signer, organizationID)

  if (!(await isProjectClaimed(registry, manager.address))) {
    errorProjectNotClaimed(organizationID)
  }

  const projectOwnerAddress = await manager.owner()
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
You attempted to cancel the project using the address: ${await signer.getAddress()}`)
  }

  const activeDeploymentId = await manager.activeDeploymentId()

  if (activeDeploymentId === ethers.constants.HashZero) {
    spinner.fail(
      `${projectName} is not an active project, so there is nothing to cancel.`
    )
    return
  }

  await (
    await manager.cancelActiveChugSplashDeployment(
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Cancelled ${projectName} on ${networkName}.`)
  spinner.start(`Refunding the project owner...`)

  const prevOwnerBalance = await signer.getBalance()
  await (
    await manager.withdrawOwnerETH(await getGasPriceOverrides(provider))
  ).wait()
  const refund = (await signer.getBalance()).sub(prevOwnerBalance)

  await trackCancel(
    await manager.owner(),
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
    const projectOwnerAddress = await ChugSplashManager.owner()
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

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(signer, organizationID)

  // Throw an error if the project has not been claimed
  if ((await isProjectClaimed(registry, manager.address)) === false) {
    errorProjectNotClaimed(organizationID)
  }

  const projectOwner = await manager.owner()

  const signerAddress = await signer.getAddress()
  if (projectOwner !== signerAddress) {
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
    projectOwner,
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

  const userConfig = await readUserChugSplashConfig(configPath)
  const { projectName, organizationID } = userConfig.options
  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(signer, organizationID)

  // Throw an error if the project has not been claimed
  if ((await isProjectClaimed(registry, manager.address)) === false) {
    errorProjectNotClaimed(organizationID)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Checking proxy compatibility...')

  const networkName = await resolveNetworkName(provider, integration)
  if ((await provider.getCode(proxy)) === '0x') {
    throw new Error(`Proxy is not deployed on ${networkName}: ${proxy}`)
  }

  // TODO: These checks were written when we didn't prompt the user for their proxy type. Now that
  // we do, we should run just the function that corresponds to the proxy type they selected. E.g.
  // if they selected oz-uups, then we should only run `isUUPSProxy`. Also, the
  // `isInternalDefaultProxy` function relies on the `DefaultProxyDeployed` event, which no longer
  // exists. I'm not even sure we need `isInternalDefaultProxy` anymore, so we should first figure
  // that out.
  //   if (
  //     (await isInternalDefaultProxy(provider, proxy)) === false &&
  //     (await isTransparentProxy(provider, proxy)) === false &&
  //     (await isUUPSProxy(provider, proxy)) === false
  //   ) {
  //     throw new Error(`ChugSplash does not support your proxy type.
  // Currently ChugSplash only supports UUPS and Transparent proxies that implement EIP-1967 which yours does not appear to do.
  // If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.`)
  //   }

  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxy)

  // If proxy owner is already ChugSplash, then throw an error
  if (
    ethers.utils.getAddress(manager.address) ===
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
      manager.address,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  await trackImportProxy(
    await manager.owner(),
    organizationID,
    projectName,
    networkName,
    integration
  )

  spinner.succeed('Proxy ownership successfully transferred to ChugSplash')
}

export const proposeChugSplashDeployment = async (
  manager: ethers.Contract,
  deploymentId: string,
  bundles: ChugSplashBundles,
  configUri: string,
  route: ProposalRoute,
  signerAddress: string,
  provider: ethers.providers.JsonRpcProvider,
  parsedConfig: ParsedChugSplashConfig,
  configCache: ConfigCache,
  configArtifacts: ConfigArtifacts,
  spinner: ora.Ora = ora({ isSilent: true }),
  ipfsUrl?: string
) => {
  spinner.start(`Checking if the caller is a proposer...`)
  const { projectName } = parsedConfig.options

  // Throw an error if the caller isn't the project owner or a proposer.
  if (!(await manager.isProposer(signerAddress))) {
    throw new Error(
      `Caller is not a proposer for this project. Caller's address: ${signerAddress}`
    )
  }

  spinner.succeed(`Caller is a proposer.`)

  spinner.start(`Proposing ${projectName}...`)

  if (
    route === ProposalRoute.RELAY ||
    route === ProposalRoute.REMOTE_EXECUTION
  ) {
    await chugsplashCommitAbstractSubtask(
      parsedConfig,
      true,
      configArtifacts,
      ipfsUrl,
      spinner
    )

    // Verify that the deployment has been committed to IPFS with the correct bundle hash.
    await verifyDeployment(
      configUri,
      deploymentId,
      configArtifacts,
      configCache,
      ipfsUrl
    )
  }

  // Propose the deployment.
  if (route === ProposalRoute.RELAY) {
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
        to: manager.address,
        data: manager.interface.encodeFunctionData('gaslesslyPropose', [
          bundles.actionBundle.root,
          bundles.targetBundle.root,
          bundles.actionBundle.actions.length,
          bundles.targetBundle.targets.length,
          getNumDeployContractActions(bundles.actionBundle),
          configUri,
          true,
        ]),
      }
    )

    // Send the signed meta transaction to the ChugSplashManager via relay
    if (process.env.LOCAL_TEST_METATX_PROPOSE !== 'true') {
      const estimatedCost = await estimateExecutionGas(provider, bundles, 0)
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
      await manager.propose(
        bundles.actionBundle.root,
        bundles.targetBundle.root,
        bundles.actionBundle.actions.length,
        bundles.targetBundle.targets.length,
        getNumDeployContractActions(bundles.actionBundle),
        configUri,
        route === ProposalRoute.REMOTE_EXECUTION,
        await getGasPriceOverrides(provider)
      )
    ).wait()
  }

  spinner.succeed(`Proposed ${projectName}.`)
}

export const getBundleInfo = async (
  parsedConfig: ParsedChugSplashConfig,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache
): Promise<{
  configUri: string
  canonicalConfig: CanonicalChugSplashConfig
  bundles: ChugSplashBundles
}> => {
  const { configUri, canonicalConfig } = await chugsplashCommitAbstractSubtask(
    parsedConfig,
    false,
    configArtifacts
  )

  const bundles = makeBundlesFromConfig(
    parsedConfig,
    configArtifacts,
    configCache
  )

  return { configUri, canonicalConfig, bundles }
}

export const approveDeployment = async (
  deploymentId: string,
  manager: ethers.Contract,
  signerAddress: string,
  provider: providers.Provider
) => {
  const projectOwnerAddress = await manager.owner()
  if (signerAddress !== projectOwnerAddress) {
    throw new Error(
      `Caller is not the project owner.\n` +
        `Caller's address: ${signerAddress}\n` +
        `Owner's address: ${projectOwnerAddress}`
    )
  }

  await (
    await manager.approve(deploymentId, await getGasPriceOverrides(provider))
  ).wait()
}
