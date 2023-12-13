import * as fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

import { SphinxJsonRpcProvider, execAsync } from '@sphinx-labs/core'
import {
  sampleTestFileName,
  sampleScriptFileName,
  sampleContractFileName,
} from '@sphinx-labs/plugins'
import { expect } from 'chai'
import { ethers } from 'ethers'
import { getFoundryToml } from '@sphinx-labs/plugins/src/foundry/options'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

const deploymentArtifactDir = 'deployments'
const provider = new SphinxJsonRpcProvider(`http://127.0.0.1:8545`)

describe('Init CLI command', () => {
  let contractPath: string
  let scriptPath: string
  let testPath: string
  before(async () => {
    const { src, script, test } = await getFoundryToml()

    contractPath = path.join(src, sampleContractFileName)
    scriptPath = path.join(script, sampleScriptFileName)
    testPath = path.join(test, sampleTestFileName)
  })

  beforeEach(async () => {
    deleteFiles(contractPath, scriptPath, testPath)

    exec(`anvil --silent &`)
  })

  afterEach(async () => {
    // Kill the Anvil node
    await execAsync(`kill $(lsof -t -i:8545)`)

    deleteFiles(contractPath, scriptPath, testPath)
  })

  it('Creates and tests a sample Foundry project', async () => {
    // Check that the sample files haven't been created yet
    expect(fs.existsSync(contractPath)).to.be.false
    expect(fs.existsSync(testPath)).to.be.false

    await execAsync(
      `npx sphinx init --org-id TEST_ORG_ID --sphinx-api-key TEST_SPHINX_KEY --alchemy-api-key TEST_ALCHEMY_KEY --owner 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
    )

    // Check that the files have been created
    expect(fs.existsSync(contractPath)).to.be.true
    expect(fs.existsSync(testPath)).to.be.true

    // Next, we'll run the tests, then deploy it to anvil. If either of these commands fail, this
    // test case will also fail.
    await execAsync(`forge test`)
    await execAsync(
      `npx sphinx deploy script/HelloSphinx.s.sol --network anvil --confirm`
    )

    // We need to load the contract artifact programmatically because it's not created until we run
    // a Forge command.
    const artifact =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(path.resolve('./out/HelloSphinx.sol/HelloSphinx.json'))
    // Get the sample contract's address.
    const coder = ethers.AbiCoder.defaultAbiCoder()
    const contractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(
        ethers.concat([
          artifact.bytecode.object,
          coder.encode(['string', 'uint256'], ['Hi', 2]),
        ])
      )
    )

    // Check that the contract was deployed correctly
    expect(await provider.getCode(contractAddress)).to.not.equal('0x')
    const contract = new ethers.Contract(
      contractAddress,
      artifact.abi,
      provider
    )
    expect(await contract.greeting()).to.equal('Hi')
    expect(await contract.number()).to.equal(10n)
  })
})

const deleteFiles = (
  contractPath: string,
  scriptPath: string,
  testPath: string
) => {
  // Delete the generated files
  if (fs.existsSync(contractPath)) {
    fs.rmSync(contractPath)
  }

  if (fs.existsSync(testPath)) {
    fs.rmSync(testPath)
  }

  if (fs.existsSync(scriptPath)) {
    fs.rmSync(scriptPath)
  }

  if (fs.existsSync(deploymentArtifactDir)) {
    fs.rmSync(deploymentArtifactDir, { recursive: true, force: true })
  }
}
