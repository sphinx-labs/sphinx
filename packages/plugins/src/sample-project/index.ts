export * from './sample-contract'
export * from './sample-tests'
export * from './sample-chugsplash-files'

import * as fs from 'fs'
import * as path from 'path'

import { Integration } from '@chugsplash/core'

import {
  sampleChugSplashFileJavaScript,
  sampleChugSplashFileTypeScript,
} from './sample-chugsplash-files'
import {
  getSampleContractFile,
  getSampleFoundryDeployFile,
  getSampleFoundryTestFile,
  getSampleGenerateArtifactFile,
} from './sample-contract'
import {
  sampleTestFileJavaScript,
  sampleTestFileTypeScript,
} from './sample-tests'

export const writeSampleProjectFiles = (
  chugsplashPath: string,
  sourcePath: string,
  testPath: string,
  isTypeScriptProject: boolean,
  solcVersion: string,
  integration: Integration,
  scriptPath?: string
) => {
  // Create the ChugSplash folder if it doesn't exist
  if (!fs.existsSync(chugsplashPath)) {
    fs.mkdirSync(chugsplashPath)
  }

  // Create a folder for smart contract source files if it doesn't exist
  if (!fs.existsSync(sourcePath)) {
    fs.mkdirSync(sourcePath)
  }

  // Create a folder for test files if it doesn't exist
  if (!fs.existsSync(testPath)) {
    fs.mkdirSync(testPath)
  }

  // Check if the sample ChugSplash config file already exists.
  const chugsplashFileName = isTypeScriptProject
    ? 'HelloChugSplash.config.ts'
    : 'HelloChugSplash.config.js'
  const configPath = path.join(chugsplashPath, chugsplashFileName)
  if (!fs.existsSync(configPath)) {
    // Create the sample ChugSplash config file.
    fs.writeFileSync(
      configPath,
      isTypeScriptProject
        ? sampleChugSplashFileTypeScript
        : sampleChugSplashFileJavaScript
    )
  }

  // Next, we'll create the sample contract file.

  // Check if the sample smart contract exists.
  const contractFilePath = path.join(sourcePath, 'HelloChugSplash.sol')
  if (!fs.existsSync(contractFilePath)) {
    // Create the sample contract file.
    fs.writeFileSync(contractFilePath, getSampleContractFile(solcVersion))
  }

  // Lastly, we'll create the sample test file.

  if (integration === 'hardhat') {
    // Check if the sample test file exists.
    const testFileName = isTypeScriptProject
      ? 'HelloChugSplash.spec.ts'
      : 'HelloChugSplash.test.js'
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
    const testFileName = 'HelloChugSplash.t.sol'
    const testFilePath = path.join(testPath, testFileName)
    if (!fs.existsSync(testFilePath)) {
      // Create the sample test file.
      fs.writeFileSync(testFilePath, getSampleFoundryTestFile(solcVersion))
    }

    // Check if the sample test file exists.
    const deployFileName = 'HelloChugSplash.s.sol'
    const deployFilePath = path.join(scriptPath, deployFileName)
    if (!fs.existsSync(deployFilePath)) {
      // Create the sample test file.
      fs.writeFileSync(deployFilePath, getSampleFoundryDeployFile(solcVersion))
    }

    const generateArtifactName = 'GenerateArtifact.s.sol'
    const generateArtifactPath = path.join(scriptPath, generateArtifactName)
    if (!fs.existsSync(generateArtifactPath)) {
      // Create the sample test file.
      fs.writeFileSync(
        generateArtifactPath,
        getSampleGenerateArtifactFile(solcVersion)
      )
    }
  }
}
