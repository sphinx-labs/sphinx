Error.stackTraceLimit = Infinity // TODO

import process from 'process'
import { join, sep } from 'path'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import ora from 'ora'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { ProxyABI } from '@sphinx-labs/contracts'
import { blue } from 'chalk'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

import {
  SphinxInput,
  contractKindHashes,
  CanonicalConfig,
  GetConfigArtifacts,
  GetProviderForChainId,
  ConfigArtifacts,
  ParsedConfigWithOptions,
  CompilerConfig,
  GetCanonicalConfig,
  UserConfigWithOptions,
  ParsedConfig,
  ConfigCache,
  MinimalConfigCache,
  NetworkType,
} from '../config/types'
import {
  getDeploymentId,
  displayDeploymentTable,
  getSphinxManager,
  getSphinxRegistry,
  getDeploymentEvents,
  getEIP1967ProxyAdminAddress,
  getGasPriceOverrides,
  writeCompilerConfig,
  writeSnapshotId,
  transferProjectOwnership,
  getProjectConfigInfo,
  relayProposal,
  relayIPFSCommit,
  registerOwner,
  fetchCanonicalConfig,
  userConfirmation,
  getNetworkType,
  resolveNetwork,
  getNetworkDirName,
  hyperlink,
  getNetworkNameForChainId,
} from '../utils'
import { SphinxJsonRpcProvider } from '../provider'
import { ensureSphinxInitialized, getMinimumCompilerInput } from '../languages'
import { Integration, WEBSITE_URL } from '../constants'
import {
  SphinxBundles,
  DeploymentState,
  DeploymentStatus,
  ProposalRequestLeaf,
  RoleType,
  executeDeployment,
  getAuthLeafSignerInfo,
  makeAuthBundle,
  makeBundlesFromConfig,
  writeDeploymentArtifacts,
  ProposalRequest,
  AuthLeaf,
  getProjectDeploymentForChain,
  getAuthLeafsForChain,
  getGasEstimates,
  ProjectDeployment,
  fromRawSphinxAction,
  isSetStorageAction,
} from '../actions'
import { SphinxRuntimeEnvironment, FailureAction } from '../types'
import {
  trackCancel,
  trackExportProxy,
  trackDeployed,
  trackImportProxy,
} from '../analytics'
import { isSupportedNetworkOnEtherscan, verifySphinxConfig } from '../etherscan'
import {
  getAuthAddress,
  getSphinxManagerAddress,
  getSphinxRegistryAddress,
} from '../addresses'
import { signAuthRootMetaTxn } from '../metatxs'
import { getParsedConfigWithOptions } from '../config/parse'
import { getDiff, getDiffString } from '../diff'

// Load environment variables from .env
dotenv.config()

/**
 * @param getCanonicalConfig A function that returns the canonical config. By default, this function
 * will fetch the canonical config from the back-end. However, it can be overridden to return a
 * different canonical config. This is useful for testing.
 * @param dryRun If true, the proposal will not be relayed to the back-end.
 */
export const proposeAbstractTask = async (
  userConfig: UserConfigWithOptions,
  isTestnet: boolean,
  cre: SphinxRuntimeEnvironment,
  dryRun: boolean,
  getConfigArtifacts: GetConfigArtifacts,
  getProviderForChainId: GetProviderForChainId,
  spinner: ora.Ora = ora({ isSilent: true }),
  failureAction: FailureAction = FailureAction.EXIT,
  getCanonicalConfig: GetCanonicalConfig = fetchCanonicalConfig,
  signMetaTxn: boolean = true
): Promise<{
  proposalRequest: ProposalRequest | undefined
  ipfsData: string[] | undefined
}> => {
  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    throw new Error(`Must provide a 'SPHINX_API_KEY' environment variable.`)
  }

  const privateKey = process.env.PROPOSER_PRIVATE_KEY
  if (!privateKey) {
    throw new Error(
      `Must provide a 'PROPOSER_PRIVATE_KEY' environment variable.`
    )
  }

  const { projectName } = userConfig

  const wallet = new ethers.Wallet(privateKey)
  const signerAddress = await wallet.getAddress()

  const { isNewConfig, chainIds, prevConfig } = await getProjectConfigInfo(
    getCanonicalConfig,
    userConfig,
    isTestnet,
    apiKey,
    cre,
    failureAction
  )

  spinner.succeed(`Got project info.`)

  // Next, we parse and validate the config for each chain ID. This is necessary to ensure that
  // there aren't any network-specific errors that are caused by the config. These errors would most
  // likely occur in the `postParsingValidation` function that's a few calls inside of
  // `getParsedConfigWithOptions`. TODO: this isn't true anymore: Note that the parsed config will
  // be the same on each chain ID because the network-specific validation does not change any fields
  // in the parsed config. Likewise, the `ConfigArtifacts` object will be the same on each chain.
  // The only thing that will change is the `ConfigCache` object.
  let parsedConfig: ParsedConfigWithOptions | undefined
  let configArtifacts: ConfigArtifacts | undefined
  const leafs: Array<AuthLeaf> = []
  const projectDeployments: Array<ProjectDeployment> = []
  const compilerConfigs: {
    [ipfsHash: string]: string
  } = {}
  const configCaches: Array<ConfigCache> = []
  // We loop through any logic that depends on the provider object.
  for (let i = 0; i < chainIds.length; i++) {
    const chainId = chainIds[i]
    spinner.start(
      `Getting on-chain data for ${getNetworkNameForChainId(chainId)}... [${
        i + 1
      }/${chainIds.length}]`
    )
    const provider = getProviderForChainId(chainId)

    await ensureSphinxInitialized(provider, wallet.connect(provider))

    // TODO: collect the post-deployment actions, probably keyed by chain ID

    const parsedConfigValues = await getParsedConfigWithOptions(
      userConfig,
      prevConfig.manager,
      isTestnet,
      provider,
      cre,
      getConfigArtifacts,
      failureAction
    )

    parsedConfig = parsedConfigValues.parsedConfig
    configArtifacts = parsedConfigValues.configArtifacts
    const configCache = parsedConfigValues.configCache

    const leafsForChain = await getAuthLeafsForChain(
      chainId,
      parsedConfig,
      configArtifacts,
      configCache,
      prevConfig
    )
    leafs.push(...leafsForChain)

    const { compilerConfig, configUri, bundles } = await getProjectBundleInfo(
      parsedConfig,
      configArtifacts,
      configCache
    )

    const projectDeployment = await getProjectDeploymentForChain(
      leafs,
      chainId,
      projectName,
      configUri,
      bundles
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }

    configCaches.push(configCache)
    compilerConfigs[configUri] = JSON.stringify(compilerConfig, null, 2)
  }

  spinner.succeed(`Got on-chain data.`)

  const diff = getDiff(configCaches)

  // This removes a TypeScript error that occurs because TypeScript doesn't know that the
  // `parsedConfig` variable is defined.
  if (!parsedConfig || !configArtifacts) {
    throw new Error(
      'Could not find either parsed config or config artifacts. Should never happen.'
    )
  }

  const { orgId } = parsedConfig.options

  if (!isNewConfig && orgId !== prevConfig.options.orgId) {
    throw new Error(
      `Organization ID cannot be changed.\n` +
        `Previous: ${prevConfig.options.orgId}\n` +
        `New: ${orgId}`
    )
  }

  if (leafs.length === 0) {
    spinner.succeed(
      `Skipping proposal because your Sphinx config file has not changed.`
    )
    return { proposalRequest: undefined, ipfsData: undefined }
  }

  if (!cre.confirm && !dryRun) {
    spinner.stop()
    // Confirm deployment with the user before proceeding.
    await userConfirmation(getDiffString(diff))
    spinner.start(`Proposal in progress...`)
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

  // Sign the meta-txn for the auth root, or leave it undefined if we're not relaying the proposal
  // to the back-end.
  const metaTxnSignature =
    !dryRun && !signMetaTxn
      ? undefined
      : await signAuthRootMetaTxn(wallet, root)

  const proposalRequestLeafs: Array<ProposalRequestLeaf> = []
  for (const bundledLeaf of bundledLeafs) {
    const { leaf, prettyLeaf, proof } = bundledLeaf
    const { chainId, index, to, leafType } = prettyLeaf
    const { data } = leaf

    let firstProposalOccurred: boolean
    const chainStates = prevConfig.chainStates[chainId]
    if (!chainStates) {
      firstProposalOccurred = false
    } else {
      firstProposalOccurred = chainStates.firstProposalOccurred
    }

    if (
      firstProposalOccurred &&
      !prevConfig.options.proposers.includes(signerAddress)
    ) {
      throw new Error(
        `Signer is not currently a proposer on chain ${chainId}. Signer's address: ${signerAddress}\n` +
          `Current proposers: ${prevConfig.options.proposers.map(
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

    let owners: string[]
    let proposers: string[]
    let ownerThreshold: number
    if (firstProposalOccurred) {
      ;({ owners, proposers, ownerThreshold } = prevConfig.options)
    } else {
      ;({ owners, proposers, ownerThreshold } = parsedConfig.options)
    }

    const { leafThreshold, roleType } = getAuthLeafSignerInfo(
      ownerThreshold,
      leafType
    )

    let signerAddresses: string[]
    if (roleType === RoleType.OWNER) {
      signerAddresses = owners
    } else if (roleType === RoleType.PROPOSER) {
      signerAddresses = proposers
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
      threshold: leafThreshold,
      signers,
    })
  }

  const newChainStates: CanonicalConfig['chainStates'] = {}
  for (const chainId of chainIds) {
    newChainStates[chainId] = {
      firstProposalOccurred: true,
      projectCreated: true,
    }
  }

  const newCanonicalConfig: CanonicalConfig = {
    manager: prevConfig.manager,
    options: parsedConfig.options,
    contracts: {
      ...prevConfig.contracts,
      ...parsedConfig.contracts,
    },
    projectName: parsedConfig.projectName,
    chainStates: {
      ...prevConfig.chainStates,
      ...newChainStates,
    },
  }

  // We calculate the auth address based on the current owners since this is used to store the
  // address of the auth contract on any new chains in the DB.
  // Note that calculating this here and passing in a single value works as long as the address
  // is the same on all networks, but we may need to change this in the future to support chains
  // which calculate addresses in different ways. I.e ZKSync Era
  const authAddress = getAuthAddress(
    parsedConfig.options.owners,
    parsedConfig.options.ownerThreshold,
    parsedConfig.projectName
  )
  const managerAddress = getSphinxManagerAddress(authAddress, projectName)

  const gasEstimates = await getGasEstimates(leafs, configArtifacts)

  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId,
    isTestnet,
    chainIds,
    deploymentName: parsedConfig.projectName,
    owners: newCanonicalConfig.options.owners,
    threshold: newCanonicalConfig.options.ownerThreshold,
    authAddress,
    managerAddress,
    canonicalConfig: JSON.stringify(newCanonicalConfig),
    projectDeployments,
    gasEstimates,
    diff,
    tree: {
      root,
      chainStatus,
      leaves: proposalRequestLeafs,
    },
  }

  const compilerConfigArray = Object.values(compilerConfigs)
  if (!dryRun) {
    const websiteLink = blue(hyperlink('website', WEBSITE_URL))
    await relayProposal(proposalRequest)
    await relayIPFSCommit(apiKey, orgId, compilerConfigArray)
    spinner.succeed(
      `Proposal succeeded! Go to the ${websiteLink} to approve the deployment.`
    )
  } else {
    spinner.succeed(`Proposal dry run succeeded!`)
  }

  return { proposalRequest, ipfsData: compilerConfigArray }
}

export const sphinxCommitAbstractSubtask = async (
  parsedConfig: ParsedConfig,
  commitToIpfs: boolean,
  configArtifacts: ConfigArtifacts,
  ipfsUrl?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  configUri: string
  compilerConfig: CompilerConfig
}> => {
  const { projectName } = parsedConfig
  if (spinner) {
    commitToIpfs
      ? spinner.start(`Committing ${projectName}...`)
      : spinner.start('Building the project...')
  }

  const sphinxInputs: Array<SphinxInput> = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { buildInfo } = configArtifacts[referenceName]

    const prevSphinxInput = sphinxInputs.find(
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

    if (prevSphinxInput === undefined) {
      const sphinxInput: SphinxInput = {
        solcVersion: buildInfo.solcVersion,
        solcLongVersion: buildInfo.solcLongVersion,
        id: buildInfo.id,
        input: {
          language,
          settings,
          sources,
        },
      }
      sphinxInputs.push(sphinxInput)
    } else {
      prevSphinxInput.input.sources = {
        ...prevSphinxInput.input.sources,
        ...sources,
      }
    }
  }

  const compilerConfig: CompilerConfig = {
    ...parsedConfig,
    inputs: sphinxInputs,
  }

  const ipfsData = JSON.stringify(compilerConfig, null, 2)

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
      ? spinner.succeed(`${projectName} has been committed to IPFS.`)
      : spinner.succeed(`Built ${projectName}.`)
  }

  return { configUri, compilerConfig }
}

export const deployAbstractTask = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Signer,
  compilerConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  cre: SphinxRuntimeEnvironment,
  parsedConfig: ParsedConfig,
  configCache: ConfigCache,
  configArtifacts: ConfigArtifacts,
  newOwner?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<void> => {
  const { projectName, manager } = parsedConfig
  const { networkName, blockGasLimit } = configCache

  if (cre.confirm) {
    spinner.succeed(`Got project info.`)
  } else {
    spinner.stop()

    const diff = getDiff([configCache])
    const diffString = getDiffString(diff)

    // Confirm deployment with the user before sending any transactions.
    await userConfirmation(diffString)
  }

  const Manager = getSphinxManager(manager, signer)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the user-defined new owner, if it exists.
  const signerAddress = await signer.getAddress()
  await registerOwner(
    projectName,
    getSphinxRegistryAddress(),
    manager,
    signerAddress,
    signer,
    provider,
    spinner
  )

  spinner.start(`Checking the status of ${projectName}...`)

  const { configUri, bundles, compilerConfig } = await getProjectBundleInfo(
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
  const deploymentState: DeploymentState = await Manager.deployments(
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
    spinner.succeed(`${projectName} has not been deployed before.`)
    spinner.start(`Approving ${projectName}...`)
    const numTotalActions = bundles.actionBundle.actions.length
    const numSetStorageActions = bundles.actionBundle.actions
      .map((action) => fromRawSphinxAction(action.action))
      .filter(isSetStorageAction).length
    const numInitialActions = numTotalActions - numSetStorageActions
    await (
      await Manager.approve(
        bundles.actionBundle.root,
        bundles.targetBundle.root,
        numInitialActions,
        numSetStorageActions,
        bundles.targetBundle.targets.length,
        configUri,
        false,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    currDeploymentStatus = DeploymentStatus.APPROVED
    spinner.succeed(`Approved ${projectName}.`)
  }

  if (
    currDeploymentStatus === DeploymentStatus.APPROVED ||
    currDeploymentStatus === DeploymentStatus.INITIAL_ACTIONS_EXECUTED ||
    currDeploymentStatus === DeploymentStatus.PROXIES_INITIATED ||
    currDeploymentStatus === DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED
  ) {
    spinner.start(`Executing ${projectName}...`)

    const { success } = await executeDeployment(
      Manager,
      bundles,
      blockGasLimit,
      configArtifacts,
      provider
    )

    if (!success) {
      throw new Error(
        `Failed to execute ${projectName}, likely because one of the user's transaction reverted during the deployment.`
      )
    }
  }

  initialDeploymentStatus === DeploymentStatus.COMPLETED
    ? spinner.succeed(`${projectName} was already completed on ${networkName}.`)
    : spinner.succeed(`Executed ${projectName}.`)

  if (newOwner) {
    spinner.start(`Transferring ownership to: ${newOwner}`)
    await transferProjectOwnership(
      Manager,
      newOwner,
      signerAddress,
      provider,
      spinner
    )
    spinner.succeed(`Transferred ownership to: ${newOwner}`)
  }

  await postDeploymentActions(
    compilerConfig,
    configArtifacts,
    deploymentId,
    compilerConfigPath,
    configUri,
    configCache,
    deploymentFolder,
    integration,
    cre.silent,
    await Manager.owner(),
    provider,
    Manager,
    spinner,
    process.env.ETHERSCAN_API_KEY
  )
}

export const postDeploymentActions = async (
  compilerConfig: CompilerConfig,
  configArtifacts: ConfigArtifacts,
  deploymentId: string,
  compilerConfigPath: string,
  configUri: string,
  configCache: ConfigCache,
  deploymentFolder: string,
  integration: Integration,
  silent: boolean,
  owner: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  manager: ethers.Contract,
  spinner?: ora.Ora,
  etherscanApiKey?: string
) => {
  spinner?.start(`Writing deployment artifacts...`)

  if (integration === 'hardhat') {
    writeCompilerConfig(compilerConfigPath, configUri, compilerConfig)
  }

  const { networkName, chainId, networkType } = configCache
  const networkDirName = getNetworkDirName(networkName, networkType, chainId)

  await trackDeployed(owner, networkName, integration)

  await writeDeploymentArtifacts(
    provider,
    compilerConfig,
    await getDeploymentEvents(manager, deploymentId),
    networkDirName,
    deploymentFolder,
    configArtifacts
  )

  spinner?.succeed(
    `Wrote deployment artifacts to: ${join(
      deploymentFolder,
      networkDirName,
      sep
    )}`
  )

  // TODO: wait to see if Foundry can automatically verify the contracts. It's unlikely because we
  // deploy them in a non-standard way, but it's possible. If foundry can do it, we should just
  // never pass in the `etherscanApiKey`. if foundry can't do it, we should  retrieve the api key
  // via `execAsync(forge config --json)` and pass it in here

  if ((await isSupportedNetworkOnEtherscan(provider)) && etherscanApiKey) {
    if (etherscanApiKey) {
      await verifySphinxConfig(
        compilerConfig,
        configArtifacts,
        provider,
        networkName,
        etherscanApiKey
      )
    } else {
      spinner?.fail(`No Etherscan API Key detected. Skipped verification.`)
    }
  }

  if (integration === 'hardhat' && networkType !== NetworkType.LIVE_NETWORK) {
    try {
      // We save the snapshot ID here so that tests on the stand-alone Hardhat network can be run
      // against the most recently deployed contracts.
      await writeSnapshotId(provider, networkDirName, deploymentFolder)
    } catch (e) {
      if (!e.message.includes('hardhat_metadata')) {
        throw e
      }
    }

    displayDeploymentTable(compilerConfig, silent)
    spinner?.info(
      "Thank you for using Sphinx! We'd love to see you in the Discord: https://discord.gg/7Gc3DK33Np"
    )
  }
}

export const sphinxCancelAbstractTask = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  owner: ethers.Signer,
  projectName: string,
  integration: Integration,
  cre: SphinxRuntimeEnvironment
) => {
  const networkType = await getNetworkType(provider)
  const { networkName } = await resolveNetwork(
    await provider.getNetwork(),
    networkType
  )

  const ownerAddress = await owner.getAddress()
  const managerAddress = getSphinxManagerAddress(ownerAddress, projectName)

  const spinner = ora({ stream: cre.stream })
  spinner.start(`Cancelling deployment for ${projectName} on ${networkName}.`)
  const registry = getSphinxRegistry(owner)
  const Manager = getSphinxManager(managerAddress, owner)

  if (!(await registry.isManagerDeployed(managerAddress))) {
    throw new Error(`Project has not been registered yet.`)
  }

  const currOwner = await Manager.owner()
  if (currOwner !== ownerAddress) {
    throw new Error(`Project is owned by: ${currOwner}.
You attempted to cancel the project using the address: ${await owner.getAddress()}`)
  }

  const activeDeploymentId = await Manager.activeDeploymentId()

  if (activeDeploymentId === ethers.ZeroHash) {
    spinner.fail(
      `${projectName} does not have an active project, so there is nothing to cancel.`
    )
    return
  }

  await (
    await Manager.cancelActiveSphinxDeployment(
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Cancelled deployment for ${projectName} on ${networkName}.`)

  await trackCancel(await Manager.owner(), networkName, integration)
}

export const sphinxExportProxyAbstractTask = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  owner: ethers.Signer,
  projectName: string,
  referenceName: string,
  integration: Integration,
  parsedConfig: ParsedConfig,
  cre: SphinxRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const ownerAddress = await owner.getAddress()
  const managerAddress = getSphinxManagerAddress(ownerAddress, projectName)

  const Registry = getSphinxRegistry(owner)
  const Manager = getSphinxManager(managerAddress, owner)

  // Throw an error if the project has not been registered
  if ((await Registry.isManagerDeployed(managerAddress)) === false) {
    throw new Error(`Project has not been registered yet.`)
  }

  const projectOwner = await Manager.owner()

  const signerAddress = await owner.getAddress()
  if (projectOwner !== signerAddress) {
    throw new Error(`Caller does not own the project.`)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Claiming proxy ownership...')

  const activeDeploymentId = await Manager.activeDeploymentId()
  if (activeDeploymentId !== ethers.ZeroHash) {
    throw new Error(
      `A project is currently being executed. Proxy ownership has not been transferred.
  Please wait a couple of minutes before trying again.`
    )
  }

  const targetContract = parsedConfig[projectName].contracts[referenceName]
  await (
    await Manager.exportProxy(
      targetContract.address,
      contractKindHashes[targetContract.kind],
      signerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  const networkType = await getNetworkType(provider)
  const { networkName } = await resolveNetwork(
    await provider.getNetwork(),
    networkType
  )
  await trackExportProxy(projectOwner, networkName, integration)

  spinner.succeed(`Proxy ownership claimed by address ${signerAddress}`)
}

export const sphinxImportProxyAbstractTask = async (
  projectName: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Signer,
  proxy: string,
  integration: Integration,
  owner: string,
  cre: SphinxRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const managerAddress = getSphinxManagerAddress(owner, projectName)
  const Registry = getSphinxRegistry(signer)
  const Manager = getSphinxManager(managerAddress, signer)

  // Throw an error if the project has not been registered
  if ((await Registry.isManagerDeployed(managerAddress)) === false) {
    throw new Error(`Project has not been registered yet.`)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Checking proxy compatibility...')

  const networkType = await getNetworkType(provider)
  const { networkName } = await resolveNetwork(
    await provider.getNetwork(),
    networkType
  )
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
  //     throw new Error(`Sphinx does not support your proxy type.
  // Currently Sphinx only supports UUPS and Transparent proxies that implement EIP-1967 which yours does not appear to do.
  // If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.`)
  //   }

  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxy)

  // If proxy owner is already Sphinx, then throw an error
  if (ethers.getAddress(managerAddress) === ethers.getAddress(ownerAddress)) {
    throw new Error('Proxy is already owned by Sphinx')
  }

  // If the signer doesn't own the proxy, then throw an error
  const signerAddress = await signer.getAddress()
  if (ethers.getAddress(ownerAddress) !== ethers.getAddress(signerAddress)) {
    throw new Error(`Proxy is owned by: ${ownerAddress}.
  You attempted to transfer ownership of the proxy using the address: ${signerAddress}`)
  }

  spinner.succeed('Proxy compatibility verified')
  spinner.start('Transferring proxy ownership to Sphinx...')

  // Transfer ownership of the proxy to the SphinxManager.
  const Proxy = new ethers.Contract(proxy, ProxyABI, signer)
  await (
    await Proxy.changeAdmin(
      managerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  await trackImportProxy(await Manager.owner(), networkName, integration)

  spinner.succeed('Proxy ownership successfully transferred to Sphinx')
}

export const getProjectBundleInfo = async (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts,
  configCache: MinimalConfigCache
): Promise<{
  configUri: string
  compilerConfig: CompilerConfig
  bundles: SphinxBundles
}> => {
  const { configUri, compilerConfig } = await sphinxCommitAbstractSubtask(
    parsedConfig,
    false,
    configArtifacts
  )

  const bundles = makeBundlesFromConfig(
    parsedConfig,
    configArtifacts,
    configCache
  )

  return { configUri, compilerConfig, bundles }
}
