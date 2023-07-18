export * from './sample-contract'
export * from './sample-tests'
export * from './sample-sphinx-files'

import * as fs from 'fs'
import * as path from 'path'

import { Integration } from '@sphinx/core'

import {
  sampleSphinxFileJavaScript,
  sampleSphinxFileTypeScript,
} from './sample-sphinx-files'
import {
  getSampleContractFile,
  getSampleFoundryDeployFile,
  getSampleFoundryTestFile,
} from './sample-contract'
import {
  sampleTestFileJavaScript,
  sampleTestFileTypeScript,
} from './sample-tests'

export const writeSampleProjectFiles = (
  sphinxPath: string,
  sourcePath: string,
  testPath: string,
  isTypeScriptProject: boolean,
  solcVersion: string,
  integration: Integration,
  scriptPath?: string
) => {
  // Create the Sphinx folder if it doesn't exist
  if (!fs.existsSync(sphinxPath)) {
    fs.mkdirSync(sphinxPath)
  }

  // Create a folder for smart contract source files if it doesn't exist
  if (!fs.existsSync(sourcePath)) {
    fs.mkdirSync(sourcePath)
  }

  // Create a folder for test files if it doesn't exist
  if (!fs.existsSync(testPath)) {
    fs.mkdirSync(testPath)
  }

  // Check if the sample Sphinx config file already exists.
  const sphinxFileName = isTypeScriptProject
    ? 'HelloSphinx.config.ts'
    : 'HelloSphinx.config.js'
  const configPath = path.join(sphinxPath, sphinxFileName)
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
  const contractFilePath = path.join(sourcePath, 'HelloSphinx.sol')
  if (!fs.existsSync(contractFilePath)) {
    // Create the sample contract file.
    fs.writeFileSync(contractFilePath, getSampleContractFile(solcVersion))
  }

  // Lastly, we'll create the sample test file.

  if (integration === 'hardhat') {
    // Check if the sample test file exists.
    const testFileName = isTypeScriptProject
      ? 'HelloSphinx.spec.ts'
      : 'HelloSphinx.test.js'
    const testFilePath = path.join(testPath, testFileName)
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
    if (!scriptPath) {
      throw new Error(
        'Script path is required for foundry integration. Should never happen.'
      )
    }

    // Create a folder for Forge script files if it doesn't exist
    if (!fs.existsSync(scriptPath)) {
      fs.mkdirSync(scriptPath)
    }

    // Check if the sample test file exists.
    const testFileName = 'HelloSphinx.t.sol'
    const testFilePath = path.join(testPath, testFileName)
    if (!fs.existsSync(testFilePath)) {
      // Create the sample test file.
      fs.writeFileSync(
        testFilePath,
        getSampleFoundryTestFile(solcVersion, configPath)
      )
    }

    // Check if the sample test file exists.
    const deployFileName = 'HelloSphinx.s.sol'
    const deployFilePath = path.join(scriptPath, deployFileName)
    if (!fs.existsSync(deployFilePath)) {
      // Create the sample test file.
      fs.writeFileSync(
        deployFilePath,
        getSampleFoundryDeployFile(solcVersion, configPath)
      )
    }
  }
}
