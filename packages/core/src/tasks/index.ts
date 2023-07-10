import process from 'process'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import ora from 'ora'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { ProxyABI } from '@chugsplash/contracts'

import {
  ChugSplashInput,
  contractKindHashes,
  ParsedProjectConfig,
  ProjectConfigArtifacts,
  ProjectConfigCache,
  CanonicalProjectConfig,
  CanonicalOrgConfig,
  ParsedProjectConfigs,
  GetConfigArtifacts,
  ParsedOrgConfig,
  GetProviderForChainId,
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
  isProjectRegistered,
  register,
  writeCanonicalConfig,
  writeSnapshotId,
  transferProjectOwnership,
  isHardhatFork,
  getOrgConfigInfo,
  relayProposal,
  relayIPFSCommit,
} from '../utils'
import {
  ensureChugSplashInitialized,
  getMinimumCompilerInput,
} from '../languages'
import { Integration } from '../constants'
import { resolveNetworkName } from '../messages'
import {
  ChugSplashBundles,
  DeploymentState,
  DeploymentStatus,
  ProposalRequestLeaf,
  RoleType,
  executeDeployment,
  getAuthLeafSignerInfo,
  getNumDeployContractActions,
  makeAuthBundle,
  makeBundlesFromConfig,
  writeDeploymentArtifacts,
  ProposalRequest,
  AuthLeaf,
  ProjectDeployments,
  getProjectDeploymentsForChain,
  getAuthLeafsForChain,
} from '../actions'
import { getAmountToDeposit } from '../fund'
import { monitorExecution } from '../execution'
import { ChugSplashRuntimeEnvironment, FailureAction } from '../types'
import {
  trackApproved,
  trackCancel,
  trackExportProxy,
  trackDeployed,
  trackRegistrationFinalized,
  trackImportProxy,
} from '../analytics'
import {
  isSupportedNetworkOnEtherscan,
  verifyChugSplashConfig,
} from '../etherscan'
import { getAuthAddress, getChugSplashManagerAddress } from '../addresses'
import { signAuthRootMetaTxn } from '../metatxs'
import { readUserChugSplashConfig } from '../config/config'
import { getParsedOrgConfig } from '../config/parse'

// Load environment variables from .env
dotenv.config()

export const registerOwner = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  ownerAddress: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })

  const deployer = getChugSplashManagerAddress(ownerAddress)

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  await register(registry, manager, ownerAddress, provider, spinner)

  const networkName = await resolveNetworkName(provider, integration)
  const projectOwner = await getChugSplashManager(deployer, signer).owner()

  await trackRegistrationFinalized(projectOwner, networkName, integration)
}

export const proposeAbstractTask = async (
  configPath: string,
  projectName: string,
  cre: ChugSplashRuntimeEnvironment,
  getConfigArtifacts: GetConfigArtifacts,
  getProviderForChainId: GetProviderForChainId,
  spinner: ora.Ora = ora({ isSilent: true }),
  failureAction: FailureAction = FailureAction.EXIT
) => {
  const apiKey = process.env.CHUGSPLASH_API_KEY
  if (!apiKey) {
    throw new Error(`Must provide a 'CHUGSPLASH_API_KEY' environment variable.`)
  }

  const privateKey = process.env.PROPOSER_PRIVATE_KEY
  if (!privateKey) {
    throw new Error(
      `Must provide a 'PROPOSER_PRIVATE_KEY' environment variable.`
    )
  }
  const wallet = new ethers.Wallet(privateKey)
  const signerAddress = await wallet.getAddress()

  const userConfig = await readUserChugSplashConfig(configPath)

  const { isNewConfig, chainIds, prevOrgConfig } = await getOrgConfigInfo(
    userConfig,
    projectName,
    apiKey,
    cre,
    failureAction
  )

  // Next, we parse and validate the config for each chain ID. This is necessary to ensure that
  // there aren't any network-specific errors that are caused by the config. These errors would most
  // likely occur in the `postParsingValidation` function that's a few calls inside of
  // `getParsedOrgConfig`. Note that the parsed config will be the same on each chain ID because the
  // network-specific validation does not change any fields in the parsed config. Likewise, the
  // `ConfigArtifacts` object will be the same on each chain. The only thing that will change is the
  // `ConfigCache` object.
  let parsedConfig: ParsedOrgConfig | undefined
  const leafs: Array<AuthLeaf> = []
  const projectDeployments: Array<ProjectDeployments> = []
  const canonicalProjectConfigs: {
    [ipfsHash: string]: CanonicalProjectConfig
  } = {}
  // We loop through any logic that depends on the provider object.
  for (const chainId of chainIds) {
    const provider = getProviderForChainId(chainId)

    await ensureChugSplashInitialized(provider, wallet.connect(provider))

    const parsedOrgConfigValues = await getParsedOrgConfig(
      userConfig,
      projectName,
      prevOrgConfig.deployer,
      provider,
      cre,
      getConfigArtifacts,
      failureAction
    )

    parsedConfig = parsedOrgConfigValues.parsedConfig
    const configArtifacts = parsedOrgConfigValues.configArtifacts
    const configCache = parsedOrgConfigValues.configCache

    const { firstProposalOccurred } = prevOrgConfig.chainStates[chainId]

    if (
      firstProposalOccurred &&
      !prevOrgConfig.options.proposers.includes(signerAddress)
    ) {
      throw new Error(
        `Signer is not currently a proposer on chain ${chainId}. Signer's address: ${signerAddress}\n` +
          `Current proposers: ${prevOrgConfig.options.proposers.map(
            (proposer) => `\n- ${proposer}`
          )}`
      )
    }

    if (
      !firstProposalOccurred &&
      !parsedConfig.options.proposers.includes(signerAddress)
    ) {
      throw new Error(
        `Signer must be a proposer in the config file. Signer's address: ${signerAddress}`
      )
    }

    const leafsForChain = await getAuthLeafsForChain(
      chainId,
      parsedConfig,
      configArtifacts,
      configCache,
      prevOrgConfig
    )
    leafs.push(...leafsForChain)

    const projectDeploymentsForChain = await getProjectDeploymentsForChain(
      leafs,
      chainId,
      parsedConfig.projects,
      configArtifacts,
      configCache
    )
    projectDeployments.push(...projectDeploymentsForChain)

    const { canonicalConfig, configUri } = await getProjectBundleInfo(
      parsedConfig.projects[projectName],
      configArtifacts[projectName],
      configCache[projectName]
    )
    canonicalProjectConfigs[configUri] = canonicalConfig
  }

  // This removes a TypeScript error that occurs because TypeScript doesn't know that the
  // `parsedConfig` variable is defined.
  if (!parsedConfig) {
    throw new Error('No parsed config found. Should never happen')
  }

  const { orgId } = parsedConfig.options

  if (!isNewConfig && orgId !== prevOrgConfig.options.orgId) {
    throw new Error(
      `Organization ID cannot be changed.\n` +
        `Previous: ${prevOrgConfig.options.orgId}\n` +
        `New: ${orgId}`
    )
  }

  const chainIdToNumLeafs: { [chainId: number]: number } = {}
  for (const leaf of leafs) {
    const { chainId } = leaf
    if (!chainIdToNumLeafs[chainId]) {
      chainIdToNumLeafs[chainId] = 0
    }
    chainIdToNumLeafs[chainId] += 1
  }

  const chainStatus = Object.entries(chainIdToNumLeafs).map(
    ([chainId, numLeaves]) => ({
      chainId: parseInt(chainId, 10),
      numLeaves,
    })
  )

  const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

  const metaTxnSignature = await signAuthRootMetaTxn(wallet, root)

  const proposalRequestLeafs: Array<ProposalRequestLeaf> = []
  for (const bundledLeaf of bundledLeafs) {
    const { leaf, prettyLeaf, proof } = bundledLeaf
    const { chainId, index, to, leafType } = prettyLeaf
    const { data } = leaf

    const { firstProposalOccurred } = prevOrgConfig.chainStates[chainId]
    const { projectCreated } =
      prevOrgConfig.chainStates[chainId].projects[projectName]

    let orgOwners: string[]
    let proposers: string[]
    let managers: string[]
    let orgThreshold: number
    if (firstProposalOccurred) {
      ;({ orgOwners, proposers, managers, orgThreshold } =
        prevOrgConfig.options)
    } else {
      ;({ orgOwners, proposers, managers, orgThreshold } = parsedConfig.options)
    }

    let projectOwners: string[] | undefined
    let projectThreshold: number | undefined
    if (firstProposalOccurred && projectCreated) {
      ;({ projectOwners, projectThreshold } =
        prevOrgConfig.projects[projectName].options)
    } else {
      ;({ projectOwners, projectThreshold } =
        parsedConfig.projects[projectName].options)
    }

    if (!projectOwners || !projectThreshold) {
      throw new Error(
        `Project owners or project threshold is not defined. Should never happen.`
      )
    }

    const { threshold, roleType } = getAuthLeafSignerInfo(
      orgThreshold,
      projectThreshold,
      leafType
    )

    let signerAddresses: string[]
    if (roleType === RoleType.ORG_OWNER) {
      signerAddresses = orgOwners
    } else if (roleType === RoleType.PROPOSER) {
      signerAddresses = proposers
    } else if (roleType === RoleType.MANAGER) {
      signerAddresses = managers
    } else if (roleType === RoleType.PROJECT_OWNER) {
      signerAddresses = projectOwners
    } else {
      throw new Error(`Invalid role type: ${roleType}`)
    }

    const signers = signerAddresses.map((addr) => {
      const signature = addr === signerAddress ? metaTxnSignature : undefined
      return { address: addr, signature }
    })

    proposalRequestLeafs.push({
      chainId,
      index,
      to,
      leafType,
      data,
      siblings: proof,
      threshold,
      signers,
    })
  }

  const chainStates: CanonicalOrgConfig['chainStates'] = {}
  for (const chainId of chainIds) {
    chainStates[chainId] = {
      firstProposalOccurred: true,
      projects: {
        [projectName]: {
          projectCreated: true,
        },
      },
    }
  }

  const canonicalOrgConfig: CanonicalOrgConfig = {
    deployer: prevOrgConfig.deployer,
    options: parsedConfig.options,
    projects: parsedConfig.projects,
    chainStates,
  }

  const authAddress = getAuthAddress(
    canonicalOrgConfig.options.orgOwners,
    canonicalOrgConfig.options.orgThreshold
  )
  const deployerAddress = getChugSplashManagerAddress(authAddress)

  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId,
    chainIds,
    orgOwners: canonicalOrgConfig.options.orgOwners,
    orgOwnerThreshold: canonicalOrgConfig.options.orgThreshold,
    authAddress,
    deployerAddress,
    orgCanonicalConfig: JSON.stringify(canonicalOrgConfig),
    projectDeployments,
    orgTree: {
      root,
      chainStatus,
      leaves: proposalRequestLeafs,
    },
  }

  await relayProposal(proposalRequest)

  const canonicalProjectConfigArray = Object.values(canonicalProjectConfigs)

  await relayIPFSCommit(apiKey, orgId, canonicalProjectConfigArray)

  spinner.succeed(`Proposed ${projectName}!`)
}

export const chugsplashCommitAbstractSubtask = async (
  parsedProjectConfig: ParsedProjectConfig,
  commitToIpfs: boolean,
  projectConfigArtifacts: ProjectConfigArtifacts,
  ipfsUrl?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  configUri: string
  canonicalConfig: CanonicalProjectConfig
}> => {
  const { project } = parsedProjectConfig.options
  if (spinner) {
    commitToIpfs
      ? spinner.start(`Committing ${project}...`)
      : spinner.start('Building the project...')
  }

  const chugsplashInputs: Array<ChugSplashInput> = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedProjectConfig.contracts
  )) {
    const { buildInfo } = projectConfigArtifacts[referenceName]

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

  const canonicalConfig: CanonicalProjectConfig = {
    ...parsedProjectConfig,
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
      ? spinner.succeed(`${project} has been committed to IPFS.`)
      : spinner.succeed(`Built ${project}.`)
  }

  return { configUri, canonicalConfig }
}

export const chugsplashApproveAbstractTask = async (
  projectConfigCache: ProjectConfigCache,
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  skipMonitorStatus: boolean,
  projectConfigArtifacts: ProjectConfigArtifacts,
  integration: Integration,
  parsedProjectConfig: ParsedProjectConfig,
  cre: ChugSplashRuntimeEnvironment
) => {
  const { silent, stream } = cre
  const networkName = await resolveNetworkName(provider, integration)

  const spinner = ora({ isSilent: silent, stream })
  const { project, deployer } = parsedProjectConfig.options
  spinner.start(`Approving ${project} on ${networkName}...`)

  const signerAddress = await signer.getAddress()

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  if (!(await isProjectRegistered(registry, manager.address))) {
    throw new Error(`${project} has not been registered yet.`)
  }

  const { configUri, bundles } = await getProjectBundleInfo(
    parsedProjectConfig,
    projectConfigArtifacts,
    projectConfigCache
  )

  const deploymentId = getDeploymentId(bundles, configUri, project)
  const deploymentState: DeploymentState = await manager.deployments(
    deploymentId
  )
  const activeDeploymentId = await manager.activeDeploymentId()
  if (deploymentState.status === DeploymentStatus.APPROVED) {
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
  } else if (deploymentState.status === DeploymentStatus.EMPTY) {
    await approveDeployment(
      project,
      bundles,
      configUri,
      manager,
      signerAddress,
      provider
    )

    await trackApproved(await manager.owner(), networkName, integration)

    spinner.succeed(`${project} approved on ${networkName}.`)

    if (!skipMonitorStatus) {
      await monitorExecution(
        provider,
        signer,
        parsedProjectConfig,
        bundles,
        deploymentId,
        spinner
      )
      displayDeploymentTable(parsedProjectConfig, silent)

      spinner.succeed(`${project} successfully deployed on ${networkName}.`)
    }
  }
}

export const chugsplashFundAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configArtifacts: ProjectConfigArtifacts,
  parsedConfig: ParsedProjectConfig,
  configCache: ProjectConfigCache,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })

  const { project, deployer } = parsedConfig.options

  const manager = getChugSplashManager(deployer, signer)
  const registry = getChugSplashRegistry(signer)

  const signerBalance = await signer.getBalance()

  if (!(await isProjectRegistered(registry, manager.address))) {
    throw new Error(`${project} has not been registered yet.`)
  }

  const amountToDeposit = await getAmountToDeposit(
    provider,
    makeBundlesFromConfig(parsedConfig, configArtifacts, configCache[project]),
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
    )} ETH for the project: ${project}.`
  )
}

export const chugsplashDeployAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  canonicalConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment,
  parsedProjectConfig: ParsedProjectConfig,
  projectConfigCache: ProjectConfigCache,
  projectConfigArtifacts: ProjectConfigArtifacts,
  newOwner?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<void> => {
  const { project, deployer } = parsedProjectConfig.options
  const { networkName, blockGasLimit, localNetwork } = projectConfigCache

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the user-defined new owner, if it exists.
  const signerAddress = await signer.getAddress()
  await register(registry, manager, signerAddress, provider, spinner)

  spinner.start(`Checking the status of ${project}...`)

  const { configUri, bundles, canonicalConfig } = await getProjectBundleInfo(
    parsedProjectConfig,
    projectConfigArtifacts,
    projectConfigCache
  )

  if (
    bundles.actionBundle.actions.length === 0 &&
    bundles.targetBundle.targets.length === 0
  ) {
    spinner.succeed(`Nothing to execute in this deployment. Exiting early.`)
    return
  }

  const deploymentId = getDeploymentId(bundles, configUri, project)
  const deploymentState: DeploymentState = await manager.deployments(
    deploymentId
  )
  const initialDeploymentStatus = deploymentState.status
  let currDeploymentStatus = deploymentState.status

  if (currDeploymentStatus === DeploymentStatus.CANCELLED) {
    throw new Error(`${project} was previously cancelled on ${networkName}.`)
  }

  for (const [referenceName, contractConfig] of Object.entries(
    parsedProjectConfig.contracts
  )) {
    if (contractConfig.isUserDefinedAddress) {
      const existingProjectName =
        projectConfigCache.contractConfigCache[referenceName]
          .existingProjectName

      if (existingProjectName !== project) {
        await manager.transferContractToProject(
          contractConfig.address,
          project,
          await getGasPriceOverrides(provider)
        )
      }
    }
  }

  if (currDeploymentStatus === DeploymentStatus.EMPTY) {
    spinner.succeed(`${project} has not been deployed before.`)
    spinner.start(`Approving ${project}...`)
    await (
      await manager.approve(
        project,
        bundles.actionBundle.root,
        bundles.targetBundle.root,
        bundles.actionBundle.actions.length,
        bundles.targetBundle.targets.length,
        getNumDeployContractActions(bundles.actionBundle),
        configUri,
        false,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    currDeploymentStatus = DeploymentStatus.APPROVED
    spinner.succeed(`Approved ${project}.`)
  }

  if (
    currDeploymentStatus === DeploymentStatus.APPROVED ||
    currDeploymentStatus === DeploymentStatus.PROXIES_INITIATED
  ) {
    spinner.start(`Executing ${project}...`)

    const success = await executeDeployment(
      manager,
      bundles,
      blockGasLimit,
      projectConfigArtifacts,
      provider
    )

    if (!success) {
      throw new Error(
        `Failed to execute ${project}, likely because one of the user's constructors reverted during the deployment.`
      )
    }
  }

  initialDeploymentStatus === DeploymentStatus.COMPLETED
    ? spinner.succeed(`${project} was already completed on ${networkName}.`)
    : spinner.succeed(`Executed ${project}.`)

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
    projectConfigArtifacts,
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
  canonicalProjectConfig: CanonicalProjectConfig,
  projectConfigArtifacts: ProjectConfigArtifacts,
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

  if (integration === 'hardhat') {
    writeCanonicalConfig(canonicalConfigPath, configUri, canonicalProjectConfig)
  }

  await trackDeployed(owner, networkName, integration)

  // Only write deployment artifacts if the deployment was completed in the last 150 blocks.
  // This can be anywhere from 5 minutes to half an hour depending on the network
  await writeDeploymentArtifacts(
    provider,
    canonicalProjectConfig,
    await getDeploymentEvents(manager, deploymentId),
    networkName,
    deploymentFolder,
    projectConfigArtifacts
  )

  spinner?.succeed(`Wrote deployment artifacts.`)

  // TODO(post): wait to see if Foundry can automatically verify the contracts. It's unlikely because we
  // deploy them in a non-standard way, but it's possible. If foundry can do it, we should just
  // never pass in the `etherscanApiKey`. if foundry can't do it, we should  retrieve the api key
  // via `execAsync(forge config --json)` and pass it in here

  if (isSupportedNetworkOnEtherscan(networkName) && etherscanApiKey) {
    if (etherscanApiKey) {
      await verifyChugSplashConfig(
        canonicalProjectConfig,
        projectConfigArtifacts,
        provider,
        networkName,
        etherscanApiKey
      )
    } else {
      spinner?.fail(`No Etherscan API Key detected. Skipped verification.`)
    }
  }

  if (integration === 'hardhat') {
    try {
      if (localNetwork || (await isHardhatFork(provider))) {
        // We save the snapshot ID here so that tests on the stand-alone Hardhat network can be run
        // against the most recently deployed contracts.
        await writeSnapshotId(provider, networkName, deploymentFolder)
      }
    } catch (e) {
      if (!e.message.includes('hardhat_metadata')) {
        throw e
      }
    }

    displayDeploymentTable(canonicalProjectConfig, silent)
    spinner?.info(
      "Thank you for using ChugSplash! We'd love to see you in the Discord: https://discord.gg/7Gc3DK33Np"
    )
  }
}

export const chugsplashCancelAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  owner: ethers.Signer,
  projectName: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const networkName = await resolveNetworkName(provider, integration)

  const ownerAddress = await owner.getAddress()
  const deployer = getChugSplashManagerAddress(ownerAddress)

  const spinner = ora({ stream: cre.stream })
  spinner.start(`Cancelling deployment for ${projectName} on ${networkName}.`)
  const registry = getChugSplashRegistry(owner)
  const manager = getChugSplashManager(deployer, owner)

  if (!(await isProjectRegistered(registry, manager.address))) {
    throw new Error(`Project has not been registered yet.`)
  }

  const currOwner = await manager.owner()
  if (currOwner !== ownerAddress) {
    throw new Error(`Project is owned by: ${currOwner}.
You attempted to cancel the project using the address: ${await owner.getAddress()}`)
  }

  const activeDeploymentId = await manager.activeDeploymentId()

  if (activeDeploymentId === ethers.constants.HashZero) {
    spinner.fail(
      `${projectName} does not have an active project, so there is nothing to cancel.`
    )
    return
  }

  await (
    await manager.cancelActiveChugSplashDeployment(
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Cancelled deployment for ${projectName} on ${networkName}.`)

  await trackCancel(await manager.owner(), networkName, integration)
}

export const chugsplashExportProxyAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  owner: ethers.Signer,
  projectName: string,
  referenceName: string,
  integration: Integration,
  projectConfigs: ParsedProjectConfigs,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const ownerAddress = await owner.getAddress()
  const deployer = getChugSplashManagerAddress(ownerAddress)

  const registry = getChugSplashRegistry(owner)
  const manager = getChugSplashManager(deployer, owner)

  // Throw an error if the project has not been registered
  if ((await isProjectRegistered(registry, manager.address)) === false) {
    throw new Error(`Project has not been registered yet.`)
  }

  const projectOwner = await manager.owner()

  const signerAddress = await owner.getAddress()
  if (projectOwner !== signerAddress) {
    throw new Error(`Caller does not own the organization.`)
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

  const targetContract = projectConfigs[projectName].contracts[referenceName]
  await (
    await manager.exportProxy(
      targetContract.address,
      contractKindHashes[targetContract.kind],
      signerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  const networkName = await resolveNetworkName(provider, integration)
  await trackExportProxy(projectOwner, networkName, integration)

  spinner.succeed(`Proxy ownership claimed by address ${signerAddress}`)
}

export const chugsplashImportProxyAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  proxy: string,
  integration: Integration,
  owner: string,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const deployer = getChugSplashManagerAddress(owner)
  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  // Throw an error if the project has not been registered
  if ((await isProjectRegistered(registry, manager.address)) === false) {
    throw new Error(`Project has not been registered yet.`)
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

  await trackImportProxy(await manager.owner(), networkName, integration)

  spinner.succeed('Proxy ownership successfully transferred to ChugSplash')
}

export const getProjectBundleInfo = async (
  parsedProjectConfig: ParsedProjectConfig,
  projectConfigArtifacts: ProjectConfigArtifacts,
  projectConfigCache: ProjectConfigCache
): Promise<{
  configUri: string
  canonicalConfig: CanonicalProjectConfig
  bundles: ChugSplashBundles
}> => {
  const { configUri, canonicalConfig } = await chugsplashCommitAbstractSubtask(
    parsedProjectConfig,
    false,
    projectConfigArtifacts
  )

  const bundles = makeBundlesFromConfig(
    parsedProjectConfig,
    projectConfigArtifacts,
    projectConfigCache
  )

  return { configUri, canonicalConfig, bundles }
}

export const approveDeployment = async (
  projectName: string,
  bundles: ChugSplashBundles,
  configUri: string,
  manager: ethers.Contract,
  signerAddress: string,
  provider: ethers.providers.Provider
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
    await manager.approve(
      projectName,
      bundles.actionBundle.root,
      bundles.targetBundle.root,
      bundles.actionBundle.actions.length,
      bundles.targetBundle.targets.length,
      getNumDeployContractActions(bundles.actionBundle),
      configUri,
      false,
      await getGasPriceOverrides(provider)
    )
  ).wait()
}
