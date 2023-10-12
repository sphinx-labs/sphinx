import { join } from 'path'
import { existsSync, writeFileSync } from 'fs'
import { exec } from 'child_process'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  SphinxJsonRpcProvider,
  execAsync,
  getPreview,
  sleep,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

import { deploy } from '../../src/cli/deploy'
import { getFoundryConfigOptions } from '../../src/foundry/options'
import { abi } from '../../out/artifacts/MyContracts.sol/MyContract1.json'

chai.use(chaiAsPromised)
const expect = chai.expect

const provider = new SphinxJsonRpcProvider(`http://127.0.0.1:42005`)

const forgeScriptPath = 'script/Simple.s.sol'
const contractAddress = '0xa736B2394965D6b796c6D3F2766D96D19d8b2CFB'
const contract = new ethers.Contract(contractAddress, abi, provider)

const mockPrompt = async (q: string) => {}

describe('CLI', () => {
  let deploymentInfoPath: string
  let deploymentArtifactFilePath: string
  before(async () => {
    const { cachePath, artifactFolder } = await getFoundryConfigOptions()
    deploymentInfoPath = join(cachePath, 'sphinx-chain-info.txt')
    deploymentArtifactFilePath = join(
      artifactFolder,
      'anvil-31337',
      'MyContract.json'
    )
  })

  beforeEach(async () => {
    // Start an Anvil node with a fresh state. We must use `exec` instead of `execAsync`
    // because the latter will hang indefinitely.
    exec(`anvil --chain-id 5 --port 42005 --silent &`)
    await sleep(500)
  })

  afterEach(async () => {
    // Kill the Anvil node
    await execAsync(`kill $(lsof -t -i:42005)`)
  })

  // TODO(test): run `forge clean` at the beginning of one of the tests.

  // TODO(test): .only
  describe('Deploy', () => {
    describe('With preview', () => {
      it.only('Executes deployment', async () => {
        expect((await provider.getCode(contractAddress)) === '0x')

        // Check that the deployment artifact hasn't been created yet
        expect(existsSync(deploymentArtifactFilePath)).to.be.false

        const { deployedParsedConfig, previewParsedConfig } = await deploy(
          forgeScriptPath,
          'goerli',
          false, // Run preview
          undefined, // Only one contract in the script file, so there's no target contract to specify.
          undefined, // Don't verify on Etherscan.
          mockPrompt
        )
        expect(deployedParsedConfig).to.not.be.undefined
        // This narrows the type of `previewParsedConfig` to `ParsedConfig`.
        if (!previewParsedConfig) {
          throw new Error(`Expected previewParsedConfig to be defined`)
        }

        expect((await provider.getCode(contractAddress)) !== '0x')
        expect(await contract.uintArg()).to.equal(3n)

        expect(deployedParsedConfig).to.deep.equal(previewParsedConfig)

        const preview = getPreview([previewParsedConfig])
        expect(preview).to.deep.equal({
          networkTags: ['goerli'],
          executing: [
            {
              referenceName: 'MyContract1',
              functionName: 'constructor',
              variables: {
                _intArg: -1,
                _uintArg: 2,
                _addressArg: '0x' + '00'.repeat(19) + '01',
                _otherAddressArg: '0x' + '00'.repeat(19) + '02',
              },
            },
            {
              referenceName: 'MyContract1',
              functionName: 'incrementUint',
              variables: {},
            },
          ],
          skipping: [],
        })

        // Check that the deployment artifact was created
        expect(existsSync(deploymentArtifactFilePath)).to.be.true
      })

      it(`Displays preview then exits when there's nothing to deploy`, async () => {
        expect((await provider.getCode(contractAddress)) === '0x')

        await deploy(
          forgeScriptPath,
          'goerli',
          true, // Skip preview
          undefined, // Only one contract in the script file, so there's no target contract to specify.
          undefined, // Don't verify on Etherscan.
          mockPrompt
        )

        expect((await provider.getCode(contractAddress)) !== '0x')
        expect(await contract.uintArg()).to.equal(3n)

        const { deployedParsedConfig, previewParsedConfig } = await deploy(
          forgeScriptPath,
          'goerli',
          false, // Run preview
          undefined, // Only one contract in the script file, so there's no target contract to specify.
          undefined, // Don't verify on Etherscan.
          mockPrompt
        )
        // This narrows the type of `previewParsedConfig` to `ParsedConfig`.
        if (!previewParsedConfig) {
          throw new Error(`Expected previewParsedConfig to be defined`)
        }

        expect((await provider.getCode(contractAddress)) !== '0x')
        expect(await contract.uintArg()).to.equal(3n)

        expect(deployedParsedConfig).to.deep.equal(previewParsedConfig)

        const preview = getPreview([previewParsedConfig])
        expect(preview).to.deep.equal({
          networkTags: ['goerli'],
          executing: [
            {
              referenceName: 'MyContract1',
              functionName: 'constructor',
              variables: {
                _intArg: -1,
                _uintArg: 2,
                _addressArg: '0x' + '00'.repeat(19) + '01',
                _otherAddressArg: '0x' + '00'.repeat(19) + '02',
              },
            },
            {
              referenceName: 'MyContract1',
              functionName: 'incrementUint',
              variables: {},
            },
          ],
          skipping: [],
        })

        // Check that the deployment artifact was created
        expect(existsSync(deploymentArtifactFilePath)).to.be.true
      })
    })

    describe('Without preview', () => {
      it('Executes deployment', async () => {
        expect((await provider.getCode(contractAddress)) === '0x')

        // Check that the deployment artifact hasn't been created yet
        expect(existsSync(deploymentArtifactFilePath)).to.be.false

        // Write a random string to the deployment info file. Later, we'll check that
        // the file has been overwritten.
        writeFileSync(deploymentInfoPath, 'test')

        const { deployedParsedConfig, previewParsedConfig } = await deploy(
          forgeScriptPath,
          'goerli',
          true, // Skip preview
          undefined, // Only one contract in the script file, so there's no target contract to specify.
          undefined, // Don't verify on Etherscan.
          mockPrompt
        )

        expect(deployedParsedConfig).to.not.be.undefined
        expect(previewParsedConfig).to.be.undefined

        expect((await provider.getCode(contractAddress)) !== '0x')
        expect(await contract.uintArg()).to.equal(3n)

        // Check that the deployment artifact was created
        expect(existsSync(deploymentArtifactFilePath)).to.be.true
      })

      it(`Skips deployment when there's nothing to deploy`)
    })
  })
})
