import * as fs from 'fs'
import path from 'path'

import { execAsync } from '@sphinx/core'
import {
  foundryTestFileName,
  foundryScriptFileName,
  sampleContractFileName,
  sampleConfigFileNameTypeScript,
  hhTestFileNameTypeScript,
} from '@sphinx/plugins'
import { expect } from 'chai'

const configDirPath = 'sphinx'

describe('Init Task', () => {
  let configPath: string
  let contractPath: string
  let foundryTestPath: string
  let foundryScriptPath: string
  let hardhatTestPath: string
  before(async () => {
    const forgeConfigOutput = await execAsync('forge config --json')
    const forgeConfig = JSON.parse(forgeConfigOutput.stdout)
    const { src, test, script } = forgeConfig

    configPath = path.join(configDirPath, sampleConfigFileNameTypeScript)
    contractPath = path.join(src, sampleContractFileName)
    foundryTestPath = path.join(test, foundryTestFileName)
    foundryScriptPath = path.join(script, foundryScriptFileName)

    hardhatTestPath = path.join(test, hhTestFileNameTypeScript)
  })

  afterEach(async () => {
    // Delete all of the generated files

    fs.rmSync(configPath)
    fs.rmSync(contractPath)

    if (fs.existsSync(foundryTestPath)) {
      fs.rmSync(foundryTestPath)
    }

    if (fs.existsSync(foundryScriptPath)) {
      fs.rmSync(foundryScriptPath)
    }

    if (fs.existsSync(hardhatTestPath)) {
      fs.rmSync(hardhatTestPath)
    }
  })

  it('Succeeds for a sample Foundry project with a TypeScript config', async () => {
    // Check that the sample files haven't been created yet
    expect(fs.existsSync(configPath)).to.be.false
    expect(fs.existsSync(contractPath)).to.be.false
    expect(fs.existsSync(foundryTestPath)).to.be.false
    expect(fs.existsSync(foundryScriptPath)).to.be.false

    await execAsync('npx sphinx init --ts')

    // Check that the files have been created
    expect(fs.existsSync(configPath)).to.be.true
    expect(fs.existsSync(contractPath)).to.be.true
    expect(fs.existsSync(foundryTestPath)).to.be.true
    expect(fs.existsSync(foundryScriptPath)).to.be.true

    // Next, we'll run the test and script files. If a Foundry test case fails, or if there's some
    // other error that occurs when running either command, this test case will also fail.
    await execAsync(`forge test --match-path ${foundryTestPath}`)
    await execAsync(`forge script ${foundryScriptPath}`)
  })

  it('Succeeds for a sample Hardhat project with a TypeScript config', async () => {
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

    // Next, we'll run the test and script files. If a Hardhat test case fails, or if there's some
    // other error that occurs when running either command, this test case will also fail.
    await execAsync(
      `npx hardhat test ${hardhatTestPath} --config-path ${configPath} --use-default-signer`
    )
    await execAsync(
      `npx hardhat sphinx-deploy --config-path ${configPath} --use-default-signer`
    )
  })
})
