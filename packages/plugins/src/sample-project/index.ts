export * from './sample-contract'
export * from './sample-tests'
export * from './sample-config-files'

import * as fs from 'fs'
import * as path from 'path'

import { Integration } from '@sphinx-labs/core'

import {
  forgeConfig,
  sampleDotEnvFile,
  sampleSphinxFileJavaScript,
  sampleSphinxFileTypeScript,
} from './sample-config-files'
import {
  getSampleContractFile,
  getSampleFoundryTestFile,
} from './sample-contract'
import {
  sampleTestFileJavaScript,
  sampleTestFileTypeScript,
} from './sample-tests'

export const sampleContractFileName = 'HelloSphinx.sol'
export const sampleConfigFileNameTypeScript = 'HelloSphinx.config.ts'
export const sampleConfigNameJavaScript = 'HelloSphinx.config.js'

export const foundryTestFileName = 'HelloSphinx.t.sol'

// Hardhat test file names
export const hhTestFileNameTypeScript = 'HelloSphinx.spec.ts'
export const hhTestFileNameJavaScript = 'HelloSphinx.test.js'

export const writeSampleProjectFiles = (
  configDirPath: string,
  contractDirPath: string,
  testDirPath: string,
  isTypeScriptProject: boolean,
  quickstart: boolean,
  solcVersion: string,
  integration: Integration
) => {
  if (quickstart && integration === 'hardhat') {
    throw new Error('Quickstart is not supported for Hardhat projects.')
  }

  // Create the Sphinx config folder if it doesn't exist
  if (!fs.existsSync(configDirPath)) {
    fs.mkdirSync(configDirPath)
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
  const configFileName = isTypeScriptProject
    ? sampleConfigFileNameTypeScript
    : sampleConfigNameJavaScript

  const configPath = path.join(configDirPath, configFileName)
  if (!fs.existsSync(configPath)) {
    // Create the sample Sphinx config file.
    fs.writeFileSync(
      configPath,
      isTypeScriptProject
        ? sampleSphinxFileTypeScript
        : sampleSphinxFileJavaScript
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

  if (integration === 'hardhat') {
    // Check if the sample test file exists.
    const testFileName = isTypeScriptProject
      ? hhTestFileNameTypeScript
      : hhTestFileNameJavaScript
    const testFilePath = path.join(testDirPath, testFileName)
    if (!fs.existsSync(testFilePath)) {
      // Create the sample test file.
      fs.writeFileSync(
        testFilePath,
        isTypeScriptProject
          ? sampleTestFileTypeScript
          : sampleTestFileJavaScript
      )
    }
  } else if (integration === 'foundry') {
    if (quickstart) {
      fs.writeFileSync('foundry.toml', forgeConfig)
      fs.writeFileSync('.env', sampleDotEnvFile)
    }

    // Check if the sample test file exists.
    const testFilePath = path.join(testDirPath, foundryTestFileName)
    if (!fs.existsSync(testFilePath)) {
      // Create the sample test file.
      fs.writeFileSync(
        testFilePath,
        getSampleFoundryTestFile(
          solcVersion,
          configPath,
          contractDirPath,
          testDirPath,
          quickstart
        )
      )
    }
  } else {
    throw new Error(`Unknown integration: ${integration}. Should never happen.`)
  }
}
