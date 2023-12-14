export * from './sample-contracts'

import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'

import ora from 'ora'
import { ethers } from 'ethers'

import {
  fetchDotEnvFile,
  fetchForgeConfig,
  sampleGitIgnoreFile,
} from './sample-foundry-config'
import {
  getSampleContractFile,
  getSampleFoundryTestFile,
  getSampleScriptFile,
} from './sample-contracts'

export const sampleContractFileName = 'HelloSphinx.sol'
export const sampleScriptFileName = 'HelloSphinx.s.sol'
export const sampleTestFileName = 'HelloSphinx.t.sol'

export const init = (
  pnpm: boolean,
  foundryup: boolean,
  orgId: string,
  sphinxApiKey: string,
  alchemyApiKey: string,
  rawOwnerAddress: string
) => {
  if (foundryup) {
    const { status } = spawnSync(`foundryup`, [], {
      stdio: 'inherit',
    })
    // Exit the process if compilation fails.
    if (status !== 0) {
      process.exit(1)
    }
  }

  const spinner = ora()
  spinner.start(`Initializing sample Sphinx project...`)

  const contractDirPath = 'src'
  const testDirPath = 'test'
  const scriptDirPath = 'script'

  // Convert the raw address to a checksum address.
  const owner = ethers.getAddress(rawOwnerAddress)

  // Create the script folder if it doesn't exist
  if (!fs.existsSync(scriptDirPath)) {
    fs.mkdirSync(scriptDirPath)
  }

  // Create a folder for smart contract source files if it doesn't exist
  if (!fs.existsSync(contractDirPath)) {
    fs.mkdirSync(contractDirPath)
  }

  // Create a folder for test files if it doesn't exist
  if (!fs.existsSync(testDirPath)) {
    fs.mkdirSync(testDirPath)
  }

  // Create the sample deployment script.
  const scriptPath = path.join(scriptDirPath, sampleScriptFileName)
  fs.writeFileSync(
    scriptPath,
    getSampleScriptFile(owner, orgId, scriptDirPath, contractDirPath)
  )

  // Create the sample contract.
  const contractFilePath = path.join(contractDirPath, sampleContractFileName)
  fs.writeFileSync(contractFilePath, getSampleContractFile())

  // Create the sample test file.
  const testFilePath = path.join(testDirPath, sampleTestFileName)
  fs.writeFileSync(
    testFilePath,
    getSampleFoundryTestFile(testDirPath, scriptDirPath)
  )

  fs.writeFileSync('.gitignore', sampleGitIgnoreFile)
  fs.writeFileSync('foundry.toml', fetchForgeConfig(pnpm, true))
  // Create a `.env` file that contains the Sphinx API key and Alchemy API key supplied by the user.
  fs.writeFileSync('.env', fetchDotEnvFile(sphinxApiKey, alchemyApiKey))

  spinner.succeed('Initialized sample Sphinx project.')
}
