export * from './sample-contracts'

import * as fs from 'fs'
import * as path from 'path'

import { forgeConfig, sampleDotEnvFile } from './sample-foundry-config'
import {
  getSampleContractFile,
  getSampleFoundryTestFile,
  getSampleFoundryConfigFile,
} from './sample-contracts'

export const sampleContractFileName = 'HelloSphinx.sol'
export const sampleConfigFileName = 'HelloSphinx.s.sol'
export const sampleTestFileName = 'HelloSphinx.t.sol'

// TODO(client):
// - Are users supposed to commit their clients to version control? If so, we should make a note to
//   document that. If not, we should add a step to the Getting Started guides that puts
//   `client/` in `.gitignore`.

export const writeSampleProjectFiles = (
  contractDirPath: string,
  testDirPath: string,
  scriptDirPath: string,
  quickstart: boolean,
  solcVersion: string
) => {
  // Create the Sphinx config folder if it doesn't exist
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

  // Check if the sample Sphinx config file already exists.
  const configPath = path.join(scriptDirPath, sampleConfigFileName)
  if (!fs.existsSync(configPath)) {
    // Create the sample Sphinx config file.
    fs.writeFileSync(
      configPath,
      getSampleFoundryConfigFile(
        solcVersion,
        scriptDirPath,
        contractDirPath,
        quickstart
      )
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
      getSampleFoundryTestFile(
        solcVersion,
        testDirPath,
        scriptDirPath,
        quickstart
      )
    )
  }
}
