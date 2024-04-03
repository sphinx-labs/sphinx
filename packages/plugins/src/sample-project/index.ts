export * from './sample-contracts'

import * as fs from 'fs'
import * as path from 'path'

import ora from 'ora'
import { spawnAsync, syncSphinxLock } from '@sphinx-labs/core'

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
import { handleInstall } from '../cli/install'

export const sampleContractFileName = 'HelloSphinx.sol'
export const sampleScriptFileName = 'HelloSphinx.s.sol'
export const sampleTestFileName = 'HelloSphinx.t.sol'

const handleGitInit = async () => {
  if (process.env.SPHINX_INTERNAL_TEST__DEMO_TEST === 'true') {
    return
  }

  // Commit all changes
  const spawnOutput = await spawnAsync('git', ['init'])
  if (spawnOutput.code !== 0) {
    // The `stdout` contains the trace of the error.
    console.log(spawnOutput.stdout)
    // The `stderr` contains the error message.
    console.log(spawnOutput.stderr)
    process.exit(1)
  }
}

const handleCommit = async () => {
  if (process.env.SPHINX_INTERNAL_TEST__DEMO_TEST === 'true') {
    return
  }

  // Commit all changes
  const gitAddOutput = await spawnAsync('git', ['add', '.'])
  if (gitAddOutput.code !== 0) {
    // The `stdout` contains the trace of the error.
    console.log(gitAddOutput.stdout)
    // The `stderr` contains the error message.
    console.log(gitAddOutput.stderr)
    process.exit(1)
  }

  const gitCommitOutput = await spawnAsync('git', [
    'commit',
    '-m',
    '"feat: Initialized Sphinx"',
  ])
  if (gitCommitOutput.code !== 0) {
    // The `stdout` contains the trace of the error.
    console.log(gitCommitOutput.stdout)
    // The `stderr` contains the error message.
    console.log(gitCommitOutput.stderr)
    process.exit(1)
  }
}

export const init = async (
  orgId: string,
  sphinxApiKey: string,
  alchemyApiKey: string,
  project: string
) => {
  const spinner = ora()
  spinner.start(`Initializing sample Sphinx project...`)

  // To make the installation process smoother and b/c installing out library requires a git repo, we just
  // automatically create a repo and commit everything to it at the end of the initialization process.
  await handleGitInit()

  const contractDirPath = 'src'
  const testDirPath = 'test'
  const scriptDirPath = 'script'

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
    getSampleScriptFile(scriptDirPath, contractDirPath, project)
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
  fs.writeFileSync('foundry.toml', fetchForgeConfig(true))
  // Create a `.env` file that contains the Sphinx API Key and Alchemy API Key supplied by the user.
  fs.writeFileSync('.env', fetchDotEnvFile(sphinxApiKey, orgId, alchemyApiKey))

  spinner.succeed('Initialized sample Sphinx project.')

  await syncSphinxLock(orgId, sphinxApiKey)

  await handleInstall(spinner)

  await handleCommit()
}
