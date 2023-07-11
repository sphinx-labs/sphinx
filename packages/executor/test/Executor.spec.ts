import hre from 'hardhat'
import '@chugsplash/plugins'
import '@nomiclabs/hardhat-ethers'
import {
  AUTH_FACTORY_ADDRESS,
  UserChugSplashConfig,
  ensureChugSplashInitialized,
  getAuthAddress,
  getAuthData,
  getChugSplashManagerAddress,
  makeAuthBundle,
  getParsedOrgConfig,
  signAuthRootMetaTxn,
  getProjectBundleInfo,
  getDeploymentId,
  SUPPORTED_LIVE_NETWORKS,
  getEmptyCanonicalOrgConfig,
  findBundledLeaf,
  getAuthLeafsForChain,
  getTargetAddress,
  monitorExecution,
  chugsplashCommitAbstractSubtask,
} from '@chugsplash/core'
import {
  AuthFactoryABI,
  AuthABI,
  ChugSplashManagerABI,
} from '@chugsplash/contracts'
import { createChugSplashRuntime } from '@chugsplash/plugins/src/cre'
import { makeGetConfigArtifacts } from '@chugsplash/plugins/src/hardhat/artifacts'
import { expect } from 'chai'
import { Contract, ethers } from 'ethers'

const DUMMY_ORG_ID = '1111'

const cre = createChugSplashRuntime(
  true,
  true,
  hre.config.paths.canonicalConfigs,
  hre,
  false
)

const orgThreshold = 1

// We use the second and third accounts on the Hardhat network for the owner and the relayer,
// respectively, because the first account is used by the executor. The relayer is the account that
// executes the transactions on the ChugSplashAuth contract, but does not execute the project
// deployment on the ChugSplashManager.
const ownerPrivateKey =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const relayerPrivateKey =
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'

if (!process.env.IPFS_API_KEY_SECRET || !process.env.IPFS_PROJECT_ID) {
  throw new Error(
    'IPFS_API_KEY_SECRET and IPFS_PROJECT_ID must be set to run automated executor tests'
  )
}

// The name of the network is Goerli because we must supply a network that's supported for org
// configs. We're not actually running the test on Goerli though; the RPC URL is localhost.
const network = 'goerli'

describe('Remote executor', () => {
  let Proxy: Contract
  let Immutable: Contract
  before(async () => {
    const provider = new ethers.providers.JsonRpcProvider(
      'http://localhost:8545'
    )
    const owner = new ethers.Wallet(ownerPrivateKey, provider)
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const orgOwners = [owner.address]
    const userConfig: UserChugSplashConfig = {
      options: {
        orgId: DUMMY_ORG_ID,
        orgOwners,
        orgThreshold,
        networks: [network],
        proposers: [owner.address],
        managers: [owner.address],
      },
      projects: {},
    }

    const authData = getAuthData(orgOwners, orgThreshold)
    const authAddress = getAuthAddress(orgOwners, orgThreshold)
    const deployerAddress = getChugSplashManagerAddress(authAddress)

    const projectName = 'RemoteExecutorTest'
    const proxyReferenceName = 'Proxy'
    const proxyContractName = 'ExecutorProxyTest'
    const immutableReferenceName = 'Immutable'
    const immutableContractName = 'ExecutorImmutableTest'
    const projectThreshold = 1
    userConfig.projects[projectName] = {
      options: {
        projectOwners: [owner.address],
        projectThreshold,
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

    await ensureChugSplashInitialized(provider, relayer)

    const { parsedConfig, configCache, configArtifacts } =
      await getParsedOrgConfig(
        userConfig,
        projectName,
        deployerAddress,
        provider,
        cre,
        makeGetConfigArtifacts(hre)
      )

    const chainId = SUPPORTED_LIVE_NETWORKS[network]
    const prevOrgConfig = getEmptyCanonicalOrgConfig(
      [chainId],
      deployerAddress,
      DUMMY_ORG_ID,
      projectName
    )
    const leafs = await getAuthLeafsForChain(
      chainId,
      parsedConfig,
      configArtifacts,
      configCache,
      prevOrgConfig
    )

    const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

    const AuthFactory = new ethers.Contract(
      AUTH_FACTORY_ADDRESS,
      AuthFactoryABI,
      relayer
    )
    const Deployer = new ethers.Contract(
      deployerAddress,
      ChugSplashManagerABI,
      relayer
    )
    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    // We set the `registryData` to `[]` since this version of the ChugSplashManager doesn't use it.
    await AuthFactory.deploy(authData, [], 0)

    // Fund the ChugSplashManager.
    await owner.sendTransaction({
      to: deployerAddress,
      value: ethers.utils.parseEther('1'),
    })

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
    const { leaf: createProjectLeaf, proof: createProjectProof } =
      findBundledLeaf(bundledLeafs, 2, chainId)
    const { leaf: approvalLeaf, proof: approvalProof } = findBundledLeaf(
      bundledLeafs,
      3,
      chainId
    )

    // Commit the project to IPFS.
    await chugsplashCommitAbstractSubtask(
      parsedConfig.projects[projectName],
      true,
      configArtifacts[projectName]
    )

    const signature = await signAuthRootMetaTxn(owner, root)

    await Auth.setup(root, setupLeaf, [signature], setupProof)

    await Auth.propose(root, proposalLeaf, [signature], proposalProof)

    await Auth.createProject(
      root,
      createProjectLeaf,
      [signature],
      createProjectProof
    )

    await Auth.approveDeployment(root, approvalLeaf, [signature], approvalProof)

    // Sanity check that the deployment has been approved.
    const { configUri, bundles } = await getProjectBundleInfo(
      parsedConfig.projects[projectName],
      configArtifacts[projectName],
      configCache[projectName]
    )
    const deploymentId = getDeploymentId(bundles, configUri, projectName)

    expect(await Deployer.activeDeploymentId()).equals(deploymentId)

    await monitorExecution(
      provider,
      owner,
      parsedConfig.projects[projectName],
      bundles,
      deploymentId,
      true // Flip to false to see the status of the remote execution.
    )

    Proxy = await hre.ethers.getContractAt(
      proxyContractName,
      getTargetAddress(deployerAddress, projectName, proxyReferenceName)
    )

    Immutable = await hre.ethers.getContractAt(
      immutableContractName,
      getTargetAddress(deployerAddress, projectName, immutableReferenceName)
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
