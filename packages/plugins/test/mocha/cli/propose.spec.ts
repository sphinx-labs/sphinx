import { exec } from 'child_process'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  ProposalRequest,
  SphinxPreview,
  execAsync,
  sleep,
  spawnAsync,
  userConfirmation,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as RevertDuringSimulation from '../../../out/artifacts/RevertDuringSimulation.s.sol/RevertDuringSimulation.json'
import { propose } from '../../../src/cli/propose'
import { getSphinxModuleAddressFromScript } from '../../../src/foundry/utils'

chai.use(chaiAsPromised)
const expect = chai.expect

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

const coder = new ethers.AbiCoder()

const sphinxApiKey = 'test-api-key'
const ownerAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const goerliRpcUrl = `http://127.0.0.1:42005`

describe('Propose CLI command', () => {
  before(() => {
    process.env['SPHINX_API_KEY'] = sphinxApiKey
  })

  beforeEach(async () => {
    // Start Anvil nodes with fresh states. We must use `exec`
    // instead of `execAsync` because the latter will hang indefinitely.
    exec(`anvil --chain-id 1 --port 42001 --silent &`)
    exec(`anvil --chain-id 5 --port 42005 --silent &`)
    exec(`anvil --chain-id 10 --port 42010 --silent &`)
    await sleep(1000)
  })

  afterEach(async () => {
    // Exit the Anvil nodes
    await execAsync(`kill $(lsof -t -i:42001)`)
    await execAsync(`kill $(lsof -t -i:42005)`)
    await execAsync(`kill $(lsof -t -i:42010)`)
  })

  it('Proposes with preview on a single testnet', async () => {
    // We run `forge clean` to ensure that a proposal can occur even if we're running
    // a fresh compilation process.
    await execAsync(`forge clean`)

    const isTestnet = true
    const { proposalRequest, ipfsData } = await propose(
      false, // Run preview
      isTestnet,
      true, // Dry run
      true, // Silent
      'contracts/test/script/Simple.s.sol',
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      // Skip force re-compiling. (This test would take a really long time otherwise. The correct
      // artifacts will always be used in CI because we don't modify the contracts source files
      // during our test suite).
      true,
      mockPrompt
    )

    // This prevents a TypeScript type error.
    if (!ipfsData || !proposalRequest) {
      throw new Error(`Expected ipfsData and proposalRequest to be defined`)
    }

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    assertValidProposalRequest(
      proposalRequest,
      'Simple Project',
      isTestnet,
      [5],
      [
        {
          networkTags: ['goerli (local)'],
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
    const compilerConfigArray = JSON.parse(ipfsData)
    expect(compilerConfigArray.length).to.equal(1)
    const compilerConfig = compilerConfigArray[0]
    expect(compilerConfig.actionInputs[0].create2Address).equals(
      expectedContractAddress
    )
  })

  it('Proposes without preview on multiple production networks', async () => {
    const isTestnet = false
    const { proposalRequest, ipfsData } = await propose(
      true, // Skip preview
      isTestnet,
      true, // Dry run
      true, // Silent
      'contracts/test/script/Simple.s.sol',
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      // Skip force re-compiling. (This test would take a really long time otherwise. The correct
      // artifacts will always be used in CI because we don't modify the contracts source files
      // during our test suite).
      true,
      // Use the standard prompt. This should be skipped because we're skipping the preview. If it's
      // not skipped, then this test will timeout, because we won't be able to confirm the proposal.
      userConfirmation
    )

    // This prevents a TypeScript type error.
    if (!ipfsData || !proposalRequest) {
      throw new Error(`Expected ipfsData and proposalRequest to be defined`)
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
      'Simple Project',
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
    const compilerConfigArray = JSON.parse(ipfsData)
    expect(compilerConfigArray.length).to.equal(2)
    const [ethereumCompilerConfig, optimismCompilerConfig] = compilerConfigArray
    expect(ethereumCompilerConfig.actionInputs[0].create2Address).equals(
      expectedContractAddressEthereum
    )
    expect(optimismCompilerConfig.actionInputs[0].create2Address).equals(
      expectedContractAddressOptimism
    )
  })

  // We exit early even if the Gnosis Safe and Sphinx Module haven't been deployed yet. In other
  // words, we don't allow the user to submit a proposal that just deploys a Gnosis Safe and Sphinx
  // Module.
  it('Exits early if there is nothing to execute on any network', async () => {
    const { proposalRequest, ipfsData } = await propose(
      false, // Show preview
      false, // Is prod network
      true, // Dry run
      true, // Silent
      'contracts/test/script/Empty.s.sol',
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      // Skip force re-compiling. (This test would take a really long time otherwise. The correct
      // artifacts will always be used in CI because we don't modify the contracts source files
      // during our test suite).
      true,
      mockPrompt
    )

    expect(proposalRequest).to.be.undefined
    expect(ipfsData).to.be.undefined
  })

  // In this test case, there is a deployment to execute on one chain and nothing to execute on
  // another chain. We expect that the user's deployment will be proposed on the first chain and
  // entirely skipped on the other, even if a Gnosis Safe and Sphinx Module haven't been deployed on
  // that network yet.
  it('Proposes on one chain and skips proposal on a different chain', async () => {
    const isTestnet = false
    const { proposalRequest, ipfsData } = await propose(
      false, // Show preview
      isTestnet,
      true, // Dry run
      true, // Silent
      'contracts/test/script/PartiallyEmpty.s.sol',
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      // Skip force re-compiling. (This test would take a really long time otherwise. The correct
      // artifacts will always be used in CI because we don't modify the contracts source files
      // during our test suite).
      true,
      mockPrompt
    )

    // This prevents a TypeScript type error.
    if (!ipfsData || !proposalRequest) {
      throw new Error(`Expected ipfsData and proposalRequest to be defined`)
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
    const compilerConfigArray = JSON.parse(ipfsData)
    expect(compilerConfigArray.length).to.equal(2)
    const ethereumCompilerConfig = compilerConfigArray[0]
    expect(ethereumCompilerConfig.actionInputs[0].create2Address).equals(
      expectedContractAddress
    )
    const optimismCompilerConfig = compilerConfigArray[1]
    expect(optimismCompilerConfig.actionInputs.length).equals(0)
  })

  // This test checks that the proposal simulation can fail after the transactions have been
  // collected. This is worthwhile to test because the `SphinxModule` doesn't revert if a user's
  // transactions causes the deployment to be marked as `FAILED`. If the Foundry plugin doesn't
  // revert either, then the deployment will be proposed, which is not desirable.
  it('Reverts if the deployment fails during the proposal simulation', async () => {
    const scriptPath = 'contracts/test/script/RevertDuringSimulation.s.sol'
    const sphinxModuleAddress = await getSphinxModuleAddressFromScript(
      scriptPath,
      goerliRpcUrl,
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

    // We invoke the deployment with `spawn` because the Node process will terminate with an exit
    // code (via `process.exit(1)`), which can't be caught by Chai.
    const { code, stdout } = await spawnAsync('npx', [
      // We don't use the `sphinx` binary because the CI process isn't able to detect it. This
      // is functionally equivalent to running the command with the `sphinx` binary.
      'ts-node',
      'src/cli/index.ts',
      'propose',
      '--mainnets',
      'contracts/test/script/RevertDuringSimulation.s.sol',
      '--confirm',
      '--target-contract',
      'RevertDuringSimulation_Script',
    ])
    expect(code).equals(1)
    const expectedOutput =
      `Sphinx: failed to execute deployment because the following action reverted: RevertDuringSimulation<${expectedContractAddress}>.deploy(\n` +
      `     "${sphinxModuleAddress}"\n` +
      `   )`
    expect(stdout.includes(expectedOutput)).equals(true)
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
  expect(proposalRequest.owners).to.deep.equal([ownerAddress])
  expect(proposalRequest.threshold).to.equal(1)
  expect(proposalRequest.deploymentName).to.equal(projectName)
  expect(proposalRequest.chainIds).to.deep.equal(chainIds)
  expect(proposalRequest.diff.networks).to.deep.equal(previewNetworks)
}
