export * from './sample-contracts'

import * as fs from 'fs'
import * as path from 'path'

import { forgeConfig, sampleDotEnvFile } from './sample-foundry-config'
import {
  getSampleContractFile,
  getSampleFoundryTestFile,
  getSampleScriptFile,
} from './sample-contracts'

export const sampleContractFileName = 'HelloSphinx.sol'
export const sampleScriptFileName = 'HelloSphinx.s.sol'
export const sampleTestFileName = 'HelloSphinx.t.sol'

export const writeSampleProjectFiles = (
  contractDirPath: string,
  testDirPath: string,
  scriptDirPath: string,
  quickstart: boolean,
  solcVersion: string
) => {
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

  // Check if the sample Sphinx deployment script file already exists.
  const configPath = path.join(scriptDirPath, sampleScriptFileName)
  if (!fs.existsSync(configPath)) {
    // Create the sample Sphinx deployment script file.
    fs.writeFileSync(
      configPath,
      getSampleScriptFile(solcVersion, scriptDirPath, contractDirPath)
    )
  }

  // Next, we'll create the sample contract file.

  // Check if the sample smart contract exists.
  const contractFilePath = path.join(contractDirPath, sampleContractFileName)
  if (!fs.existsSync(contractFilePath)) {
    // Create the sample contract file.
    fs.writeFileSync(contractFilePath, getSampleContractFile(solcVersion))
  }

  // Lastly, we'll create the sample test file.
  if (quickstart) {
    fs.writeFileSync('foundry.toml', forgeConfig)
    fs.writeFileSync('.env', sampleDotEnvFile)
  }

  // Check if the sample test file exists.
  const testFilePath = path.join(testDirPath, sampleTestFileName)
  if (!fs.existsSync(testFilePath)) {
    // Create the sample test file.
    fs.writeFileSync(
      testFilePath,
      getSampleFoundryTestFile(solcVersion, testDirPath, scriptDirPath)
    )
  }
}
