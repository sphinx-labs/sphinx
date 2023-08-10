import hre from 'hardhat'
import '@sphinx-labs/plugins'
import '@nomiclabs/hardhat-ethers'
import {
  AUTH_FACTORY_ADDRESS,
  UserSphinxConfig as UserConfigWithOptions,
  ensureSphinxInitialized,
  getAuthAddress,
  getAuthData,
  getSphinxManagerAddress,
  makeAuthBundle,
  getParsedConfigWithOptions,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_NETWORKS,
  getEmptyCanonicalConfig,
  findBundledLeaf,
  getAuthLeafsForChain,
  getTargetAddress,
  monitorExecution,
  sphinxCommitAbstractSubtask,
} from '@sphinx-labs/core'
import {
  AuthFactoryABI,
  AuthABI,
  SphinxManagerABI,
} from '@sphinx-labs/contracts'
import { createSphinxRuntime } from '@sphinx-labs/plugins/src/cre'
import { makeGetConfigArtifacts } from '@sphinx-labs/plugins/src/hardhat/artifacts'
import { expect } from 'chai'
import { Contract, ethers } from 'ethers'

const DUMMY_ORG_ID = '1111'

const cre = createSphinxRuntime(
  'hardhat',
  true,
  hre.config.networks.hardhat.allowUnlimitedContractSize,
  true,
  hre.config.paths.compilerConfigs,
  hre,
  false
)

const threshold = 1

// We use the second and third accounts on the Hardhat network for the owner and the relayer,
// respectively, because the first account is used by the executor. The relayer is the account that
// executes the transactions on the SphinxAuth contract, but does not execute the contract
// deployment on the SphinxManager.
const ownerPrivateKey =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const relayerPrivateKey =
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'

if (!process.env.IPFS_API_KEY_SECRET || !process.env.IPFS_PROJECT_ID) {
  throw new Error(
    'IPFS_API_KEY_SECRET and IPFS_PROJECT_ID must be set to run automated executor tests'
  )
}

// The name of the network is Goerli because we must supply a live network that's supported by
// Sphinx. We're not actually running the test on Goerli though; the RPC URL is localhost.
const network = 'goerli'

const isTestnet = true

describe('Remote executor', () => {
  let Proxy: Contract
  let Immutable: Contract
  before(async () => {
    const provider = new ethers.providers.JsonRpcProvider(
      'http://127.0.0.1:8545'
    )
    const owner = new ethers.Wallet(ownerPrivateKey, provider)
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const projectName = 'RemoteExecutorTest'
    const proxyReferenceName = 'Proxy'
    const proxyContractName = 'ExecutorProxyTest'
    const immutableReferenceName = 'Immutable'
    const immutableContractName = 'ExecutorImmutableTest'

    const owners = [owner.address]
    const userConfig: UserConfigWithOptions = {
      projectName,
      options: {
        orgId: DUMMY_ORG_ID,
        owners,
        threshold,
        testnets: [network],
        mainnets: [],
        proposers: [owner.address],
      },
      contracts: {
        [proxyReferenceName]: {
          contract: proxyContractName,
          kind: 'proxy',
          variables: {
            number: 1,
            stored: true,
            storageName: 'First',
            otherStorage: '0x1111111111111111111111111111111111111111',
          },
        },
        [immutableReferenceName]: {
          contract: immutableContractName,
          kind: 'immutable',
          constructorArgs: {
            _val: 1,
          },
        },
      },
    }

    const authData = getAuthData(owners, threshold)
    const authAddress = getAuthAddress(owners, threshold, projectName)
    const managerAddress = getSphinxManagerAddress(authAddress, projectName)

    await ensureSphinxInitialized(provider, relayer)

    const { parsedConfig, configCache, configArtifacts } =
      await getParsedConfigWithOptions(
        userConfig,
        managerAddress,
        isTestnet,
        provider,
        cre,
        makeGetConfigArtifacts(hre)
      )

    const chainId = SUPPORTED_NETWORKS[network]
    const prevConfig = getEmptyCanonicalConfig(
      [chainId],
      managerAddress,
      DUMMY_ORG_ID,
      projectName
    )
    const leafs = await getAuthLeafsForChain(
      chainId,
      parsedConfig,
      configArtifacts,
      configCache,
      prevConfig
    )

    const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

    const AuthFactory = new ethers.Contract(
      AUTH_FACTORY_ADDRESS,
      AuthFactoryABI,
      relayer
    )
    const Manager = new ethers.Contract(
      managerAddress,
      SphinxManagerABI,
      relayer
    )
    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    // We set the `registryData` to `[]` since this version of the SphinxManager doesn't use it.
    await AuthFactory.deploy(authData, [], projectName)

    const { leaf: setupLeaf, proof: setupProof } = findBundledLeaf(
      bundledLeafs,
      0,
      chainId
    )
    const { leaf: proposalLeaf, proof: proposalProof } = findBundledLeaf(
      bundledLeafs,
      1,
      chainId
    )
    const { leaf: approvalLeaf, proof: approvalProof } = findBundledLeaf(
      bundledLeafs,
      2,
      chainId
    )

    const { configUri, compilerConfig } = await getProjectBundleInfo(
      parsedConfig,
      configArtifacts,
      configCache
    )
    const { bundles } = compilerConfig

    // Commit the project to IPFS.
    await sphinxCommitAbstractSubtask(
      parsedConfig,
      true,
      configArtifacts,
      bundles
    )

    const signature = await signAuthRootMetaTxn(owner, root)

    await Auth.setup(root, setupLeaf, [signature], setupProof)

    await Auth.propose(root, proposalLeaf, [signature], proposalProof)

    await Auth.approveDeployment(root, approvalLeaf, [signature], approvalProof)

    // Sanity check that the deployment has been approved.
    const deploymentId = getDeploymentId(bundles, configUri)

    expect(await Manager.activeDeploymentId()).equals(deploymentId)

    await monitorExecution(
      provider,
      owner,
      parsedConfig,
      bundles,
      deploymentId,
      true // Flip to false to see the status of the remote execution.
    )

    Proxy = await hre.ethers.getContractAt(
      proxyContractName,
      getTargetAddress(managerAddress, proxyReferenceName)
    )

    Immutable = await hre.ethers.getContractAt(
      immutableContractName,
      getTargetAddress(managerAddress, immutableReferenceName)
    )
  })

  it('does deploy proxied contract remotely', async () => {
    expect(await Proxy.number()).to.equal(1)
    expect(await Proxy.stored()).to.equal(true)
    expect(await Proxy.storageName()).to.equal('First')
    expect(await Proxy.otherStorage()).to.equal(
      '0x1111111111111111111111111111111111111111'
    )
  })

  it('does deploy non-proxy contract remotely', async () => {
    expect(await Immutable.val()).equals(1)
  })
})
