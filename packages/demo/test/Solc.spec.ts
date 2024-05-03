import { join } from 'path'
import { appendFileSync, rmSync } from 'fs'

import { expect } from 'chai'
import {
  sampleContractFileName,
  sampleScriptFileName,
  sampleTestFileName,
} from '@sphinx-labs/plugins'
import { SemVer, coerce, gt, lte } from 'semver'
import { spawnAsync } from '@sphinx-labs/core'
import pLimit from 'p-limit'

import { deleteForgeProject } from './common'

const limit = pLimit(5)

const srcDir = 'src'
const scriptDir = 'script'
const testDir = 'test'

// This test suite checks that Sphinx's plugin contracts can compile with the Yul intermediate
// representation compiler setting (i.e. `viaIR`). We test every supported solc version because
// minor changes in solc can lead to "stack too deep" errors. See this post and cameel's response
// for context: https://github.com/ethereum/solidity/issues/14082
describe('Solidity Compiler', () => {
  let contractPath: string
  let scriptPath: string
  let testPath: string
  let latestSolcVersion: SemVer
  before(async () => {
    deleteForgeProject(contractPath, scriptPath, testPath)

    contractPath = join(srcDir, sampleContractFileName)
    scriptPath = join(scriptDir, sampleScriptFileName)
    testPath = join(testDir, sampleTestFileName)

    deleteForgeProject(contractPath, scriptPath, testPath)

    const { code } = await spawnAsync(
      `npx`,
      [
        'sphinx',
        'init',
        '--org-id',
        'TEST_ORG_ID',
        '--sphinx-api-key',
        'TEST_SPHINX_KEY',
        '--alchemy-api-key',
        'TEST_ALCHEMY_KEY',
        '--project',
        'My_First_Project',
      ],
      {
        SPHINX_INTERNAL_TEST__DEMO_TEST: 'true',
      }
    )
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
      throw new Error(`Could not find latest solc version.`)
    }
    if (
      latestSolcVersionParsed.major !== 0 ||
      latestSolcVersionParsed.minor !== 8
    ) {
      throw new Error(`Latest solc version is > 0.8.`)
    }
    latestSolcVersion = latestSolcVersionParsed
  })

  after(async () => {
    deleteForgeProject(contractPath, scriptPath, testPath)
  })

  // Test that we can compile a sample contract without the optimizer and without the IR compilation
  // setting. This is particularly useful for checking that there aren't any contracts in our
  // Foundry plugin that are included in the user's compilation process and exceed the contract size
  // limit. If this occurs, the user's `forge build --sizes` call will throw an error. See:
  // https://linear.app/chugsplash/issue/CHU-891/prevent-the-users-forge-build-sizes-call-from-failing-due-to
  //
  // This test case is significantly faster than those compiled with IR or the optimizer enabled.
  it('Compiles with optimizer disabled and without IR', async () => {
    const versions = generateSemverRange(new SemVer('0.8.0'), latestSolcVersion)

    // Generate output directory names. We use separate output directories for each compilation to
    // prevent race conditions.
    const outputDirs = versions.map((version) => `out-${version}`)
    // Generate separate cache directory names to prevent race conditions.
    const cacheDirs = versions.map((version) => `cache-${version}`)

    const buildPromises = versions.map((version, index) => {
      return limit(async () => {
        return spawnAsync(
          `forge`,
          [
            'build',
            '--use',
            version,
            '--force',
            '--out',
            outputDirs[index],
            '--cache-path',
            cacheDirs[index],
            '--sizes', // Throw an error if there are any contracts above the size limit.
          ],
          {
            FOUNDRY_PROFILE: 'no_optimizer',
          }
        ).then(({ stdout, stderr, code }) => {
          return { version, stdout, stderr, code }
        })
      })
    })

    const results = await Promise.all(buildPromises)

    const errorMessages: Array<string> = []
    results.forEach(({ version, stdout, stderr, code }) => {
      if (code !== 0) {
        if (stderr.includes('Unknown version provided')) {
          console.log(
            `Detected solc version not currently supported by foundry: ${version}`
          )
        } else {
          errorMessages.push(
            `Build failed for ${version} with optimizer and via IR disabled.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
          )
        }
      }
    })

    // Delete the output directories
    outputDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }))

    if (errorMessages.length > 0) {
      console.error(errorMessages.join('\n\n'))
    }

    // If no errors, the test passes
    expect(errorMessages).to.be.empty

    if (errorMessages.length > 0) {
      for (const error of errorMessages) {
        console.error(error)
      }
    }
  })

  // Test that we can compile the Sphinx plugin contracts for solc versions ^0.8.2 using `viaIR` and
  // the optimizer. We don't test v0.8.0 because the sample Forge project can't compile with this
  // version and settings. We don't test v0.8.1 because a `SIGSEGV` error is thrown when we use the
  // `new` keyword to deploy the `SphinxUtils` and `SphinxConstants` contracts in the constructor of
  // the `Sphinx` contract. We could support v0.8.1 by using `vm.getCode` and the low-level `CREATE`
  // opcode to deploy `SphinxUtils` and `SphinxConstants`, but `vm.getCode` caused a couple of our
  // users to run into a bug, "Multiple matching artifacts". ref:
  // https://linear.app/chugsplash/issue/CHU-917/remove-use-of-vmgetcode-to-deploy-sphinxconstants-and-sphinxutils
  it('Compiles with viaIR and optimizer enabled', async () => {
    const versions = generateSemverRange(new SemVer('0.8.2'), latestSolcVersion)

    // Generate output directory names. We use separate output directories for each compilation to
    // prevent race conditions.
    const outputDirs = versions.map((version) => `out-${version}`)
    // Generate separate cache directory names to prevent race conditions.
    const cacheDirs = versions.map((version) => `cache-${version}`)

    const buildPromises = versions.map((version, index) => {
      return limit(async () => {
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
          '--cache-path',
          cacheDirs[index],
          '--sizes', // Throw an error if there are any contracts above the size limit. It may not be necessary
          // to check this here since we have a separate test case that checks this while disabling
          // IR and the optimizer, which should always produce larger contracts. We check it here
          // anyways out of an abundance of caution. Resolves:
          // https://linear.app/chugsplash/issue/CHU-891/prevent-the-users-forge-build-sizes-call-from-failing-due-to
        ]).then(({ stdout, stderr, code }) => {
          return { version, stdout, stderr, code }
        })
      })
    })

    const results = await Promise.all(buildPromises)

    const errorMessages: Array<string> = []
    results.forEach(({ version, stdout, stderr, code }) => {
      if (code !== 0) {
        if (stderr.includes('Unknown version provided')) {
          console.log(
            `Detected solc version not currently supported by foundry: ${version}`
          )
        } else {
          errorMessages.push(
            `Build failed for ${version} with optimizer enabled.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
          )
        }
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

  // Compile the Sphinx plugin contracts using `viaIR` with the optimizer disabled. We test for solc
  // versions greater than or equal to v0.8.21. Before v0.8.21, it was very easy to trigger a "stack
  // too deep" error when compiling via IR with the optimizer disabled. For example, the standard
  // project created by `forge init` can't compile with v0.8.20 using these settings. See these two
  // issues in the Solidity repo for more context:
  // The problem: https://github.com/ethereum/solidity/issues/12533
  // The fix in v0.8.21: https://github.com/ethereum/solidity/issues/13972
  it('Compiles with viaIR and the optimizer disabled', async () => {
    const versions = generateSemverRange(
      new SemVer('0.8.21'),
      latestSolcVersion
    )

    // Generate output directory names. We use separate output directories for each compilation to
    // prevent race conditions.
    const outputDirs = versions.map((version) => `out-${version}`)
    // Generate separate cache directory names to prevent race conditions.
    const cacheDirs = versions.map((version) => `cache-${version}`)

    const buildPromises = versions.map((version, index) => {
      return limit(async () => {
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
            '--cache-path',
            cacheDirs[index],
            '--sizes', // Throw an error if there are any contracts above the size limit. It may not be necessary
            // to check this here since we have a separate test case that checks this
            // while disabling IR and the optimizer, which should always produce larger
            // contracts. We check it here anyways out of an abundance of caution.
            // Resolves:
            // https://linear.app/chugsplash/issue/CHU-891/prevent-the-users-forge-build-sizes-call-from-failing-due-to
          ],
          {
            FOUNDRY_PROFILE: 'no_optimizer',
          }
        ).then(({ stdout, stderr, code }) => {
          return { version, stdout, stderr, code }
        })
      })
    })

    const results = await Promise.all(buildPromises)

    const errorMessages: Array<string> = []
    results.forEach(({ version, stdout, stderr, code }) => {
      if (code !== 0) {
        if (stderr.includes('Unknown version provided')) {
          console.log(
            `Detected solc version not currently supported by foundry: ${version}`
          )
        } else {
          errorMessages.push(
            `Build failed for ${version} with optimizer disabled.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
          )
        }
      }
    })

    // Delete the output directories
    outputDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }))

    if (errorMessages.length > 0) {
      console.error(errorMessages.join('\n\n'))
    }

    // If no errors, the test passes
    expect(errorMessages).to.be.empty

    if (errorMessages.length > 0) {
      for (const error of errorMessages) {
        console.error(error)
      }
    }
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
