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
import { getFoundryConfigOptions } from '@sphinx-labs/plugins/src/foundry/options'

const deploymentArtifactDir = 'deployments'

const provider = new SphinxJsonRpcProvider(`http://127.0.0.1:8545`)
const contractAddress = '0x2A4805750C76d8B737bea20e5397bFda790AB14a'

describe('Init CLI command', () => {
  let contractPath: string
  let scriptPath: string
  let testPath: string
  before(async () => {
    const { src, test } = await getFoundryConfigOptions()

    contractPath = path.join(src, sampleContractFileName)
    scriptPath = path.join(src, sampleScriptFileName)
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

  it('Succeeds for a sample Foundry project', async () => {
    // Check that the sample files haven't been created yet
    expect(fs.existsSync(contractPath)).to.be.false
    expect(fs.existsSync(testPath)).to.be.false

    await execAsync('npx sphinx init --quickstart')

    // Check that the files have been created
    expect(fs.existsSync(contractPath)).to.be.true
    expect(fs.existsSync(testPath)).to.be.true

    await execAsync(`npx sphinx generate`)

    // Next, we'll run the tests, then deploy it to anvil. If either of these commands fail, this
    // test case will also fail.
    await execAsync(`forge test`)
    await execAsync(
      `npx sphinx deploy script/HelloSphinx.s.sol --network anvil --confirm`
    )

    // Check that the contract was deployed correctly
    expect(await provider.getCode(contractAddress)).to.not.equal('0x')
    const contract = getContract()
    expect(await contract.greeting()).to.equal('Hi!')
    expect(await contract.number()).to.equal(10n)
  })
})

const getContract = (): ethers.Contract => {
  const abi =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(path.resolve('./out/HelloSphinx.sol/HelloSphinx.json')).abi

  const contract = new ethers.Contract(contractAddress, abi, provider)
  return contract
}

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
