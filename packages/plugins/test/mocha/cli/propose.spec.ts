import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  Create2ActionInput,
  ExecutionMode,
  ParsedConfig,
  ProposalRequest,
  SphinxJsonRpcProvider,
  SphinxPreview,
  ensureSphinxAndGnosisSafeDeployed,
  execAsync,
  fetchChainIdForNetwork,
  fetchNameForNetwork,
  getSphinxWalletPrivateKey,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as MyLargeContractArtifact from '../../../out/artifacts/MyContracts.sol/MyLargeContract.json'
import * as RevertDuringSimulation from '../../../out/artifacts/RevertDuringSimulation.sol/RevertDuringSimulation.json'
import { propose } from '../../../src/cli/propose'
import { deploy } from '../../../src/cli/deploy'
import { makeMockSphinxContextForIntegrationTests } from '../mock'
import {
  killAnvilNodes,
  startAnvilNodes,
  getSphinxModuleAddressFromScript,
  getAnvilRpcUrl,
} from '../common'
import { SphinxContext } from '../../../src/cli/context'

chai.use(chaiAsPromised)
const expect = chai.expect

const coder = new ethers.AbiCoder()

const sphinxApiKey = 'test-api-key'
const ownerAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const sepoliaRpcUrl = `http://127.0.0.1:42111`

const allNetworkNames = ['ethereum', 'optimism', 'sepolia']

describe('Propose CLI command', () => {
  let originalEnv: NodeJS.ProcessEnv

  before(async () => {
    // Store the original environment variables. We'll reset them after this test suite is finished.
    originalEnv = { ...process.env }

    process.env['SPHINX_API_KEY'] = sphinxApiKey
    process.env['SEPOLIA_RPC_URL'] = sepoliaRpcUrl
    process.env['ETHEREUM_RPC_URL'] = getAnvilRpcUrl(
      fetchChainIdForNetwork('ethereum')
    )
    process.env['OPTIMISM_RPC_URL'] = getAnvilRpcUrl(
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
    const targetContract = 'Simple1'

    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { proposalRequest, parsedConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: false, // Run preview
        isTestnet,
        isDryRun: false,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract,
      })

    // This prevents a TypeScript type error.
    if (
      !parsedConfigArray ||
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
      'Simple_Project_1',
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
            },
            {
              address: proposalRequest.moduleAddress,
              functionName: 'deploy',
              referenceName: 'SphinxModule',
              variables: {},
            },
            {
              address: expectedContractAddress,
              functionName: 'deploy',
              referenceName: 'MyContract2',
              variables: {},
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: { _num: '2' },
              address: expectedContractAddress,
            },
          ],
          skipping: [],
        },
      ]
    )

    // Check that the CompilerConfig array contains a contract with the correct address.
    expect(parsedConfigArray.length).to.equal(1)
    const parsedConfig = parsedConfigArray[0]
    expect(
      (parsedConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddress)

    await assertValidGasEstimates(
      proposalRequest.gasEstimates,
      parsedConfigArray,
      scriptPath,
      targetContract,
      context
    )
  })

  it('Proposes without preview on multiple production networks', async () => {
    const scriptPath = 'contracts/test/script/Simple.s.sol'
    const isTestnet = false
    const targetContract = 'Simple1'
    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyContract2',
    ])

    const { proposalRequest, parsedConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: true, // Skip preview
        isTestnet,
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
      !parsedConfigArray ||
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
      'Simple_Project_1',
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
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.moduleAddress,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: {},
              address: expectedContractAddressEthereum,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: { _num: '2' },
              address: expectedContractAddressEthereum,
            },
          ],
          skipping: [],
        },
        {
          networkTags: ['optimism'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.safeAddress,
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.moduleAddress,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: {},
              address: expectedContractAddressOptimism,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: { _num: '2' },
              address: expectedContractAddressOptimism,
            },
          ],
          skipping: [],
        },
      ]
    )

    // Check that the CompilerConfig array contains contracts with the correct addresses.
    expect(parsedConfigArray.length).to.equal(2)
    const [ethereumConfig, optimismConfig] = parsedConfigArray
    expect(
      (ethereumConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddressEthereum)
    expect(
      (optimismConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddressOptimism)

    await assertValidGasEstimates(
      proposalRequest.gasEstimates,
      parsedConfigArray,
      scriptPath,
      targetContract,
      context
    )
  })

  // We'll propose a script that deploys a contract near the contract size limit. We'll deploy it
  // dozens of times in the script.
  it('Proposes large deployment', async () => {
    const scriptPath = 'contracts/test/script/Large.s.sol'
    const isTestnet = true
    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyLargeContract',
    ])
    const { proposalRequest, parsedConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: true, // Skip preview
        isTestnet,
        isDryRun: false,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract: undefined, // Only one contract in the script file, so there's no target contract to specify.
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
      })

    // This prevents a TypeScript type error.
    if (
      !parsedConfigArray ||
      !proposalRequest ||
      !configArtifacts ||
      !merkleTree
    ) {
      throw new Error(`Expected field(s) to be defined`)
    }

    const expectedContractAddresses: Array<string> = []
    for (let i = 0; i < 50; i++) {
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
      }
    })

    // Check that the prompt was skipped.
    expect(prompt.called).to.be.false

    assertValidProposalRequest(
      proposalRequest,
      'Large_Project',
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
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.moduleAddress,
            },
            ...previewElements,
          ],
          skipping: [],
        },
      ]
    )

    // Check that the CompilerConfig array contains contracts with the correct addresses.
    expect(parsedConfigArray.length).to.equal(1)
    const parsedConfig = parsedConfigArray[0]
    for (let i = 0; i < 50; i++) {
      expect(
        (parsedConfig.actionInputs[i] as Create2ActionInput).create2Address
      ).equals(expectedContractAddresses[i])
    }

    await assertValidGasEstimates(
      proposalRequest.gasEstimates,
      parsedConfigArray,
      scriptPath,
      undefined,
      context
    )
  })

  it('Dry runs for a Gnosis Safe and Sphinx Module that have already executed a deployment', async () => {
    const scriptPath = 'contracts/test/script/Simple.s.sol'
    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { compilerConfig: firstCompilerConfig } = await deploy({
      scriptPath,
      network: 'sepolia',
      skipPreview: true,
      silent: true,
      sphinxContext: context,
      verify: false,
      targetContract: 'Simple1',
    })

    if (!firstCompilerConfig) {
      throw new Error(`The ParsedConfig is not defined.`)
    }

    const targetContract = 'Simple2'
    const isTestnet = true
    const { proposalRequest, parsedConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: false,
        isTestnet,
        isDryRun: true,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract,
      })

    // This prevents a TypeScript type error.
    if (
      !parsedConfigArray ||
      !proposalRequest ||
      !configArtifacts ||
      !merkleTree
    ) {
      throw new Error(`Expected field(s) to be defined`)
    }

    expect(prompt.called).to.be.false

    // Check that the same Gnosis Safe and Sphinx Module are used for both deployments.
    expect(proposalRequest.safeAddress).equals(firstCompilerConfig.safeAddress)
    expect(proposalRequest.moduleAddress).equals(
      firstCompilerConfig.moduleAddress
    )

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      '0x' + '00'.repeat(31) + '02',
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    assertValidProposalRequest(
      proposalRequest,
      'Simple_Project_2',
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
            },
          ],
          skipping: [],
        },
      ]
    )

    // Check that the CompilerConfig array contains a contract with the correct address.
    expect(parsedConfigArray.length).to.equal(1)
    const parsedConfig = parsedConfigArray[0]
    expect(
      (parsedConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddress)

    await assertValidGasEstimates(
      proposalRequest.gasEstimates,
      parsedConfigArray,
      scriptPath,
      targetContract,
      context
    )
  })

  // We exit early even if the Gnosis Safe and Sphinx Module haven't been deployed yet. In other
  // words, we don't allow the user to submit a proposal that just deploys a Gnosis Safe and Sphinx
  // Module.
  it('Exits early if there is nothing to execute on any network', async () => {
    const { context } = makeMockSphinxContextForIntegrationTests([])
    const { proposalRequest, parsedConfigArray } = await propose({
      confirm: false, // Show preview
      isTestnet: false,
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
    expect(parsedConfigArray).to.be.undefined
  })

  // In this test case, there is a deployment to execute on one chain and nothing to execute on
  // another chain. We expect that the user's deployment will be proposed on the first chain and
  // entirely skipped on the other, even if a Gnosis Safe and Sphinx Module haven't been deployed on
  // that network yet.
  it('Proposes on one chain and skips proposal on a different chain', async () => {
    const scriptPath = 'contracts/test/script/PartiallyEmpty.s.sol'
    const isTestnet = false
    const { context, prompt } = makeMockSphinxContextForIntegrationTests([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { proposalRequest, parsedConfigArray, configArtifacts, merkleTree } =
      await propose({
        confirm: false, // Show preview
        isTestnet,
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
      !parsedConfigArray ||
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
      'Partially_Empty',
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
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: {},
              address: proposalRequest.moduleAddress,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: {},
              address: expectedContractAddress,
            },
          ],
          skipping: [],
        },
        {
          networkTags: ['optimism'],
          executing: [],
          skipping: [],
        },
      ]
    )

    // Check that the CompilerConfig array contains a contract with the correct address.
    expect(parsedConfigArray.length).to.equal(2)
    const ethereumConfig = parsedConfigArray[0]
    expect(
      (ethereumConfig.actionInputs[0] as Create2ActionInput).create2Address
    ).equals(expectedContractAddress)
    const optimismConfig = parsedConfigArray[1]
    expect(optimismConfig.actionInputs.length).equals(0)

    await assertValidGasEstimates(
      proposalRequest.gasEstimates,
      parsedConfigArray,
      scriptPath,
      undefined,
      context
    )
  })

  // This test checks that the proposal simulation can fail after the transactions have been
  // collected. This is worthwhile to test because the `SphinxModule` doesn't revert if a user's
  // transactions causes the deployment to be marked as `FAILED`. If the Foundry plugin doesn't
  // revert either, then the deployment will be proposed, which is not desirable.
  it('Reverts if the deployment fails during the proposal simulation', async () => {
    const scriptPath = 'contracts/test/script/RevertDuringSimulation.s.sol'
    const sphinxModuleAddress = await getSphinxModuleAddressFromScript(
      scriptPath,
      sepoliaRpcUrl,
      'RevertDuringSimulation_Script'
    )

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(
        ethers.concat([
          RevertDuringSimulation.bytecode.object,
          coder.encode(['address'], [sphinxModuleAddress]),
        ])
      )
    )

    const { context } = makeMockSphinxContextForIntegrationTests([
      `contracts/test/RevertDuringSimulation.sol:RevertDuringSimulation`,
    ])

    let errorThrown = false
    try {
      await propose({
        confirm: false, // Show preview
        isTestnet: false,
        isDryRun: true,
        silent: true,
        scriptPath,
        sphinxContext: context,
        targetContract: 'RevertDuringSimulation_Script', // Only one contract in the script file, so there's no target contract to specify.
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
      })
    } catch (e) {
      errorThrown = true
      const expectedOutput = `The following action reverted during the simulation:\nRevertDuringSimulation<${expectedContractAddress}>.revertDuringSimulation()`
      expect(e.message.includes(expectedOutput)).to.be.true
    }

    expect(errorThrown).to.be.true
  })
})

/**
 * Validates the `gasEstimates` array in the ProposalRequest. This mainly checks that the the
 * estimated gas is 30% greater than the actual gas used in the deployment.
 */
const assertValidGasEstimates = async (
  networkGasEstimates: ProposalRequest['gasEstimates'],
  parsedConfigArray: Array<ParsedConfig>,
  scriptPath: string,
  targetContract: string | undefined,
  context: SphinxContext
) => {
  // Check that the number of gas estimates matches the number of ParsedConfig objects with at least
  // one action.
  expect(networkGasEstimates.length).equals(
    parsedConfigArray.filter(
      (parsedConfig) => parsedConfig.actionInputs.length > 0
    ).length
  )

  // Iterate over each network
  for (const { chainId, estimatedGas } of networkGasEstimates) {
    const parsedConfig = parsedConfigArray.find(
      (config) => config.chainId === chainId.toString()
    )

    if (!parsedConfig) {
      throw new Error(
        `Could not find the ParsedConfig for the current network.`
      )
    }

    const { receipts } = await deploy({
      scriptPath,
      network: fetchNameForNetwork(BigInt(parsedConfig.chainId)),
      skipPreview: false,
      silent: true,
      sphinxContext: context,
      verify: false,
      targetContract,
    })

    if (!receipts) {
      throw new Error('deployment failed for an unexpected reason')
    }

    // We don't compare the number of actions in the ParsedConfig to the number of receipts in the
    // user's deployment because multiple actions may be batched into a single call to the Sphinx
    // Module's `execute` function.

    // Calculate the amount of gas used in the transaction receipts.
    const actualGasUsed = receipts
      .map((receipt) => receipt.gasUsed)
      .map(Number)
      // Sum the gas values
      .reduce((a, b) => a + b, 0)

    const expectedGas = Math.round(actualGasUsed * 1.3)
    const lowerBound = expectedGas * 0.99
    const upperBound = expectedGas * 1.01
    expect(Number(estimatedGas)).to.be.at.least(lowerBound)
    expect(Number(estimatedGas)).to.be.at.most(upperBound)
  }
}

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
  expect(proposalRequest.owners).to.deep.equal([ownerAddress])
  expect(proposalRequest.threshold).to.equal(1)
  expect(proposalRequest.deploymentName).to.equal(projectName)
  expect(proposalRequest.chainIds).to.deep.equal(chainIds)
  expect(proposalRequest.diff.networks).to.deep.equal(previewNetworks)
}
