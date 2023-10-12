import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { deploy } from '../../src/cli/deploy'
import { SphinxJsonRpcProvider, execAsync, getPreview } from '@sphinx-labs/core'
import { getFoundryConfigOptions } from '../../src/foundry/options'
import { join } from 'path'
import { existsSync, writeFileSync } from 'fs'
import { ethers } from 'ethers'
import { abi } from '../../out/artifacts/MyContracts.sol/MyContract1.json'

chai.use(chaiAsPromised)
const expect = chai.expect

const provider = new SphinxJsonRpcProvider(`http://127.0.0.1:8545`)

const contractAddress = '0x381dE02fE95ad4aDca4a9ee3c83a27d9162E4903'
const contract = new ethers.Contract(
  contractAddress,
  abi,
  provider
)

const mockPrompt = async (q: string) => {}

describe.only('CLI', () => {

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
    // Start an Anvil node with a fresh state
    await execAsync(`anvil --silent &`)
  })

  afterEach(async () => {
    // Kill the Anvil node
    await execAsync(`kill $(lsof -t -i:8545)`)
  })

  // TODO(test): run `forge clean` at the beginning of one of the tests.

  // TODO(test): .only
  describe.only('Deploy', () => {
    it('TODO', async () => {
      expect(await provider.getCode(contractAddress) === '0x')

      // Check that the deployment artifact hasn't been created yet
      expect(existsSync(deploymentArtifactFilePath)).to.be.false

      // Write a random string to the deployment info file. Later, we'll check that
      // the file has been overwritten.
      writeFileSync(deploymentInfoPath, 'test')

      const { deployedParsedConfig, previewParsedConfig } = await deploy(
        true, // Skip preview
        'contracts/test/script/Simple.s.sol',
        'goerli',
        undefined, // Only one contract in the script file, so there's no target contract to specify.
        undefined, // Don't verify on Etherscan.
        mockPrompt
      )
      // This narrows the type of `previewParsedConfig` to `ParsedConfig`.
      if (!previewParsedConfig) {
        throw new Error(`Expected previewParsedConfig to be defined`)
      }

      expect(await provider.getCode(contractAddress) !== '0x')
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
          }
        ],
        skipping: [],
      })

      // Check that the deployment artifact was created
      expect(existsSync(deploymentArtifactFilePath)).to.be.true
    })
  })
})
