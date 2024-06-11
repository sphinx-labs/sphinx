import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  Create2ActionInput,
  ExecutionMode,
  ProposalRequest,
  SphinxJsonRpcProvider,
  SphinxPreview,
  ensureSphinxAndGnosisSafeDeployed,
  execAsync,
  fetchChainIdForNetwork,
  getSphinxWalletPrivateKey,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as MyLargeContractArtifact from '../../../out/artifacts/MyContracts.sol/MyLargeContract.json'
import { propose } from '../../../src/cli/propose'
import { deploy } from '../../../src/cli/deploy'
import { makeMockSphinxContextForIntegrationTests } from '../mock'
import { killAnvilNodes, startAnvilNodes, getAnvilRpcUrl } from '../common'

chai.use(chaiAsPromised)
const expect = chai.expect

const sphinxApiKey = 'test-api-key'
const sepoliaRpcUrl = `http://127.0.0.1:42111`

const allNetworkNames = ['ethereum', 'optimism', 'sepolia']

describe('Propose CLI command', () => {
  let originalEnv: NodeJS.ProcessEnv

  before(async () => {
    // Store the original environment variables. We'll reset them after this test suite is finished.
    originalEnv = { ...process.env }

    process.env['SPHINX_API_KEY'] = sphinxApiKey
    process.env['ETH_SEPOLIA_URL'] = sepoliaRpcUrl
    process.env['ETH_MAINNET_URL'] = getAnvilRpcUrl(
      fetchChainIdForNetwork('ethereum')
    )
    process.env['OPT_MAINNET_URL'] = getAnvilRpcUrl(
      fetchChainIdForNetwork('optimism')
    )
  })

  after(() => {
    process.env = originalEnv
  })

  beforeEach(async () => {
    const allChainIds = allNetworkNames.map((network) =>
      fetchChainIdForNetwork(network)
    )
    // Make sure that the Anvil nodes aren't running.
    await killAnvilNodes(allChainIds)
    // Start the Anvil nodes.
    await startAnvilNodes(allChainIds)

    // Deploy the system contracts on all the Anvil nodes used in this test suite.
    allChainIds.map(async (chainId) => {
      const rpcUrl = getAnvilRpcUrl(chainId)
      // Narrow the TypeScript type of the RPC URL.
      if (!rpcUrl) {
        throw new Error(`Could not find RPC URL.`)
      }
      const provider = new SphinxJsonRpcProvider(rpcUrl)
      const wallet = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)
      await ensureSphinxAndGnosisSafeDeployed(
        provider,
        wallet,
        ExecutionMode.Platform,
        true
      )
    })
  })

  afterEach(async () => {
    await killAnvilNodes(
      allNetworkNames.map((network) => fetchChainIdForNetwork(network))
    )
  })

  it('Proposes with preview on a single testnet', async () => {
    // We run `forge clean` to ensure that a proposal can occur even if there are no existing
    // contract artifacts. This is worthwhile to test because we read contract interfaces in the
    // `propose` function, which will fail if the function hasn't compiled the contracts yet. By
    // running `forge clean` here, we're testing that this compilation occurs in the `propose`
    // function.
    await execAsync(`forge clean`)

    const scriptPath = 'contracts/test/script/Simple.s.sol'
    const isTestnet = true
    const networks = ['sepolia']
    const targetContract = 'Simple1'

    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { proposalRequest, networkConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: false, // Run preview
        networks,
        isDryRun: false,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract,
      })

    // This prevents a TypeScript type error.
    if (
      !networkConfigArray ||
      !proposalRequest ||
      !configArtifacts ||
      !merkleTree
    ) {
      throw new Error(`Expected field(s) to be defined`)
    }

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    expect(prompt.called).to.be.true

    assertValidProposalRequest(
      proposalRequest,
      'Simple_Project',
      isTestnet,
      [11155111],
      [
        {
          networkTags: ['sepolia'],
          executing: [
            {
              address: proposalRequest.safeAddress,
              functionName: 'deploy',
              referenceName: 'GnosisSafe',
              variables: {},
              value: '0',
            },
            {
              address: proposalRequest.moduleAddress,
              functionName: 'deploy',
              referenceName: 'SphinxModule',
              variables: {},
              value: '0',
            },
            {
              address: expectedContractAddress,
              functionName: 'deploy',
              referenceName: 'MyContract2',
              variables: {},
              value: '0',
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: { _num: '2' },
              address: expectedContractAddress,
              value: '0',
            },
          ],
          skipping: [],
          chainId: '11155111',
          safeAddress: proposalRequest.safeAddress,
        },
      ]
    )

    // Check that the DeploymentConfig array contains a contract with the correct address.
    expect(networkConfigArray.length).to.equal(1)
    const networkConfig = networkConfigArray[0]
    expect(
      (networkConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddress)
  })

  it('Proposes without preview using --mainnets', async () => {
    const scriptPath = 'contracts/test/script/Simple.s.sol'
    const isTestnet = false
    const networks = ['ethereum', 'optimism_mainnet']
    const targetContract = 'Simple1'
    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyContract2',
    ])

    const { proposalRequest, networkConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: true, // Skip preview
        networks,
        isDryRun: false,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract,
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
      })

    // This prevents a TypeScript type error.
    if (
      !networkConfigArray ||
      !proposalRequest ||
      !configArtifacts ||
      !merkleTree
    ) {
      throw new Error(`Expected field(s) to be defined`)
    }

    // Check that the prompt was skipped.
    expect(prompt.called).to.be.false

    const expectedContractAddressEthereum = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )
    const expectedContractAddressOptimism = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      '0x' + '00'.repeat(31) + '01',
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    assertValidProposalRequest(
      proposalRequest,
      'Simple_Project',
      isTestnet,
      [1, 10],
      [
        {
          networkTags: ['ethereum'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.safeAddress,
              value: '0',
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.moduleAddress,
              value: '0',
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: {},
              address: expectedContractAddressEthereum,
              value: '0',
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: { _num: '2' },
              address: expectedContractAddressEthereum,
              value: '0',
            },
          ],
          skipping: [],
          chainId: '1',
          safeAddress: proposalRequest.safeAddress,
        },
        {
          networkTags: ['optimism'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.safeAddress,
              value: '0',
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.moduleAddress,
              value: '0',
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: {},
              address: expectedContractAddressOptimism,
              value: '0',
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: { _num: '2' },
              address: expectedContractAddressOptimism,
              value: '0',
            },
          ],
          skipping: [],
          chainId: '10',
          safeAddress: proposalRequest.safeAddress,
        },
      ]
    )

    // Check that the DeploymentConfig array contains contracts with the correct addresses.
    expect(networkConfigArray.length).to.equal(2)
    const [ethereumConfig, optimismConfig] = networkConfigArray
    expect(
      (ethereumConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddressEthereum)
    expect(
      (optimismConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddressOptimism)
  })

  // We'll propose a script that deploys a contract near the contract size limit. We'll deploy it
  // dozens of times in the script.
  it('Proposes large deployment with custom script entry point', async () => {
    const scriptInputParam = 50
    const scriptPath = 'contracts/test/script/Large.s.sol'
    const isTestnet = true
    const networks = ['sepolia']
    const sig = ['deploy(uint256)', scriptInputParam.toString()]
    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyLargeContract',
    ])
    const { proposalRequest, networkConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: true, // Skip preview
        networks,
        isDryRun: false,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract: undefined, // Only one contract in the script file, so there's no target contract to specify.
        sig,
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
      })

    // This prevents a TypeScript type error.
    if (
      !networkConfigArray ||
      !proposalRequest ||
      !configArtifacts ||
      !merkleTree
    ) {
      throw new Error(`Expected field(s) to be defined`)
    }

    const expectedContractAddresses: Array<string> = []
    for (let i = 0; i < scriptInputParam; i++) {
      // Generate the salt: a 32-byte hex string left-padded with zeros. Each salt is incremented by
      // one. E.g. the first salt is '0x000...000', the next is '0x000...001', etc.
      const salt = '0x' + i.toString(16).padStart(64, '0')

      const address = ethers.getCreate2Address(
        DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        salt,
        ethers.keccak256(MyLargeContractArtifact.bytecode.object)
      )

      expectedContractAddresses.push(address)
    }

    const previewElements = expectedContractAddresses.map((address) => {
      return {
        referenceName: 'MyLargeContract',
        functionName: 'deploy',
        variables: {},
        address,
        value: '0',
      }
    })

    // Check that the prompt was skipped.
    expect(prompt.called).to.be.false

    assertValidProposalRequest(
      proposalRequest,
      'Simple_Project',
      isTestnet,
      [11155111],
      [
        {
          networkTags: ['sepolia'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.safeAddress,
              value: '0',
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.moduleAddress,
              value: '0',
            },
            ...previewElements,
          ],
          skipping: [],
          chainId: '11155111',
          safeAddress: proposalRequest.safeAddress,
        },
      ]
    )

    // Check that the DeploymentConfig array contains contracts with the correct addresses.
    expect(networkConfigArray.length).to.equal(1)
    const networkConfig = networkConfigArray[0]
    for (let i = 0; i < 50; i++) {
      expect(
        (networkConfig.actionInputs[i] as Create2ActionInput).create2Address
      ).equals(expectedContractAddresses[i])
    }
  })

  it('Dry runs for a Gnosis Safe and Sphinx Module that have already executed a deployment', async () => {
    const scriptPath = 'contracts/test/script/Simple.s.sol'
    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { deploymentConfig } = await deploy({
      scriptPath,
      network: 'sepolia',
      skipPreview: true,
      silent: true,
      sphinxContext: context,
      verify: false,
      targetContract: 'Simple1',
    })

    if (!deploymentConfig) {
      throw new Error(`The DeploymentConfig is not defined.`)
    }

    const firstNetworkConfig = deploymentConfig.networkConfigs.at(0)
    if (!firstNetworkConfig) {
      throw new Error(`The NetworkConfig is not defined.`)
    }

    const targetContract = 'Simple2'
    const isTestnet = true
    const networks = ['sepolia']
    const { proposalRequest, networkConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: false,
        networks,
        isDryRun: true,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract,
      })

    // This prevents a TypeScript type error.
    if (
      !networkConfigArray ||
      !proposalRequest ||
      !configArtifacts ||
      !merkleTree
    ) {
      throw new Error(`Expected field(s) to be defined`)
    }

    expect(prompt.called).to.be.false

    // Check that the same Gnosis Safe and Sphinx Module are used for both deployments.
    expect(proposalRequest.safeAddress).equals(firstNetworkConfig.safeAddress)
    expect(proposalRequest.moduleAddress).equals(
      firstNetworkConfig.moduleAddress
    )

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      '0x' + '00'.repeat(31) + '02',
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    assertValidProposalRequest(
      proposalRequest,
      'Simple_Project',
      isTestnet,
      [11155111],
      [
        {
          networkTags: ['sepolia'],
          executing: [
            {
              address: expectedContractAddress,
              functionName: 'deploy',
              referenceName: 'MyContract2',
              variables: {},
              value: '0',
            },
          ],
          skipping: [],
          chainId: '11155111',
          safeAddress: proposalRequest.safeAddress,
        },
      ]
    )

    // Check that the DeploymentConfig array contains a contract with the correct address.
    expect(networkConfigArray.length).to.equal(1)
    const networkConfig = networkConfigArray[0]
    expect(
      (networkConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddress)
  })

  // We exit early even if the Gnosis Safe and Sphinx Module haven't been deployed yet. In other
  // words, we don't allow the user to submit a proposal that just deploys a Gnosis Safe and Sphinx
  // Module.
  it('Exits early if there is nothing to execute on any network', async () => {
    const { context } = makeMockSphinxContextForIntegrationTests([])
    const { proposalRequest, networkConfigArray } = await propose({
      confirm: false, // Show preview
      networks: ['ethereum', 'optimism_mainnet'],
      isDryRun: true,
      silent: true,
      scriptPath: 'contracts/test/script/Empty.s.sol',
      sphinxContext: context,
      targetContract: undefined,
      // Skip force re-compiling. (This test would take a really long time otherwise. The correct
      // artifacts will always be used in CI because we don't modify the contracts source files
      // during our test suite).
    })

    expect(proposalRequest).to.be.undefined
    expect(networkConfigArray).to.be.undefined
  })

  // In this test case, there is a deployment to execute on one chain and nothing to execute on
  // another chain. We expect that the user's deployment will be proposed on the first chain and
  // entirely skipped on the other, even if a Gnosis Safe and Sphinx Module haven't been deployed on
  // that network yet.
  it('Proposes on one chain and skips proposal on a different chain', async () => {
    const scriptPath = 'contracts/test/script/PartiallyEmpty.s.sol'
    const isTestnet = false
    const networks = ['ethereum', 'optimism_mainnet']
    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { proposalRequest, networkConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: false, // Show preview
        networks,
        isDryRun: true,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract: undefined,
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
      })

    // This prevents a TypeScript type error.
    if (
      !networkConfigArray ||
      !proposalRequest ||
      !configArtifacts ||
      !merkleTree
    ) {
      throw new Error(`Expected field(s) to be defined`)
    }

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    expect(prompt.called).to.be.false

    assertValidProposalRequest(
      proposalRequest,
      'Simple_Project',
      isTestnet,
      // Optimism is not included in the `chainIds` array because there's nothing to execute on it.
      [1],
      [
        {
          networkTags: ['ethereum'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.safeAddress,
              value: '0',
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.moduleAddress,
              value: '0',
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: {},
              address: expectedContractAddress,
              value: '0',
            },
          ],
          skipping: [],
          chainId: '1',
          safeAddress: proposalRequest.safeAddress,
        },
        {
          networkTags: ['optimism'],
          executing: [],
          skipping: [],
          chainId: '10',
          safeAddress: proposalRequest.safeAddress,
        },
      ]
    )

    // Check that the DeploymentConfig array contains a contract with the correct address.
    expect(networkConfigArray.length).to.equal(2)
    const ethereumConfig = networkConfigArray[0]
    expect(
      (ethereumConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddress)
    const optimismConfig = networkConfigArray[1]
    expect(optimismConfig.actionInputs.length).equals(0)
  })
})

const assertValidProposalRequest = (
  proposalRequest: ProposalRequest,
  projectName: string,
  isTestnet: boolean,
  chainIds: Array<number>,
  previewNetworks: SphinxPreview['networks']
) => {
  expect(proposalRequest.apiKey).to.equal(sphinxApiKey)
  expect(proposalRequest.orgId).to.equal('test-org-id')
  expect(proposalRequest.isTestnet).to.equal(isTestnet)
  expect(proposalRequest.chainIds).to.deep.equal(chainIds)
  expect(proposalRequest.diff.networks).to.deep.equal(previewNetworks)
}
