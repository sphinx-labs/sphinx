import { exec } from 'child_process'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  DecodedAction,
  execAsync,
  getAuthAddress,
  getSphinxManagerAddress,
  sleep,
  userConfirmation,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import { propose } from '../../../src/cli/propose'

chai.use(chaiAsPromised)
const expect = chai.expect

const sphinxApiKey = 'test-api-key'

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

const ownerAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

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
    await sleep(500)
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

    const { proposalRequest, ipfsData } = await propose(
      false, // Run preview
      true, // Is testnet
      true, // Dry run
      true, // Silent
      'contracts/test/script/Simple.s.sol',
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      // Skip force re-compiling. (This test would take a really long time otherwise, and we can be
      // confident that the correct artifacts are used in CI, where it matters).
      true,
      mockPrompt
    )

    // This prevents a TypeScript type error.
    if (!ipfsData || !proposalRequest) {
      throw new Error(`Expected ipfsData and proposalRequest to be defined`)
    }

    const expectedAuthAddress = getAuthAddress(
      proposalRequest.owners,
      proposalRequest.threshold,
      proposalRequest.deploymentName
    )
    expect(proposalRequest.apiKey).to.equal(sphinxApiKey)
    expect(proposalRequest.orgId).to.equal('test-org-id')
    expect(proposalRequest.isTestnet).to.be.true
    expect(proposalRequest.owners).to.deep.equal([ownerAddress])
    expect(proposalRequest.threshold).to.equal(1)
    expect(proposalRequest.authAddress).to.equal(expectedAuthAddress)
    expect(proposalRequest.managerAddress).to.equal(
      getSphinxManagerAddress(
        proposalRequest.authAddress,
        proposalRequest.deploymentName
      )
    )
    expect(proposalRequest.managerVersion).to.equal('v0.2.6')
    expect(proposalRequest.deploymentName).to.equal('Simple Project')
    expect(proposalRequest.chainIds).to.deep.equal([5])
    expect(proposalRequest.canonicalConfig).to.equal('{}')
    expect(proposalRequest.diff.networks.length).to.equal(1)
    expect(proposalRequest.diff.networks[0].networkTags).to.deep.equal([
      'goerli (local)',
    ])
    const executing = proposalRequest.diff.networks[0].executing
    expect(executing.length).to.equal(3)
    expect(executing[0]).to.deep.equal({
      address: '',
      functionName: 'deploy',
      referenceName: 'SphinxManager',
      variables: [],
    })
    expect(executing[1]).to.deep.equal({
      address: '',
      functionName: 'deploy',
      referenceName: 'MyContract2',
      variables: [],
    })
    expect((executing[2] as DecodedAction).referenceName).to.equal(
      'MyContract2'
    )
    expect((executing[2] as DecodedAction).functionName).to.equal(
      'incrementMyContract2'
    )
    expect((executing[2] as DecodedAction).variables).to.deep.equal(['2'])
    expect(proposalRequest.diff.networks[0].skipping.length).to.equal(0)
    expect(proposalRequest.tree.leaves.length).to.equal(3)

    const expectedContractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )
    expect(ipfsData.length).to.equal(1)
    const compilerConfig = JSON.parse(ipfsData[0])
    expect(compilerConfig.actionInputs[0].create2Address).equals(
      expectedContractAddress
    )
  })

  it('Proposes without preview on multiple production networks', async () => {
    const { proposalRequest, ipfsData } = await propose(
      true, // Skip preview
      false, // Is prod network
      true, // Dry run
      true, // Silent
      'contracts/test/script/Simple.s.sol',
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      // Skip force re-compiling. (This test would take a really long time otherwise, and we can be
      // confident that the correct artifacts are used in CI, where it matters).
      true,
      // Use the standard prompt. This should be skipped because we're skipping the preview. If it's
      // not skipped, then this test will timeout, because we won't be able to confirm the proposal.
      userConfirmation
    )

    // This prevents a TypeScript type error.
    if (!ipfsData || !proposalRequest) {
      throw new Error(`Expected ipfsData and proposalRequest to be defined`)
    }

    const expectedAuthAddress = getAuthAddress(
      proposalRequest.owners,
      proposalRequest.threshold,
      proposalRequest.deploymentName
    )
    expect(proposalRequest.apiKey).to.equal(sphinxApiKey)
    expect(proposalRequest.orgId).to.equal('test-org-id')
    expect(proposalRequest.isTestnet).to.be.false
    expect(proposalRequest.owners).to.deep.equal([ownerAddress])
    expect(proposalRequest.threshold).to.equal(1)
    expect(proposalRequest.authAddress).to.equal(expectedAuthAddress)
    expect(proposalRequest.managerAddress).to.equal(
      getSphinxManagerAddress(
        proposalRequest.authAddress,
        proposalRequest.deploymentName
      )
    )
    expect(proposalRequest.managerVersion).to.equal('v0.2.6')
    expect(proposalRequest.deploymentName).to.equal('Simple Project')
    expect(proposalRequest.chainIds).to.deep.equal([1, 10])
    expect(proposalRequest.canonicalConfig).to.equal('{}')
    expect(proposalRequest.diff.networks.length).to.equal(2)
    expect(proposalRequest.diff.networks[0].networkTags).to.deep.equal([
      'ethereum (local)',
    ])
    expect(proposalRequest.diff.networks[1].networkTags).to.deep.equal([
      'optimism (local)',
    ])
    for (const preview of proposalRequest.diff.networks) {
      const { executing, skipping } = preview
      expect(executing.length).to.equal(3)
      expect(executing[0]).to.deep.equal({
        address: '',
        functionName: 'deploy',
        referenceName: 'SphinxManager',
        variables: [],
      })
      expect(executing[1]).to.deep.equal({
        address: '',
        functionName: 'deploy',
        referenceName: 'MyContract2',
        variables: [],
      })
      expect((executing[2] as DecodedAction).referenceName).to.equal(
        'MyContract2'
      )
      expect((executing[2] as DecodedAction).functionName).to.equal(
        'incrementMyContract2'
      )
      expect((executing[2] as DecodedAction).variables).to.deep.equal(['2'])
      expect(skipping.length).to.equal(0)
    }

    expect(proposalRequest.tree.leaves.length).to.equal(6)

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
    expect(ipfsData.length).to.equal(2)
    const ethereumCompilerConfig = JSON.parse(ipfsData[0])
    const optimismCompilerConfig = JSON.parse(ipfsData[1])
    expect(ethereumCompilerConfig.actionInputs[0].create2Address).equals(
      expectedContractAddressEthereum
    )
    expect(optimismCompilerConfig.actionInputs[0].create2Address).equals(
      expectedContractAddressOptimism
    )
  })
})
