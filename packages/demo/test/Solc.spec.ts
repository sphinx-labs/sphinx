import { join } from 'path'
import { appendFileSync, rmSync } from 'fs'

import { spawnAsync } from '@sphinx-labs/core'
import { expect } from 'chai'
import {
  sampleContractFileName,
  sampleScriptFileName,
  sampleTestFileName,
} from '@sphinx-labs/plugins'
import { SemVer, coerce, gt, lte } from 'semver'

// TODO(docs): include this link as rationale for testing every solc version:
// https://github.com/ethereum/solidity/issues/14082

import { deleteForgeProject } from './common'

const srcDir = 'src'
const scriptDir = 'script'
const testDir = 'test'

// # TODO(md): https://github.com/ethereum/solidity/issues/13972 and https://github.com/ethereum/solidity/issues/12533

describe('Solidity Compiler', () => {
  let contractPath: string
  let scriptPath: string
  let testPath: string
  let latestSolcVersion: SemVer
  before(async () => {
    contractPath = join(srcDir, sampleContractFileName)
    scriptPath = join(scriptDir, sampleScriptFileName)
    testPath = join(testDir, sampleTestFileName)

    deleteForgeProject(contractPath, scriptPath, testPath)

    const { code } = await spawnAsync(`npx`, [
      'sphinx',
      'init',
      '--org-id',
      'TEST_ORG_ID',
      '--sphinx-api-key',
      'TEST_SPHINX_KEY',
      '--alchemy-api-key',
      'TEST_ALCHEMY_KEY',
      '--owner',
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    ])
    if (code !== 0) {
      throw new Error(`Failed to run 'sphinx init' command.`)
    }

    // Add a Foundry profile in the newly created `foundry.toml` that disables the Solidity compiler
    // optimizer. Foundry enables the optimizer by default and doesn't provide an option to disable
    // the optimizer using a CLI argument.
    const lines = '\n[profile.no_optimizer]\noptimizer = false'
    appendFileSync('foundry.toml', lines)

    const { stdout: latestSolcVersionRaw } = await spawnAsync(`npm`, [
      `show`,
      `solc`,
      `version`,
    ])

    const latestSolcVersionParsed = coerce(latestSolcVersionRaw)
    if (latestSolcVersionParsed === null) {
      throw new Error(`TODO(docs).`)
    }
    if (
      latestSolcVersionParsed.major !== 0 ||
      latestSolcVersionParsed.minor !== 8
    ) {
      throw new Error(`TODO(docs).`)
    }
    latestSolcVersion = latestSolcVersionParsed
  })

  after(async () => {
    deleteForgeProject(contractPath, scriptPath, testPath)
  })

  // TODO(end): .only

  // TODO(docs): TODO(docs): forge sample project can't compile w/ --via-ir and --use '0.8.0' with
  // the optimizer enabled, so we don't test for this case.
  it('TODO(docs)', async () => {
    const versions = generateSemverRange(new SemVer('0.8.1'), latestSolcVersion)

    // Generate output directory names. TODO(docs): we use separate output directories for each
    // `forge build` command to prevent race conditions.
    const outputDirs = versions.map((version) => `out-${version}`)

    const buildPromises = versions.map((version, index) => {
      return spawnAsync(`forge`, [
        'build',
        '--use',
        version,
        '--via-ir',
        '--optimize',
        '--optimizer-runs',
        '200',
        '--force',
        '--out',
        outputDirs[index],
      ]).then(({ stdout, stderr, code }) => {
        return { version, stdout, stderr, code }
      })
    })

    const results = await Promise.all(buildPromises)

    const errorMessages: Array<string> = []
    results.forEach(({ version, stdout, stderr, code }) => {
      if (code !== 0) {
        errorMessages.push(
          `Build failed for: ${version}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
        )
      }
    })

    // Delete the output directories
    outputDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }))

    if (errorMessages.length > 0) {
      console.error(errorMessages.join('\n\n'))
    }

    // If no errors, the test passes
    expect(errorMessages).to.be.empty
  })

  // TODO(docs): Compile via IR without the optimizer using Solidity compiler v0.8.21, which is the lowest version
  // that works with these settings. Before v0.8.21, it was very easy to trigger a "stack too deep"
  // error when compiling via IR with the optimizer disabled. For example, the standard project
  // created by `forge init` can't compile with these settings. See these two issues in the Solidity
  // repo for more context:
  // The problem: https://github.com/ethereum/solidity/issues/12533 The fix in
  // v0.8.21: https://github.com/ethereum/solidity/issues/13972∑
  it('TODO(docs)', async () => {
    const versions = generateSemverRange(
      new SemVer('0.8.21'),
      latestSolcVersion
    )

    // Generate output directory names. TODO(docs): we use separate output directories for each
    // `forge build` command to prevent race conditions.
    const outputDirs = versions.map((version) => `out-${version}`)

    const buildPromises = versions.map((version, index) => {
      return spawnAsync(
        `forge`,
        [
          'build',
          '--use',
          version,
          '--via-ir',
          '--force',
          '--out',
          outputDirs[index],
        ],
        {
          FOUNDRY_PROFILE: 'no_optimizer',
        }
      ).then(({ stdout, stderr, code }) => {
        return { version, stdout, stderr, code }
      })
    })

    const results = await Promise.all(buildPromises)

    const errorMessages: Array<string> = []
    results.forEach(({ version, stdout, stderr, code }) => {
      if (code !== 0) {
        errorMessages.push(
          `Build failed for: ${version}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
        )
      }
    })

    // Delete the output directories
    outputDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }))

    if (errorMessages.length > 0) {
      console.error(errorMessages.join('\n\n'))
    }

    // If no errors, the test passes
    expect(errorMessages).to.be.empty
  })
})

const generateSemverRange = (
  startVersion: SemVer,
  endVersion: SemVer
): Array<string> => {
  let currentVersion = new SemVer(startVersion)
  const versions: Array<string> = []

  while (lte(currentVersion.version, endVersion)) {
    versions.push(currentVersion.version)

    // Increment the patch version
    currentVersion = new SemVer(currentVersion.inc('patch').version)

    // Stop if the current version exceeds the end version
    if (gt(currentVersion.version, endVersion.version)) {
      break
    }
  }

  return versions
}
