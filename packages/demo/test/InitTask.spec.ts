import * as fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

import {
  SphinxJsonRpcProvider,
  execAsync,
  getSphinxManagerAddress,
  getTargetAddress,
} from '@sphinx-labs/core'
import {
  foundryTestFileName,
  sampleContractFileName,
  sampleConfigFileNameTypeScript,
  hhTestFileNameTypeScript,
} from '@sphinx-labs/plugins'
import { expect } from 'chai'
import { sphinx } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import { ethers } from 'ethers'

const configDirPath = 'sphinx'
const deploymentArtifactDir = 'deployments'
const projectName = 'MyProject'

describe('Init Task', () => {
  let configPath: string
  let contractPath: string
  let foundryTestPath: string
  let hardhatTestPath: string
  let provider: SphinxJsonRpcProvider
  before(async () => {
    const forgeConfigOutput = await execAsync('forge config --json')
    const forgeConfig = JSON.parse(forgeConfigOutput.stdout)
    const { src, test } = forgeConfig

    configPath = path.join(configDirPath, sampleConfigFileNameTypeScript)
    contractPath = path.join(src, sampleContractFileName)
    foundryTestPath = path.join(test, foundryTestFileName)

    hardhatTestPath = path.join(test, hhTestFileNameTypeScript)

    provider = new SphinxJsonRpcProvider('http://127.0.0.1:8545')
  })

  beforeEach(async () => {
    // Start an Anvil node, which is required for the deployment tests
    exec(`anvil --silent &`)
  })

  afterEach(async () => {
    // Kill the Anvil node
    await execAsync(`kill $(lsof -t -i:8545)`)

    // Delete all of the generated files

    fs.rmSync(configPath)
    fs.rmSync(contractPath)

    if (fs.existsSync(foundryTestPath)) {
      fs.rmSync(foundryTestPath)
    }

    if (fs.existsSync(hardhatTestPath)) {
      fs.rmSync(hardhatTestPath)
    }

    if (fs.existsSync(deploymentArtifactDir)) {
      fs.rmSync(deploymentArtifactDir, { recursive: true, force: true })
    }
  })

  it('Succeeds for a sample Foundry project with a TypeScript Sphinx config', async () => {
    const deploymentArtifactOne = path.join(
      deploymentArtifactDir,
      'anvil-31337',
      'MyFirstContract.json'
    )
    const deploymentArtifactTwo = path.join(
      deploymentArtifactDir,
      'anvil-31337',
      'MySecondContract.json'
    )

    // Check that the sample files haven't been created yet
    expect(fs.existsSync(configPath)).to.be.false
    expect(fs.existsSync(contractPath)).to.be.false
    expect(fs.existsSync(foundryTestPath)).to.be.false

    await execAsync('npx sphinx init --ts')

    // Check that the files have been created
    expect(fs.existsSync(configPath)).to.be.true
    expect(fs.existsSync(contractPath)).to.be.true
    expect(fs.existsSync(foundryTestPath)).to.be.true

    // Next, we'll run the test and deployment. If a Foundry test case fails, or if there's some
    // other error that occurs when running either command, this test case will also fail.
    await execAsync(`forge test`)

    // Check that the deployment artifacts haven't been created yet
    expect(fs.existsSync(deploymentArtifactOne)).to.be.false
    expect(fs.existsSync(deploymentArtifactTwo)).to.be.false

    const ownerPrivateKey =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    await execAsync(
      `npx sphinx deploy --confirm --config ${configPath} --broadcast --rpc http://127.0.0.1:8545 ` +
        `--private-key ${ownerPrivateKey}`
    )

    // Check that the contracts were deployed
    const ownerAddress = new ethers.Wallet(ownerPrivateKey).address
    const managerAddress = getSphinxManagerAddress(ownerAddress, projectName)
    const firstContractAddress = getTargetAddress(
      managerAddress,
      'MyFirstContract'
    )
    const secondContractAddress = getTargetAddress(
      managerAddress,
      'MySecondContract'
    )
    expect(await provider.getCode(firstContractAddress)).to.not.equal('0x')
    expect(await provider.getCode(secondContractAddress)).to.not.equal('0x')

    // Check that the deployment artifacts have been created
    expect(fs.existsSync(deploymentArtifactOne)).to.be.true
    expect(fs.existsSync(deploymentArtifactTwo)).to.be.true

    // Check that the correct number of transactions were broadcasted. There should be three:
    // 1. Deploying the SphinxManager via the SphinxRegistry
    // 2. Calling `SphinxManager.approve`.
    // 3. Executing the deployment.
    // This is important because it ensures that we don't accidentally create transactions
    // in our Solidity deployment code.
    const broadcast = JSON.parse(
      fs.readFileSync('./broadcast/Deploy.sol/31337/run-latest.json', 'utf8')
    )
    expect(broadcast.transactions.length).to.equal(3)
  })

  it('Succeeds for a sample Hardhat project with a TypeScript Sphinx config', async () => {
    const deploymentArtifactOne = path.join(
      deploymentArtifactDir,
      'anvil-31337',
      'MyFirstContract.json'
    )
    const deploymentArtifactTwo = path.join(
      deploymentArtifactDir,
      'anvil-31337',
      'MySecondContract.json'
    )

    // Check that the sample files haven't been created yet
    expect(fs.existsSync(configPath)).to.be.false
    expect(fs.existsSync(contractPath)).to.be.false
    expect(fs.existsSync(hardhatTestPath)).to.be.false

    // This command infers that we're using a TypeScript project based on the fact that we have a
    // hardhat.config.ts (instead of .js).
    await execAsync('npx hardhat sphinx-init')

    // Check that the files have been created
    expect(fs.existsSync(configPath)).to.be.true
    expect(fs.existsSync(contractPath)).to.be.true
    expect(fs.existsSync(hardhatTestPath)).to.be.true

    // Check that the deployment artifacts haven't been created yet
    expect(fs.existsSync(deploymentArtifactOne)).to.be.false
    expect(fs.existsSync(deploymentArtifactTwo)).to.be.false

    // Next, we'll run the test and script files. If a Hardhat test case fails, or if there's some
    // other error that occurs when running either command, this test case will also fail.
    await execAsync(
      `npx hardhat test ${hardhatTestPath} --config-path ${configPath} --signer 0`
    )
    await execAsync(
      `npx hardhat sphinx-deploy --confirm --config-path ${configPath} --network localhost --signer 0`
    )

    // Check that the contracts were deployed
    const FirstContract = await sphinx.getContract(
      projectName,
      'MyFirstContract',
      await provider.getSigner()
    )
    const SecondContract = await sphinx.getContract(
      projectName,
      'MySecondContract',
      await provider.getSigner()
    )
    expect(
      await provider.getCode(await FirstContract.getAddress())
    ).to.not.equal('0x')
    expect(
      await provider.getCode(await SecondContract.getAddress())
    ).to.not.equal('0x')

    // Check that the deployment artifacts have been created
    expect(fs.existsSync(deploymentArtifactOne)).to.be.true
    expect(fs.existsSync(deploymentArtifactTwo)).to.be.true
  })
})
