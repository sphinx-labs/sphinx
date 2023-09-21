import { writeFileSync } from 'fs'
import { join } from 'path'

import hre from 'hardhat'
import '@nomicfoundation/hardhat-ethers'
import {
  AuthState,
  AuthStatus,
  getParsedConfigWithOptions,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  getSphinxManager,
  executeDeployment,
  DeploymentState,
  DeploymentStatus,
  proposeAbstractTask,
  fromProposalRequestLeafToRawAuthLeaf,
  CanonicalConfig,
  GetCanonicalConfig,
  AUTH_FACTORY_ADDRESS,
  ParsedConfigWithOptions,
  toCanonicalConfig,
  ProposalRequest,
  SupportedNetworkName,
  SphinxJsonRpcProvider,
  getParsedConfig,
  UserConfig,
  deployAbstractTask,
  SphinxRuntimeEnvironment,
  FailureAction,
  Integration,
  execAsync,
  CURRENT_SPHINX_MANAGER_VERSION,
  CURRENT_SPHINX_AUTH_VERSION,
  getStorageLayout,
  AuthLeafFunctions,
} from '@sphinx-labs/core'
import {
  AuthABI,
  AuthFactoryABI,
  PROPOSER_ROLE,
  SphinxManagerABI,
  buildInfo,
} from '@sphinx-labs/contracts'
import { expect } from 'chai'
import { ethers } from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

import * as plugins from '../dist'
import {
  makeGetConfigArtifacts,
  makeGetProviderFromChainId,
} from '../src/hardhat/artifacts'
import {
  rpcProviders,
  relayerPrivateKey,
  MultiChainProjectTestInfo,
  OWNER_ROLE_HASH,
  proposerPrivateKey,
  defaultCre,
  ExecutionMethod,
  randomPrivateKey,
} from './constants'

export const registerProject = async (
  provider: SphinxJsonRpcProvider,
  projectTestInfo: MultiChainProjectTestInfo
) => {
  const { authAddress, userConfig, authData, ownerAddresses, managerAddress } =
    projectTestInfo
  const { projectName, options } = userConfig

  const relayerAndExecutor = new ethers.Wallet(relayerPrivateKey, provider)

  const AuthFactory = new ethers.Contract(
    AUTH_FACTORY_ADDRESS,
    AuthFactoryABI,
    relayerAndExecutor
  )
  const Auth = new ethers.Contract(authAddress, AuthABI, relayerAndExecutor)

  // We set the `registryData` to `0x` since this version of the SphinxManager doesn't use it.
  await AuthFactory.deploy(authData, '0x', projectName)

  // Check that the Auth contract has been initialized correctly.
  expect(await Auth.getRoleMemberCount(OWNER_ROLE_HASH)).deep.equals(
    BigInt(ownerAddresses.length)
  )
  for (const ownerAddress of ownerAddresses) {
    expect(await Auth.hasRole(OWNER_ROLE_HASH, ownerAddress)).equals(true)
  }
  expect(await Auth.projectName()).equals(projectName)
  expect(await Auth.manager()).equals(managerAddress)
  expect(await Auth.threshold()).deep.equals(BigInt(options.ownerThreshold))
}

export const makeGetCanonicalConfig = (
  prevParsedConfig: ParsedConfigWithOptions,
  managerAddress: string,
  authAddress: string,
  providers: Record<string, SphinxJsonRpcProvider>
): GetCanonicalConfig => {
  const getCanonicalConfig = async (
    orgId: string,
    isTestnet: boolean,
    apiKey: string,
    projectName: string
  ): Promise<CanonicalConfig | undefined> => {
    // We write these variables here to remove a TypeScript warning.
    orgId
    isTestnet
    apiKey
    projectName

    // Convert the previous parsed config into a CanonicalConfig.
    return toCanonicalConfig(
      prevParsedConfig,
      managerAddress,
      authAddress,
      providers
    )
  }
  return getCanonicalConfig
}

/**
 * @notice This is a callback function that is passed into the `proposeAbstractTask` function.
 * It must adhere to the `GetCanonicalConfig` function type.
 */
export const emptyCanonicalConfigCallback = async (
  orgId: string,
  isTestnet: boolean,
  apiKey: string
): Promise<CanonicalConfig | undefined> => {
  // We write these variables here to avoid a TypeScript warning.
  orgId
  isTestnet
  apiKey

  return undefined
}

export const proposeThenApproveDeployment = async (
  projectTestInfo: MultiChainProjectTestInfo,
  proposalRequest: ProposalRequest,
  networksToAdd: Array<SupportedNetworkName>,
  executionMethod: ExecutionMethod
) => {
  const { managerAddress, authAddress, userConfig, ownerPrivateKeys } =
    projectTestInfo

  const { root, leaves } = proposalRequest.tree

  for (const network of networksToAdd) {
    const provider = rpcProviders[network]
    const chainId = SUPPORTED_NETWORKS[network]

    // The relayer is the signer that executes the transactions on the Auth contract
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const Manager = new ethers.Contract(
      managerAddress,
      SphinxManagerABI,
      relayer
    )
    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    const ownerSignatures: Array<string> = []
    const proposerSignatures: Array<string> = []
    if (executionMethod === 'standard') {
      const ownerSigs = await getSignatures(
        ownerPrivateKeys,
        root,
        userConfig.options.ownerThreshold
      )
      ownerSignatures.push(...ownerSigs)
      expect(ownerSignatures.length).equals(userConfig.options.ownerThreshold)

      const proposerSigs = await getSignatures([proposerPrivateKey], root, 1)
      proposerSignatures.push(...proposerSigs)
      expect(proposerSignatures.length).equals(1)
    } else {
      // Set the owner threshold to 0 so that anybody can submit auth leafs without requiring the
      // owner's consent.
      const ownerThresholdSlotKey = getStorageSlotKey(
        'contracts/SphinxAuth.sol:SphinxAuth',
        'threshold'
      )
      await provider.send('hardhat_setStorageAt', [
        authAddress,
        ethers.toBeHex(ownerThresholdSlotKey),
        ethers.ZeroHash,
      ])

      // Next, we set a random address as the proposer via `setStorageAt`, then use its private key
      // to sign the proposal. The relevant storage slot for the proposer role is in
      // `AccessControlUpgradeable`, which is inherited by the `SphinxAuth` contract.
      const randomAddr = new ethers.Wallet(randomPrivateKey).address
      // Get the storage slot of the `_roles` variable in `AccessControlUpgradeable`.
      const rolesMappingSlot = getStorageSlotKey(
        'contracts/SphinxAuth.sol:SphinxAuth',
        '_roles'
      )
      // Get the storage slot of the `RoleData` struct for the `PROPOSER_ROLE`.
      const proposerRoleDataSlot = getMappingValueStorageSlot(
        PROPOSER_ROLE,
        'bytes32',
        rolesMappingSlot
      )
      // Get the storage slot of the `members` mapping in the `RoleData` struct. This is where the
      // new proposer's proposer permission will be stored.
      const newProposerAddrSlot = getMappingValueStorageSlot(
        randomAddr,
        'address',
        proposerRoleDataSlot
      )
      // Set the `members` mapping to `true` for the new proposer's address.
      await provider.send('hardhat_setStorageAt', [
        authAddress,
        newProposerAddrSlot,
        ethers.AbiCoder.defaultAbiCoder().encode(['bool'], [true]),
      ])

      expect(await Auth.threshold()).equals(0n)
      expect(await Auth.hasRole(PROPOSER_ROLE, randomAddr)).equals(true)

      const proposerSigs = await getSignatures([randomPrivateKey], root, 1)
      proposerSignatures.push(...proposerSigs)
      expect(proposerSignatures.length).equals(1)
    }

    const cancelLeafIndex = leaves.findIndex(
      (leaf) =>
        leaf.leafType === AuthLeafFunctions.CANCEL_ACTIVE_DEPLOYMENT &&
        leaf.chainId === chainId
    )
    const containsCancelLeaf = cancelLeafIndex !== -1
    const containsSetupLeaf = leaves.some(
      (leaf) =>
        leaf.leafType === AuthLeafFunctions.SETUP && leaf.chainId === chainId
    )
    const upgradeLeafIndex = leaves.findIndex(
      (leaf) =>
        leaf.leafType === AuthLeafFunctions.UPGRADE_MANAGER_AND_AUTH_IMPL &&
        leaf.chainId === chainId
    )
    const containsUpgradeLeaf = upgradeLeafIndex !== -1
    const expectedNumLeafs = leaves.filter(
      (leaf) => leaf.chainId === chainId
    ).length

    const proposalLeafIndex = leaves.findIndex(
      (leaf) =>
        leaf.leafType === AuthLeafFunctions.PROPOSE && leaf.chainId === chainId
    )
    if (proposalLeafIndex === -1) {
      throw new Error('The proposal leaf index is -1. Should never happen.')
    }
    const proposalLeaf = leaves[proposalLeafIndex]

    const approvalLeafIndex = leaves.findIndex(
      (leaf) =>
        leaf.leafType === AuthLeafFunctions.APPROVE_DEPLOYMENT &&
        leaf.chainId === chainId
    )
    if (approvalLeafIndex === -1) {
      throw new Error('The approval leaf index is -1. Should never happen.')
    }
    const approveDeploymentLeaf = leaves[approvalLeafIndex]

    let authState: AuthState = await Auth.authStates(root)
    const expectedInitialStatus = containsSetupLeaf
      ? AuthStatus.SETUP
      : AuthStatus.EMPTY
    expect(authState.status).equals(expectedInitialStatus)

    await Auth.propose(
      root,
      fromProposalRequestLeafToRawAuthLeaf(proposalLeaf),
      proposerSignatures,
      proposalLeaf.siblings
    )

    // Check that the proposal executed correctly.
    authState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.PROPOSED)
    expect(authState.numLeafs).deep.equals(BigInt(expectedNumLeafs))
    const leafsExecuted = containsSetupLeaf ? 2 : 1
    expect(authState.leafsExecuted).deep.equals(BigInt(leafsExecuted))
    expect(await Auth.firstProposalOccurred()).equals(true)

    if (containsCancelLeaf) {
      expect(await Manager.isExecuting()).equals(true)

      const cancelLeaf = leaves[cancelLeafIndex]
      await Auth.cancelActiveDeployment(
        root,
        fromProposalRequestLeafToRawAuthLeaf(cancelLeaf),
        ownerSignatures,
        cancelLeaf.siblings
      )
      expect(await Manager.isExecuting()).equals(false)
    }

    // Check that there is no active deployment before approving the deployment.
    expect(await Manager.isExecuting()).equals(false)

    // Trigger upgrade if the upgrade leaf is present
    if (containsUpgradeLeaf) {
      const upgradeManagerLeaf = leaves[upgradeLeafIndex]
      await Auth.upgradeManagerAndAuthImpl(
        root,
        fromProposalRequestLeafToRawAuthLeaf(upgradeManagerLeaf),
        ownerSignatures,
        upgradeManagerLeaf.siblings
      )

      // Expect the manager and auth implementations to be upgraded
      const authVersion = await Auth.version()
      const managerVersion = await Manager.version()
      expect(authVersion).to.eql([BigInt(9), BigInt(9), BigInt(9)])
      expect(managerVersion).to.eql([BigInt(9), BigInt(9), BigInt(9)])
    } else {
      // Expect the manager and auth implementations to be the current versions
      const authVersion = await Auth.version()
      const managerVersion = await Manager.version()
      expect(authVersion).to.eql(
        Object.values(CURRENT_SPHINX_AUTH_VERSION).map((num) => BigInt(num))
      )
      expect(managerVersion).to.eql(
        Object.values(CURRENT_SPHINX_MANAGER_VERSION).map((num) => BigInt(num))
      )
    }

    await Auth.approveDeployment(
      root,
      fromProposalRequestLeafToRawAuthLeaf(approveDeploymentLeaf),
      ownerSignatures,
      approveDeploymentLeaf.siblings
    )

    authState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.COMPLETED)
    expect(await Manager.isExecuting()).equals(true)
  }
}

export const execute = async (
  projectTestInfo: MultiChainProjectTestInfo,
  networksToAdd: Array<SupportedNetworkName>
) => {
  const { managerAddress, userConfig } = projectTestInfo

  for (const network of networksToAdd) {
    const provider = rpcProviders[network]
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const Manager = new ethers.Contract(
      managerAddress,
      SphinxManagerABI,
      relayer
    )

    // Check that the approve function executed correctly and that all of the leafs in the tree have
    // been executed.
    const { parsedConfig, configCache, configArtifacts } =
      await getParsedConfigWithOptions(
        userConfig,
        managerAddress,
        true,
        provider,
        defaultCre,
        makeGetConfigArtifacts(hre)
      )

    const { configUri, bundles, humanReadableActions } =
      await getProjectBundleInfo(parsedConfig, configArtifacts, configCache)
    const deploymentId = getDeploymentId(bundles, configUri)
    expect(await Manager.activeDeploymentId()).equals(deploymentId)

    // Execute the deployment.
    const block = await provider.getBlock('latest')
    if (block === null) {
      throw new Error('The block is null. Should never happen.')
    }
    const blockGasLimit = block.gasLimit
    const manager = getSphinxManager(managerAddress, relayer)

    await Manager.claimDeployment()

    const { success } = await executeDeployment(
      manager,
      bundles,
      humanReadableActions,
      blockGasLimit,
      provider,
      relayer
    )

    // Check that the deployment executed correctly.
    expect(success).equals(true)
    const deployment: DeploymentState = await Manager.deployments(deploymentId)
    expect(deployment.status).equals(DeploymentStatus.COMPLETED)
  }
}

/**
 * @notice Executes a deployment that will revert on-chain
 */
export const executeRevertingDeployment = async (
  projectTestInfo: MultiChainProjectTestInfo,
  networksToAdd: Array<SupportedNetworkName>
) => {
  const { managerAddress, userConfig } = projectTestInfo

  for (const network of networksToAdd) {
    const provider = rpcProviders[network]
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const Manager = new ethers.Contract(
      managerAddress,
      SphinxManagerABI,
      relayer
    )

    // Check that the approve function executed correctly and that all of the leafs in the tree have
    // been executed.
    const { parsedConfig, configCache, configArtifacts } =
      await getParsedConfigWithOptions(
        userConfig,
        managerAddress,
        true,
        provider,
        defaultCre,
        makeGetConfigArtifacts(hre)
      )

    const { configUri, bundles, humanReadableActions } =
      await getProjectBundleInfo(parsedConfig, configArtifacts, configCache)
    const deploymentId = getDeploymentId(bundles, configUri)
    expect(await Manager.activeDeploymentId()).equals(deploymentId)

    // Execute the deployment.
    const block = await provider.getBlock('latest')
    if (block === null) {
      throw new Error('The block is null. Should never happen.')
    }
    const blockGasLimit = block.gasLimit
    const manager = getSphinxManager(managerAddress, relayer)

    await Manager.claimDeployment()

    const { success } = await executeDeployment(
      manager,
      bundles,
      humanReadableActions,
      blockGasLimit,
      provider,
      relayer
    )

    // Check that the deployment executed correctly.
    expect(success).equals(false)
    const deployment: DeploymentState = await Manager.deployments(deploymentId)
    // The deployment remains in the `APPROVED` state until it's manually cancelled.
    expect(deployment.status).equals(DeploymentStatus.APPROVED)
  }
}

export const setupThenProposeThenApproveDeployment = async (
  projectTestInfo: MultiChainProjectTestInfo,
  networksToAdd: Array<SupportedNetworkName>,
  getCanonicalConfig: GetCanonicalConfig,
  executionMethod: ExecutionMethod
) => {
  const { authAddress, userConfig, ownerPrivateKeys, proposerAddresses } =
    projectTestInfo

  const { proposalRequest } = await proposeAbstractTask(
    userConfig,
    true, // Is testnet
    defaultCre,
    true, // Skip relaying the meta transaction to the back-end
    makeGetConfigArtifacts(hre),
    makeGetProviderFromChainId(hre),
    undefined, // Use the default spinner
    FailureAction.THROW,
    getCanonicalConfig
  )

  if (!proposalRequest) {
    throw new Error('The proposal is empty. Should never happen.')
  }

  const { root, leaves } = proposalRequest.tree

  for (const network of networksToAdd) {
    const provider = rpcProviders[network]

    // The relayer is the signer that executes the transactions on the Auth contract
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    const ownerSignatures: Array<string> = []
    if (executionMethod === 'standard') {
      const signatures = await getSignatures(
        ownerPrivateKeys,
        root,
        userConfig.options.ownerThreshold
      )
      ownerSignatures.push(...signatures)
      expect(ownerSignatures.length).equals(userConfig.options.ownerThreshold)
    } else {
      const ownerThresholdSlotKey = getStorageSlotKey(
        'contracts/SphinxAuth.sol:SphinxAuth',
        'threshold'
      )
      await provider.send('hardhat_setStorageAt', [
        authAddress,
        ethers.toBeHex(ownerThresholdSlotKey),
        ethers.ZeroHash,
      ])
      expect(await Auth.threshold()).equals(0n)
    }

    const chainId = SUPPORTED_NETWORKS[network]

    const setupLeaf = leaves.find(
      (leaf) =>
        leaf.leafType === AuthLeafFunctions.SETUP && leaf.chainId === chainId
    )

    if (!setupLeaf) {
      throw new Error('Could not find setup leaf. Should never happen.')
    }

    // Check that the state of the Auth contract is correct before calling the `setup` function.
    for (const proposerAddress of proposerAddresses) {
      expect(await Auth.hasRole(PROPOSER_ROLE, proposerAddress)).equals(false)
    }
    // Check that the corresponding AuthState is empty.
    let authState: AuthState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.EMPTY)
    expect(authState.leafsExecuted).deep.equals(BigInt(0))
    expect(authState.numLeafs).deep.equals(BigInt(0))

    await Auth.setup(
      root,
      fromProposalRequestLeafToRawAuthLeaf(setupLeaf),
      ownerSignatures,
      setupLeaf.siblings
    )

    // Check that the setup function executed correctly.
    for (const proposerAddress of proposerAddresses) {
      expect(await Auth.hasRole(PROPOSER_ROLE, proposerAddress)).equals(true)
    }
    authState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.SETUP)
    expect(authState.leafsExecuted).deep.equals(BigInt(1))
    const expectedNumLeafs = leaves.filter(
      (leaf) => leaf.chainId === chainId
    ).length
    expect(authState.numLeafs).deep.equals(BigInt(expectedNumLeafs))
  }

  await proposeThenApproveDeployment(
    projectTestInfo,
    proposalRequest,
    networksToAdd,
    executionMethod
  )
}

const getSignatures = async (
  ownerPrivateKeys: Array<string>,
  root: string,
  threshold: number
): Promise<Array<string>> => {
  // Sort the private keys in ascending order according to their corresponding addresses.
  const sortedOwnerPrivateKeys = ownerPrivateKeys.sort((a, b) => {
    const aAddress = BigInt(new ethers.Wallet(a).address)
    const bAddress = BigInt(new ethers.Wallet(b).address)
    if (aAddress < bAddress) {
      return -1
    } else if (aAddress > bAddress) {
      return 1
    } else {
      return 0
    }
  })

  const signatures: Array<string> = []
  for (const ownerPrivateKey of sortedOwnerPrivateKeys) {
    const owner = new ethers.Wallet(ownerPrivateKey)
    const signature = await signAuthRootMetaTxn(owner, root)
    signatures.push(signature)

    if (signatures.length === threshold) {
      break
    }
  }
  return signatures
}

export const deploy = async (
  config: UserConfig,
  provider: ethers.JsonRpcProvider,
  deployerPrivateKey: string,
  integration: Integration,
  cre: SphinxRuntimeEnvironment = defaultCre,
  failureAction: FailureAction = FailureAction.EXIT
) => {
  if (integration === 'hardhat') {
    await deployUsingHardhat(
      config,
      provider,
      deployerPrivateKey,
      cre,
      failureAction
    )
  } else if (integration === 'foundry') {
    await deployUsingFoundry(config, provider, deployerPrivateKey)
  } else {
    throw new Error('Invalid integration.')
  }
}

export const deployUsingHardhat = async (
  config: UserConfig,
  provider: ethers.JsonRpcProvider | HardhatEthersProvider,
  deployerPrivateKey: string,
  cre: SphinxRuntimeEnvironment = defaultCre,
  failureAction: FailureAction = FailureAction.EXIT
) => {
  const wallet = new ethers.Wallet(deployerPrivateKey, provider)
  const ownerAddress = await wallet.getAddress()

  const compilerConfigPath = hre.config.paths.compilerConfigs

  const deploymentFolder = hre.config.paths.deployments

  const { parsedConfig, configCache, configArtifacts } = await getParsedConfig(
    config,
    provider,
    cre,
    plugins.makeGetConfigArtifacts(hre),
    ownerAddress,
    failureAction
  )

  // TODO: everything below is pasted from the deployAbstractTask. not sure if it's useful anymore,
  // but it is the exhaustive code that *could* be useful from the deploy task.
  const { projectName, manager } = parsedConfig
  const { networkName, blockGasLimit } = configCache

  const Manager = getSphinxManager(manager, wallet)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the user-defined new owner, if it exists.
  await registerOwner(
    projectName,
    getSphinxRegistryAddress(),
    manager,
    ownerAddress,
    signer,
    spinner
  )

  spinner.start(`Checking the status of ${projectName}...`)

  const { configUri, bundles, compilerConfig, humanReadableActions } =
    await getProjectBundleInfo(parsedConfig, configArtifacts, configCache)

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
      `${projectName} was previously cancelled on ${networkName}. This is likely because part of the deployment failed which caused the entire deployment to be cancelled. You should check the previous deployment logs to see what went wrong and update your config file accordingly. Please contact the developers if you are unable to resolve this issue.`
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
        await getGasPriceOverrides(signer)
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

    const { success, failureAction } = await executeDeployment(
      Manager,
      bundles,
      humanReadableActions,
      blockGasLimit,
      provider,
      signer
    )

    if (!success) {
      // If the deployment failed for an indentifiable reason (like a reverting constructor or external call)
      // Then we automatically cancel the deployment and throw an error
      if (failureAction) {
        // cancel the deployment
        await (
          await Manager.cancelActiveSphinxDeployment(
            await getGasPriceOverrides(signer)
          )
        ).wait()

        if (failureAction.actionType === SphinxActionType.CALL) {
          throw new Error(
            `Failed to execute ${projectName} because the following post-deployment action reverted:\n` +
              `${failureAction.reason}`
          )
        } else {
          throw new Error(
            `Failed to execute ${projectName} because the following deployment reverted:\n` +
              `${failureAction.reason}`
          )
        }
      }

      throw new Error(
        `Failed to execute ${projectName}, likely because a transaction reverted during the deployment.`
      )
    }
  }
}

export const deployUsingFoundry = async (
  config: UserConfig,
  provider: ethers.JsonRpcProvider,
  deployerPrivateKey: string
) => {
  const tmpFoundryConfigFileName = 'tmp-foundry-config.json'
  const tmpFoundryConfigPath = join(
    __dirname,
    '..',
    'cache',
    tmpFoundryConfigFileName
  )
  // Write the config to a temporary file.
  writeFileSync(tmpFoundryConfigPath, JSON.stringify(config))

  const rpcUrl = provider._getConnection().url
  process.env['SPHINX_INTERNAL_CONFIG_PATH'] = tmpFoundryConfigPath
  process.env['SPHINX_INTERNAL_RPC_URL'] = rpcUrl
  process.env['SPHINX_INTERNAL_PRIVATE_KEY'] = deployerPrivateKey
  process.env['SPHINX_INTERNAL_BROADCAST'] = 'true'

  // Execute the deployment.
  await execAsync(
    `forge script test/foundry/Broadcast.s.sol --broadcast --rpc-url ${rpcUrl}`
  )
}

export const revertSnapshots = async (
  networks: Array<string>,
  snapshotIds: {
    [network: string]: string
  }
) => {
  // Revert to a snapshot of the blockchain state before each test. The snapshot is taken after
  // the `before` hook above is run.
  for (const network of networks) {
    const provider = rpcProviders[network]

    const snapshotId = snapshotIds[network]
    // Attempt to revert to the previous snapshot.
    try {
      await provider.send('evm_revert', [snapshotId])
    } catch (e) {
      // An error will be thrown when this `beforeEach` hook is run for the first time. This is
      // because there is no `snapshotId` yet. We can ignore this error.
    }

    const newSnapshotId = await provider.send('evm_snapshot', [])
    snapshotIds[network] = newSnapshotId
  }
}

export const getStorageSlotKey = (
  fullyQualifiedName: string,
  varName: string
): string => {
  const [sourceName, contractName] = fullyQualifiedName.split(':')
  const storageLayout = getStorageLayout(
    buildInfo.output,
    sourceName,
    contractName
  )
  const storageObj = storageLayout.storage.find((s) => s.label === varName)

  if (!storageObj) {
    throw new Error(
      `Could not find storage slot key for: ${fullyQualifiedName}`
    )
  }

  return storageObj.slot
}

/**
 * @notice Compute the storage slot for an entry in a mapping. Identical to `cast index`.
 *
 * @param mappingKeySlot The storage slot of the mapping key. This can either be a base-10 number
 * (e.g. '12') or a 32-byte DataHexString (e.g. '0x000...aaff').
 */
export const getMappingValueStorageSlot = (
  mappingKey: string,
  mappingKeyType: string,
  mappingKeySlot: string
): string => {
  // Encodes the mapping key to a 32-byte DataHexString. If the mapping key is already in this format,
  // it remains unchanged.
  const encodedMappingKeySlot = ethers.zeroPadValue(
    ethers.toBeHex(mappingKeySlot),
    32
  )

  const encodedMappingKey = ethers.AbiCoder.defaultAbiCoder().encode(
    [mappingKeyType],
    [mappingKey]
  )

  const mappingValueStorageSlotKey = ethers.keccak256(
    ethers.concat([encodedMappingKey, encodedMappingKeySlot])
  )

  return mappingValueStorageSlotKey
}
