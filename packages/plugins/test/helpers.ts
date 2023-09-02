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
  findProposalRequestLeaf,
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
} from '@sphinx-labs/core'
import {
  AuthABI,
  AuthFactoryABI,
  PROPOSER_ROLE,
  SphinxManagerABI,
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
  // We write these variables here to avoid a TypeScript error.
  orgId
  isTestnet
  apiKey

  return undefined
}

export const proposeThenApproveDeploymentThenExecute = async (
  projectTestInfo: MultiChainProjectTestInfo,
  proposalRequest: ProposalRequest,
  networksToAdd: Array<SupportedNetworkName>
) => {
  const { managerAddress, authAddress, userConfig, ownerPrivateKeys } =
    projectTestInfo

  const { root, leaves } = proposalRequest.tree

  for (const network of networksToAdd) {
    const provider = rpcProviders[network]
    const chainId = SUPPORTED_NETWORKS[network]

    const ownerSignatures = await getSignatures(
      ownerPrivateKeys,
      root,
      userConfig.options.ownerThreshold
    )
    expect(ownerSignatures.length).equals(userConfig.options.ownerThreshold)

    // The relayer is the signer that executes the transactions on the Auth contract
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const Manager = new ethers.Contract(
      managerAddress,
      SphinxManagerABI,
      relayer
    )
    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    const containsSetupLeaf = leaves.some(
      (leaf) => leaf.leafType === 'setup' && leaf.chainId === chainId
    )
    const containsUpgradeLeaf = leaves.some(
      (leaf) =>
        leaf.leafType === 'upgradeManagerAndAuthImpl' &&
        leaf.chainId === chainId
    )
    const expectedNumLeafs = leaves.filter(
      (leaf) => leaf.chainId === chainId
    ).length

    const proposalLeafIndex = containsSetupLeaf ? 1 : 0
    const proposalLeaf = findProposalRequestLeaf(
      leaves,
      proposalLeafIndex,
      chainId
    )
    const approvalLeafIndex = containsUpgradeLeaf
      ? proposalLeafIndex + 2
      : proposalLeafIndex + 1
    const approveDeploymentLeaf = findProposalRequestLeaf(
      leaves,
      approvalLeafIndex,
      chainId
    )

    let authState: AuthState = await Auth.authStates(root)
    const expectedInitialStatus = containsSetupLeaf
      ? AuthStatus.SETUP
      : AuthStatus.EMPTY
    expect(authState.status).equals(expectedInitialStatus)

    const proposerSignatureArray = await getSignatures(
      [proposerPrivateKey],
      root,
      1
    )
    expect(proposerSignatureArray.length).equals(1)

    await Auth.propose(
      root,
      fromProposalRequestLeafToRawAuthLeaf(proposalLeaf),
      proposerSignatureArray,
      proposalLeaf.siblings
    )

    // Check that the proposal executed correctly.
    authState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.PROPOSED)
    expect(authState.numLeafs).deep.equals(BigInt(expectedNumLeafs))
    const leafsExecuted = containsSetupLeaf ? 2 : 1
    expect(authState.leafsExecuted).deep.equals(BigInt(leafsExecuted))
    expect(await Auth.firstProposalOccurred()).equals(true)

    // Check that there is no active deployment before approving the deployment.
    expect(await Manager.activeDeploymentId()).equals(ethers.ZeroHash)

    // Trigger upgrade if the upgrade leaf is present
    if (containsUpgradeLeaf) {
      const upgradeManagerLeaf = findProposalRequestLeaf(
        leaves,
        proposalLeafIndex + 1,
        chainId
      )
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
    authState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.COMPLETED)

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
      deploymentId,
      humanReadableActions,
      blockGasLimit,
      provider
    )

    // Check that the deployment executed correctly.
    expect(success).equals(true)
    const deployment: DeploymentState = await Manager.deployments(deploymentId)
    expect(deployment.status).equals(DeploymentStatus.COMPLETED)
  }
}

export const setupThenProposeThenApproveDeploymentThenExecute = async (
  projectTestInfo: MultiChainProjectTestInfo,
  networksToAdd: Array<SupportedNetworkName>,
  getCanonicalConfig: GetCanonicalConfig
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
    undefined, // Use the default FailureAction
    getCanonicalConfig
  )

  if (!proposalRequest) {
    throw new Error('The proposal is empty. Should never happen.')
  }

  const { root, leaves } = proposalRequest.tree

  for (const network of networksToAdd) {
    const provider = rpcProviders[network]

    const ownerSignatures = await getSignatures(
      ownerPrivateKeys,
      root,
      userConfig.options.ownerThreshold
    )
    expect(ownerSignatures.length).equals(userConfig.options.ownerThreshold)

    // The relayer is the signer that executes the transactions on the Auth contract
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    const chainId = SUPPORTED_NETWORKS[network]

    const setupLeaf = findProposalRequestLeaf(leaves, 0, chainId)

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

  await proposeThenApproveDeploymentThenExecute(
    projectTestInfo,
    proposalRequest,
    networksToAdd
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

  await deployAbstractTask(
    provider,
    wallet,
    compilerConfigPath,
    deploymentFolder,
    'hardhat',
    cre,
    parsedConfig,
    configCache,
    configArtifacts
  )
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
  console.log(stderr)
  console.log(stdout)
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
