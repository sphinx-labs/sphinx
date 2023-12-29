import { exec } from 'child_process'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  Create2ActionInput,
  ParsedConfig,
  ProposalRequest,
  SphinxPreview,
  execAsync,
  getNetworkNameForChainId,
  getSphinxWalletPrivateKey,
  sleep,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as MyLargeContractArtifact from '../../../out/artifacts/MyContracts.sol/MyLargeContract.json'
import * as RevertDuringSimulation from '../../../out/artifacts/RevertDuringSimulation.s.sol/RevertDuringSimulation.json'
import { propose } from '../../../src/cli/propose'
import { readInterface } from '../../../src/foundry/utils'
import { FoundryToml, getFoundryToml } from '../../../src/foundry/options'
import { deploy } from '../../../src/cli/deploy'
import {
  getSphinxModuleAddressFromScript,
  makeMockSphinxContext,
} from '../utils'
import { SphinxContext } from '../../../src/cli/context'

chai.use(chaiAsPromised)
const expect = chai.expect

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

const coder = new ethers.AbiCoder()

const sphinxApiKey = 'test-api-key'
const ownerAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const sepoliaRpcUrl = `http://127.0.0.1:42111`

describe('Propose CLI command', () => {
  let foundryToml: FoundryToml
  let sphinxPluginTypesInterface: ethers.Interface

  before(async () => {
    process.env['SPHINX_API_KEY'] = sphinxApiKey
    foundryToml = await getFoundryToml()
    sphinxPluginTypesInterface = readInterface(
      foundryToml.artifactFolder,
      'SphinxPluginTypes'
    )
  })

  beforeEach(async () => {
    // Start Anvil nodes with fresh states. We must use `exec`
    // instead of `execAsync` because the latter will hang indefinitely.
    exec(`anvil --chain-id 1 --port 42001 --silent &`)
    exec(`anvil --chain-id 11155111 --port 42111 --silent &`)
    exec(`anvil --chain-id 10 --port 42010 --silent &`)
    await sleep(1000)
  })

  afterEach(async () => {
    // Exit the Anvil nodes
    await execAsync(`kill $(lsof -t -i:42001)`)
    await execAsync(`kill $(lsof -t -i:42111)`)
    await execAsync(`kill $(lsof -t -i:42010)`)
  })

  it('Proposes with preview on a single testnet', async () => {
    // We run `forge clean` to ensure that a proposal can occur even if we're running
    // a fresh compilation process.
    await execAsync(`forge clean`)

    const scriptPath = 'contracts/test/script/Simple.s.sol'
    const isTestnet = true
    const targetContract = 'Simple1'
    const context = makeMockSphinxContext([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { proposalRequest, parsedConfigArray, configArtifacts } =
      await propose(
        false, // Run preview
        isTestnet,
        true, // Dry run
        true, // Silent
        scriptPath,
        context,
        targetContract,
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
        true
      )

    // This prevents a TypeScript type error.
    if (!parsedConfigArray || !proposalRequest || !configArtifacts) {
      throw new Error(`Expected field(s) to be defined`)
    }

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    assertValidProposalRequest(
      proposalRequest,
      'Simple Project 1',
      isTestnet,
      [11155111],
      [
        {
          networkTags: ['sepolia (local)'],
          executing: [
            {
              address: proposalRequest.safeAddress,
              functionName: 'deploy',
              referenceName: 'GnosisSafe',
              variables: [],
            },
            {
              address: proposalRequest.moduleAddress,
              functionName: 'deploy',
              referenceName: 'SphinxModule',
              variables: [],
            },
            {
              address: expectedContractAddress,
              functionName: 'deploy',
              referenceName: 'MyContract2',
              variables: [],
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: ['2'],
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
      scriptPath,
      proposalRequest.gasEstimates,
      parsedConfigArray,
      context,
      foundryToml,
      sphinxPluginTypesInterface,
      false, // Gnosis Safe and Sphinx Module haven't been deployed yet.
      targetContract
    )
  })

  it('Proposes without preview on multiple production networks', async () => {
    const scriptPath = 'contracts/test/script/Simple.s.sol'
    const isTestnet = false
    const targetContract = 'Simple1'
    const context = makeMockSphinxContext([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { proposalRequest, parsedConfigArray, configArtifacts } =
      await propose(
        true, // Skip preview
        isTestnet,
        true, // Dry run
        true, // Silent
        scriptPath,
        context,
        targetContract,
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
        true
        // Use the standard prompt. This should be skipped because we're skipping the preview. If it's
        // not skipped, then this test will timeout, because we won't be able to confirm the proposal.
      )

    // This prevents a TypeScript type error.
    if (!parsedConfigArray || !proposalRequest || !configArtifacts) {
      throw new Error(`Expected field(s) to be defined`)
    }

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
      'Simple Project 1',
      isTestnet,
      [1, 10],
      [
        {
          networkTags: ['ethereum (local)'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: [],
              address: proposalRequest.safeAddress,
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: [],
              address: proposalRequest.moduleAddress,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: [],
              address: expectedContractAddressEthereum,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: ['2'],
              address: expectedContractAddressEthereum,
            },
          ],
          skipping: [],
        },
        {
          networkTags: ['optimism (local)'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: [],
              address: proposalRequest.safeAddress,
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: [],
              address: proposalRequest.moduleAddress,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: [],
              address: expectedContractAddressOptimism,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'incrementMyContract2',
              variables: ['2'],
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
      scriptPath,
      proposalRequest.gasEstimates,
      parsedConfigArray,
      context,
      foundryToml,
      sphinxPluginTypesInterface,
      false, // Gnosis Safe and Sphinx Module haven't been deployed yet.
      targetContract
    )
  })

  // We'll propose a script that deploys a contract near the contract size limit. We'll deploy it
  // dozens of times in the script.
  it('Proposes large deployment', async () => {
    const scriptPath = 'contracts/test/script/Large.s.sol'
    const isTestnet = true
    const context = makeMockSphinxContext([
      'contracts/test/MyContracts.sol:MyLargeContract',
    ])
    const { proposalRequest, parsedConfigArray, configArtifacts } =
      await propose(
        true, // Skip preview
        isTestnet,
        true, // Dry run
        true, // Silent
        scriptPath,
        context,
        undefined, // Only one contract in the script file, so there's no target contract to specify.
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
        true
      )

    // This prevents a TypeScript type error.
    if (!parsedConfigArray || !proposalRequest || !configArtifacts) {
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
        variables: [],
        address,
      }
    })

    assertValidProposalRequest(
      proposalRequest,
      'Large Project',
      isTestnet,
      [11155111],
      [
        {
          networkTags: ['sepolia (local)'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: [],
              address: proposalRequest.safeAddress,
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: [],
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
      scriptPath,
      proposalRequest.gasEstimates,
      parsedConfigArray,
      context,
      foundryToml,
      sphinxPluginTypesInterface,
      false // Gnosis Safe and Sphinx Module haven't been deployed yet.
    )
  })

  it('Proposes for a Gnosis Safe and Sphinx Module that have already executed a deployment', async () => {
    const scriptPath = 'contracts/test/script/Simple.s.sol'
    const { parsedConfig: firstParsedConfig } = await deploy(
      scriptPath,
      'sepolia',
      true, // Skip preview
      true, // Silent
      makeMockSphinxContext(['contracts/test/MyContracts.sol:MyContract2']),
      'Simple1',
      false, // Don't verify on Etherscan
      true // Skip force recompile
    )

    if (!firstParsedConfig) {
      throw new Error(`The ParsedConfig is not defined.`)
    }

    const targetContract = 'Simple2'
    const isTestnet = true
    const context = makeMockSphinxContext([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { proposalRequest, parsedConfigArray, configArtifacts } =
      await propose(
        false, // Run preview
        isTestnet,
        true, // Dry run
        true, // Silent
        scriptPath,
        context,
        targetContract,
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
        true
      )

    // This prevents a TypeScript type error.
    if (!parsedConfigArray || !proposalRequest || !configArtifacts) {
      throw new Error(`Expected field(s) to be defined`)
    }

    // Check that the same Gnosis Safe and Sphinx Module are used for both deployments.
    expect(proposalRequest.safeAddress).equals(firstParsedConfig.safeAddress)
    expect(proposalRequest.moduleAddress).equals(
      firstParsedConfig.moduleAddress
    )

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      '0x' + '00'.repeat(31) + '02',
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    assertValidProposalRequest(
      proposalRequest,
      'Simple Project 2',
      isTestnet,
      [11155111],
      [
        {
          networkTags: ['sepolia (local)'],
          executing: [
            {
              address: expectedContractAddress,
              functionName: 'deploy',
              referenceName: 'MyContract2',
              variables: [],
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
      scriptPath,
      proposalRequest.gasEstimates,
      parsedConfigArray,
      context,
      foundryToml,
      sphinxPluginTypesInterface,
      true, // Gnosis Safe and Sphinx Module were already deployed.
      targetContract
    )
  })

  // We exit early even if the Gnosis Safe and Sphinx Module haven't been deployed yet. In other
  // words, we don't allow the user to submit a proposal that just deploys a Gnosis Safe and Sphinx
  // Module.
  it('Exits early if there is nothing to execute on any network', async () => {
    const { proposalRequest, parsedConfigArray } = await propose(
      false, // Show preview
      false, // Is prod network
      true, // Dry run
      true, // Silent
      'contracts/test/script/Empty.s.sol',
      makeMockSphinxContext([]),
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      // Skip force re-compiling. (This test would take a really long time otherwise. The correct
      // artifacts will always be used in CI because we don't modify the contracts source files
      // during our test suite).
      true
    )

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
    const context = makeMockSphinxContext([
      'contracts/test/MyContracts.sol:MyContract2',
    ])
    const { proposalRequest, parsedConfigArray, configArtifacts } =
      await propose(
        false, // Show preview
        isTestnet,
        true, // Dry run
        true, // Silent
        scriptPath,
        context,
        undefined, // Only one contract in the script file, so there's no target contract to specify.
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
        true
      )

    // This prevents a TypeScript type error.
    if (!parsedConfigArray || !proposalRequest || !configArtifacts) {
      throw new Error(`Expected field(s) to be defined`)
    }

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    assertValidProposalRequest(
      proposalRequest,
      'Partially Empty',
      isTestnet,
      // Optimism is not included in the `chainIds` array because there's nothing to execute on it.
      [1],
      [
        {
          networkTags: ['ethereum (local)'],
          executing: [
            {
              referenceName: 'GnosisSafe',
              functionName: 'deploy',
              variables: [],
              address: proposalRequest.safeAddress,
            },
            {
              referenceName: 'SphinxModule',
              functionName: 'deploy',
              variables: [],
              address: proposalRequest.moduleAddress,
            },
            {
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: [],
              address: expectedContractAddress,
            },
          ],
          skipping: [],
        },
        {
          networkTags: ['optimism (local)'],
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
      scriptPath,
      proposalRequest.gasEstimates,
      parsedConfigArray,
      context,
      foundryToml,
      sphinxPluginTypesInterface,
      false // Gnosis Safe and Sphinx Module haven't been deployed yet.
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

    // We have to override process.exit and stdout so we can capture the exit code and output
    // This also prevents mocha from being killed when we call process.exit
    let code: number | undefined
    const originalExit = process.exit
    process.exit = (exitCode) => {
      code = exitCode
      console.log('exit called')
      throw new Error('process.exit called')
    }

    const originalWrite = process.stdout.write
    const capturedOutput: string[] = []

    console.log = (chunk: string) => {
      if (typeof chunk === 'string') {
        capturedOutput.push(chunk)
      }
      return true
    }

    try {
      await propose(
        false, // Show preview
        false, // is mainnet
        true, // Dry run
        true, // Silent
        scriptPath,
        makeMockSphinxContext([`${scriptPath}:RevertDuringSimulation`]),
        'RevertDuringSimulation_Script', // Only one contract in the script file, so there's no target contract to specify.
        // Skip force re-compiling. (This test would take a really long time otherwise. The correct
        // artifacts will always be used in CI because we don't modify the contracts source files
        // during our test suite).
        true
      )
    } catch (e) {
      if (!e.message.includes('process.exit called')) {
        throw e
      }
    }

    process.exit = originalExit
    process.stdout.write = originalWrite

    expect(code).equals(1)
    const expectedOutput =
      `Sphinx: failed to execute deployment because the following action reverted: RevertDuringSimulation<${expectedContractAddress}>.deploy(\n` +
      `     "${sphinxModuleAddress}"\n` +
      `   )`
    expect(capturedOutput.join('')).contains(expectedOutput)
  })
})

/**
 * Validates the `gasEstimates` array in the ProposalRequest. This mainly checks that the the
 * estimated gas is 35% to 55% greater than the actual gas used in the deployment. Although we
 * specify a gas estimate multiplier of 30% when calculating the gas estimates in the proposal
 * simulation, this tends to produce gas estimates that are roughly 35% to 55% higher than the
 * actual gas used.
 */
const assertValidGasEstimates = async (
  scriptPath: string,
  networkGasEstimates: ProposalRequest['gasEstimates'],
  parsedConfigArray: Array<ParsedConfig>,
  sphinxContext: SphinxContext,
  foundryToml: FoundryToml,
  sphinxPluginTypesInterface: ethers.Interface,
  isModuleAndGnosisSafeDeployed: boolean,
  targetContract?: string
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

    // Change the executor's address from the `ManagedService` contract to an auto-generated Sphinx
    // private key. This is necessary because we need a private key to broadcast the deployment on
    // Anvil.
    parsedConfig.executorAddress = new ethers.Wallet(
      getSphinxWalletPrivateKey(0)
    ).address

    const networkName = getNetworkNameForChainId(BigInt(chainId))

    const rpcUrl = foundryToml.rpcEndpoints[networkName]
    if (!rpcUrl) {
      throw new Error(`Could not find RPC URL for: ${networkName}.`)
    }

    const {
      moduleAndGnosisSafeBroadcast,
      approvalBroadcast,
      executionBroadcast,
    } = await deploy(
      scriptPath,
      networkName,
      true, // Skip preview
      true, // Silent
      sphinxContext,
      targetContract,
      false, // Don't verify on block explorer
      true // Skip force recompile
    )

    if (!executionBroadcast || !approvalBroadcast) {
      throw new Error(`Could not load approval or execution broadcast folder.`)
    }

    let moduleAndGnosisSafeGasUsedHexString: string
    if (isModuleAndGnosisSafeDeployed) {
      expect(moduleAndGnosisSafeBroadcast).to.be.undefined
      moduleAndGnosisSafeGasUsedHexString = '0x00'
    } else {
      // Narrow the TypeScript type of the broadcast
      if (!moduleAndGnosisSafeBroadcast) {
        throw new Error(`Could not load deployment broadcast folder.`)
      }

      // Check that there's a single receipt for the broadcast file that deployed the Gnosis Safe and
      // Sphinx Module.
      expect(moduleAndGnosisSafeBroadcast.receipts.length).equals(1)

      moduleAndGnosisSafeGasUsedHexString =
        moduleAndGnosisSafeBroadcast.receipts[0].gasUsed
    }

    expect(approvalBroadcast.receipts.length).equals(1)
    const approvalGasUsedHexString = approvalBroadcast.receipts[0].gasUsed

    // We don't compare the number of actions in the ParsedConfig to the number of receipts in the
    // user's deployment because multiple actions may be batched into a single call to the Sphinx
    // Module's `execute` function.

    // Calculate the amount of gas used in the transaction receipts.
    const actualGasUsed = executionBroadcast.receipts
      .map((receipt) => receipt.gasUsed)
      // Add the gas used to deploy the Gnosis Safe and Sphinx Module. This equals 0 if they were
      // already deployed.
      .concat(moduleAndGnosisSafeGasUsedHexString)
      // Add the gas used by the `approve` transaction.
      .concat(approvalGasUsedHexString)
      // Convert the gas values from hex strings to decimal strings.
      .map((gas) => parseInt(gas, 16))
      // Sum the gas values
      .reduce((a, b) => a + b)

    // Checks if the estimated gas is 35% to 55% greater than the actual gas used. We use a range to
    // allow for fluctuations in the gas estimation logic.
    expect(Number(estimatedGas)).to.be.above(actualGasUsed * 1.35)
    expect(Number(estimatedGas)).to.be.below(actualGasUsed * 1.55)
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
