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
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import { deleteForgeProject } from './common'

const provider = new SphinxJsonRpcProvider(`http://127.0.0.1:8545`)

const srcDir = 'src'
const scriptDir = 'script'
const testDir = 'test'

describe('Init CLI command', () => {
  let contractPath: string
  let scriptPath: string
  let testPath: string
  before(async () => {
    contractPath = path.join(srcDir, sampleContractFileName)
    scriptPath = path.join(scriptDir, sampleScriptFileName)
    testPath = path.join(testDir, sampleTestFileName)
  })

  beforeEach(async () => {
    deleteForgeProject(contractPath, scriptPath, testPath)

    exec(`anvil --silent &`)
  })

  afterEach(async () => {
    // Kill the Anvil node
    await execAsync(`kill $(lsof -t -i:8545)`)

    deleteForgeProject(contractPath, scriptPath, testPath)
  })

  it('Creates and tests a sample Foundry project', async () => {
    // Check that the sample files haven't been created yet
    expect(fs.existsSync(contractPath)).to.be.false
    expect(fs.existsSync(testPath)).to.be.false

    const ownerAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

    // We use `SPHINX_INTERNAL_TEST__SKIP_GIT` to skip the init command steps where we create a git repo and commit all the files to it.
    // We do this to avoid messing with out commit history when testing locally.
    await execAsync(
      `export SPHINX_INTERNAL_TEST__SKIP_GIT=true && npx sphinx init --org-id TEST_ORG_ID --sphinx-api-key TEST_SPHINX_KEY --alchemy-api-key TEST_ALCHEMY_KEY --owner ${ownerAddress}`
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
    const create2Salt = ethers.keccak256(
      coder.encode([`address[]`], [[ownerAddress]])
    )
    const contractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      create2Salt,
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
    expect(await contract.number()).to.equal(BigInt(10))
  })
})
