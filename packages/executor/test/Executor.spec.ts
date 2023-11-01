import path from 'path'
import '@sphinx-labs/plugins'

import {
  makeAuthBundle,
  getProjectBundleInfo,
  getDeploymentId,
  getAuthLeafsForChain,
  monitorExecution,
  sphinxCommitAbstractSubtask,
  SphinxJsonRpcProvider,
  signAuthRootMetaTxn,
  Setup,
  AUTH_FACTORY_ADDRESS,
  getAuthData,
} from '@sphinx-labs/core'
import {
  AuthABI,
  AuthFactoryABI,
  SphinxManagerABI,
} from '@sphinx-labs/contracts'
import { expect } from 'chai'
import { Contract, ethers } from 'ethers'
import { buildParsedConfigArray } from '@sphinx-labs/plugins/src/cli/propose'

// We use the second and third accounts on the Hardhat network for the owner and the relayer,
// respectively, because the first account is used by the executor. The relayer is the account that
// executes the transactions on the SphinxAuth contract, but does not execute the deployment on the
// SphinxManager, since the executor does that.
const ownerPrivateKey =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const relayerPrivateKey =
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
const projectName = 'Executor Test'

if (!process.env.IPFS_API_KEY_SECRET || !process.env.IPFS_PROJECT_ID) {
  throw new Error(
    'IPFS_API_KEY_SECRET and IPFS_PROJECT_ID must be set to run automated executor tests'
  )
}

const rpcUrl = 'http://127.0.0.1:42420'
const provider = new SphinxJsonRpcProvider(rpcUrl)
const contractAddress = '0x9b5Ec880A158Ba20Ab1AC6AFcC787f22070DD748'

describe('Remote executor', () => {
  let contract: Contract
  before(async () => {
    const owner = new ethers.Wallet(ownerPrivateKey, provider)
    const relayer = new ethers.Wallet(relayerPrivateKey, provider)

    const scriptPath = 'script/ExecutorTest.s.sol'
    const { parsedConfigArray, configArtifacts } = await buildParsedConfigArray(
      scriptPath,
      owner.address,
      true // Is testnet
    )

    const parsedConfig = parsedConfigArray[0]

    const Manager = new ethers.Contract(
      parsedConfig.managerAddress,
      SphinxManagerABI,
      provider
    )
    const Auth = new ethers.Contract(parsedConfig.authAddress, AuthABI, relayer)

    const { configUri, bundles } = await getProjectBundleInfo(
      parsedConfig,
      configArtifacts
    )

    const leafs = await getAuthLeafsForChain(parsedConfig, configArtifacts)

    // Set the proposer to be the owner. Currently, the proposer is the address that corresponds to
    // the private key returned by `SphinxUtils.getSphinxDeployerPrivateKey(0)`. This is default
    // behavior in the Solidity `sphinxDeployTask`, which we called above. If we don't replace this
    // private key, we won't be able to propose the deployment.
    ;(leafs.find((l) => l.index === 0) as Setup).proposers[0].member =
      owner.address

    const authBundle = makeAuthBundle(leafs)

    const signature = await signAuthRootMetaTxn(owner, authBundle.root)
    if (!signature) {
      throw new Error(`Meta transaction signature not found`)
    }

    const { leaf: setupLeaf, proof: setupProof } = authBundle.leafs[0]
    const { leaf: proposalLeaf, proof: proposalProof } = authBundle.leafs[1]
    const { leaf: approvalLeaf, proof: approvalProof } = authBundle.leafs[2]

    // Check that the contract hasn't been deployed yet.
    contract = getContract()
    expect(await provider.getCode(contractAddress)).equals('0x')

    // Commit the project to IPFS.
    await sphinxCommitAbstractSubtask(parsedConfig, true, configArtifacts)

    const AuthFactory = new ethers.Contract(
      AUTH_FACTORY_ADDRESS,
      AuthFactoryABI,
      relayer
    )

    // We set the `registryData` to `0x` since this version of the SphinxManager doesn't use it.
    const authData = getAuthData([owner.address], 1)
    await AuthFactory.deploy(authData, '0x', projectName)

    await Auth.setup(authBundle.root, setupLeaf, [signature], setupProof)

    await Auth.propose(
      authBundle.root,
      proposalLeaf,
      [signature],
      proposalProof
    )

    await Auth.approveDeployment(
      authBundle.root,
      approvalLeaf,
      [signature],
      approvalProof
    )

    // Sanity check that the deployment has been approved.
    const deploymentId = getDeploymentId(
      bundles.actionBundle,
      bundles.targetBundle,
      configUri
    )
    expect(await Manager.activeDeploymentId()).equals(deploymentId)

    await monitorExecution(
      owner,
      parsedConfig,
      bundles,
      deploymentId,
      true // Flip to false to see the status of the remote execution.
    )
  })

  it('does execute remote deployment', async () => {
    expect(await contract.val()).equals(42n)
  })
})

const getContract = (): ethers.Contract => {
  const abi =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(path.resolve('./out/ExecutorTest.sol/ExecutorTest.json')).abi

  const contract = new ethers.Contract(contractAddress, abi, provider)
  return contract
}
