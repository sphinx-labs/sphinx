import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  execAsync,
  getAuthAddress,
  getSphinxManagerAddress,
  sleep,
  userConfirmation,
} from '@sphinx-labs/core'

import { propose } from '../../../src/cli/propose'
import { exec } from 'child_process'
import { existsSync } from 'fs'
import { deploy } from '../../../src/cli/deploy'

chai.use(chaiAsPromised)
const expect = chai.expect

const forgeScriptPath = 'contracts/test/script/Simple.s.sol'

const sphinxApiKey = 'test-api-key'

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
    exec(`anvil --chain-id 420 --port 42420 --silent &`)
    await sleep(500)
  })

  afterEach(async () => {
    // Exit the Anvil nodes
    await execAsync(`kill $(lsof -t -i:42001)`)
    await execAsync(`kill $(lsof -t -i:42005)`)
    await execAsync(`kill $(lsof -t -i:42010)`)
    await execAsync(`kill $(lsof -t -i:42420)`)
  })

  it('Proposes with preview on testnets', async () => {
    await execAsync(`forge clean`)

    const { proposalRequest, ipfsData } = await propose(
      false, // Run preview
      true, // Is testnet
      true, // Dry run
      forgeScriptPath,
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      mockPrompt
    )

    // This prevents a TypeScript type error.
    if (!ipfsData || !proposalRequest) {
      throw new Error(`Expected ipfsData and proposalRequest to be defined`)
    }

    const expectedAuthAddress = getAuthAddress(proposalRequest.owners, proposalRequest.threshold, proposalRequest.deploymentName)
    expect(proposalRequest.apiKey).to.equal(sphinxApiKey)
    expect(proposalRequest.orgId).to.equal('test-org-id')
    expect(proposalRequest.isTestnet).to.be.true
    expect(proposalRequest.owners).to.deep.equal([ownerAddress])
    expect(proposalRequest.threshold).to.equal(1)
    expect(proposalRequest.authAddress).to.equal(expectedAuthAddress)
    expect(proposalRequest.managerAddress).to.equal(getSphinxManagerAddress(proposalRequest.authAddress, proposalRequest.deploymentName))
    expect(proposalRequest.managerVersion).to.equal('v0.2.5')
    expect(proposalRequest.deploymentName).to.equal('Simple Project')
    expect(proposalRequest.chainIds).to.deep.equal([5, 420])
    expect(proposalRequest.canonicalConfig).to.equal('{}')
    expect(proposalRequest.diff).to.deep.equal([
      {
        "networkTags": [
          "goerli (local)",
          "optimism_goerli (local)",
        ],
        "executing": [
          {
            "functionName": "constructor",
            "referenceName": "SphinxManager",
            "variables": {}
          },
          {
            "functionName": "constructor",
            "referenceName": "MyContract1",
            "variables": {
              "_addressArg": "0x0000000000000000000000000000000000000001",
              "_intArg": "-1",
              "_otherAddressArg": "0x0000000000000000000000000000000000000002",
              "_uintArg": "2"
            }
          },
          {
            "functionName": "incrementUint",
            "referenceName": "MyContract1",
            "variables": {}
          },
        ],
        "skipping": []
      }
    ])
    expect(proposalRequest.tree.leaves.length).to.equal(6)

    expect(ipfsData.length).to.equal(2)
  })

  it('Proposes without preview on mainnets', async () => {
    const { proposalRequest, ipfsData } = await propose(
      true, // Skip preview
      false, // Is prod network
      true, // Dry run
      forgeScriptPath,
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      // Use the standard prompt. This should be skipped because we're skipping the preview. If it's
      // not skipped, then this test will timeout, because we won't be able to confirm the proposal.
      userConfirmation
    )

    // This prevents a TypeScript type error.
    if (!ipfsData || !proposalRequest) {
      throw new Error(`Expected ipfsData and proposalRequest to be defined`)
    }

    const expectedAuthAddress = getAuthAddress(proposalRequest.owners, proposalRequest.threshold, proposalRequest.deploymentName)
    expect(proposalRequest.apiKey).to.equal(sphinxApiKey)
    expect(proposalRequest.orgId).to.equal('test-org-id')
    expect(proposalRequest.isTestnet).to.be.false
    expect(proposalRequest.owners).to.deep.equal([ownerAddress])
    expect(proposalRequest.threshold).to.equal(1)
    expect(proposalRequest.authAddress).to.equal(expectedAuthAddress)
    expect(proposalRequest.managerAddress).to.equal(getSphinxManagerAddress(proposalRequest.authAddress, proposalRequest.deploymentName))
    expect(proposalRequest.managerVersion).to.equal('v0.2.5')
    expect(proposalRequest.deploymentName).to.equal('Simple Project')
    expect(proposalRequest.chainIds).to.deep.equal([1, 10])
    expect(proposalRequest.canonicalConfig).to.equal('{}')
    expect(proposalRequest.diff).to.deep.equal([
      {
        "networkTags": [
          "ethereum (local)",
          "optimism (local)",
        ],
        "executing": [
          {
            "functionName": "constructor",
            "referenceName": "SphinxManager",
            "variables": {}
          },
          {
            "functionName": "constructor",
            "referenceName": "MyContract1",
            "variables": {
              "_addressArg": "0x0000000000000000000000000000000000000001",
              "_intArg": "-1",
              "_otherAddressArg": "0x0000000000000000000000000000000000000002",
              "_uintArg": "2"
            }
          },
          {
            "functionName": "incrementUint",
            "referenceName": "MyContract1",
            "variables": {}
          },
        ],
        "skipping": []
      }
    ])
    expect(proposalRequest.tree.leaves.length).to.equal(6)

    expect(ipfsData.length).to.equal(2)
  })

  it('Exits early for empty proposal with preview enabled', async () => {
    await deploy(
      forgeScriptPath,
      'goerli',
      true, // Skip preview
    )
    await deploy(
      forgeScriptPath,
      'optimism_goerli',
      true, // Skip preview
    )

    const { proposalRequest, ipfsData } = await propose(
      false, // Run preview
      true, // Is testnet
      true, // Dry run
      forgeScriptPath,
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      mockPrompt
    )

    expect(proposalRequest).to.be.undefined
    expect(ipfsData).to.be.undefined
  })

  it('Exits early for empty proposal with preview disabled', async () => {
    await deploy(
      forgeScriptPath,
      'goerli',
      true, // Skip preview
    )
    await deploy(
      forgeScriptPath,
      'optimism_goerli',
      true, // Skip preview
    )

    const { proposalRequest, ipfsData } = await propose(
      true, // Skip preview
      true, // Is testnet
      true, // Dry run
      forgeScriptPath,
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      mockPrompt
    )

    expect(proposalRequest).to.be.undefined
    expect(ipfsData).to.be.undefined
  })
})
