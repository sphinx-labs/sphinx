import * as fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'

import {
  BuildInfo,
  ContractArtifact,
} from '@chugsplash/core/dist/languages/solidity/types'
import {
  parseFoundryArtifact,
  validateBuildInfo,
  execAsync,
} from '@chugsplash/core/dist/utils'
import {
  ConfigArtifacts,
  GetConfigArtifacts,
  UserContractConfigs,
} from '@chugsplash/core/dist/config/types'
import { parse } from 'semver'

const readFileAsync = promisify(fs.readFile)
const existsAsync = promisify(fs.exists)

export const getBuildInfo = (
  buildInfos: Array<BuildInfo>,
  sourceName: string
): BuildInfo => {
  // Find the correct build info file
  for (const input of buildInfos) {
    if (input?.output?.contracts[sourceName] !== undefined) {
      validateBuildInfo(input, 'foundry')
      return input
    }
  }

  throw new Error(
    `Failed to find build info for ${sourceName}. Please check that you:
1. Imported this file in your script
2. Set 'force=true' in your foundry.toml
3. Check that you've set the correct build info directory in your foundry.toml.`
  )
}

export const getContractArtifact = async (
  name: string,
  artifactFilder: string
): Promise<ContractArtifact> => {
  // Try to find the artifact in the standard format
  const folderName = `${name}.sol`
  const fileName = `${name}.json`
  const standardFilePath = join(artifactFilder, folderName, fileName)

  // Try to find the artifact in the qualified format
  // Technically we don't need the full path to the file b/c foundry outputs a flat directory structure
  // For clarity and consistency with other tools, we still handle the fully qualified format and recommend it
  const qualifiedSections = name.split('/').pop()
  const [file, contract] = qualifiedSections?.split(':') ?? ['', '']
  const qualifiedFilePath = join(artifactFilder, file, `${contract}.json`)

  if (await existsAsync(standardFilePath)) {
    return parseFoundryArtifact(
      JSON.parse(await readFileAsync(standardFilePath, 'utf8'))
    )
  } else if (await existsAsync(qualifiedFilePath)) {
    return parseFoundryArtifact(
      JSON.parse(await readFileAsync(qualifiedFilePath, 'utf8'))
    )
  } else {
    // If we can't find the artifact, throw an error and recommend checking their options and using fully qualified format
    throw new Error(
      `Could not find artifact for: ${name}.
- Please make sure that this contract exists in either the src, script, or test directory that you've configured in your foundry.toml.
- If you have multiple contracts in the same file or have files with different names from the contracts they contain, please use the fully qualified name for the contract.
  For example: 'path/to/file/SomeFile.sol:MyContract'
`
    )
  }
}

/**
 * Creates a callback for `getConfigArtifacts`, which is a function that maps each contract in the
 * config to its artifact and build info. We use a callback to create a standard interface for the
 * `getConfigArtifacts` function, which has a separate implementation for the Hardhat and Foundry
 * plugin.
 *
 * @param hre Hardhat runtime environment.
 * @param contractConfigs Contract configurations.
 * @param artifactFolder Path to the artifact folder.
 * @param buildInfoFolder Path to the build info folder.
 * @returns Paths to the build info and contract artifact files.
 */
export const makeGetConfigArtifacts = (
  artifactFolder: string,
  buildInfoFolder: string
): GetConfigArtifacts => {
  return async (contractConfigs: UserContractConfigs) => {
    const buildInfoPath = join(buildInfoFolder)

    const buildInfoPromises = fs
      .readdirSync(buildInfoPath)
      .filter((fileName) => {
        return fileName.endsWith('.json')
      })
      .map((fileName) => ({
        name: fileName,
        time: fs.statSync(`${buildInfoPath}/${fileName}`).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time)
      .map(async (file) => {
        return JSON.parse(
          await readFileAsync(join(buildInfoFolder, file.name), 'utf8')
        )
      })

    const buildInfos = await Promise.all(buildInfoPromises)

    const configArtifactPromises = Object.entries(contractConfigs).map(
      async ([referenceName, contractConfig]) => {
        const artifact = await getContractArtifact(
          contractConfig.contract,
          artifactFolder
        )
        const buildInfo = getBuildInfo(buildInfos, artifact.sourceName)

        return {
          referenceName,
          artifact,
          buildInfo,
        }
      }
    )

    const resolved = await Promise.all(configArtifactPromises)

    const configArtifacts: ConfigArtifacts = {}

    for (const { referenceName, artifact, buildInfo } of resolved) {
      configArtifacts[referenceName] = {
        artifact,
        buildInfo,
      }
    }
    return configArtifacts
  }
}

/**
 * Attempts to infer the default solc version given by `solc --version`. If this fails, it will
 * return the default solc version used by Foundry's "Getting Started" guide, which is 0.8.20.
 */
export const inferSolcVersion = async (): Promise<string> => {
  // This is the default solc version used by Foundry's "Getting Started" guide.
  const defaultSolcVersion = '0.8.19'
  try {
    const solcVersionOutput = await execAsync('solc --version')
    const solcVersionRaw = solcVersionOutput.stdout.split('Version: ')[1]
    const parsed = parse(solcVersionRaw)
    return parsed ? parsed.toString() : defaultSolcVersion
  } catch (err) {
    return defaultSolcVersion
  }
}
