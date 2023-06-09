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
} from '@chugsplash/core/dist/utils'
import {
  ConfigArtifacts,
  GetConfigArtifacts,
  UserContractConfigs,
} from '@chugsplash/core/dist/config/types'

const readFileAsync = promisify(fs.readFile)
const existsAsync = promisify(fs.exists)

export const getBuildInfo = (
  buildInfos: Array<BuildInfo>,
  sourceName: string
): BuildInfo => {
  // Find the correct build info file
  for (const input of buildInfos) {
    if (input?.output?.sources[sourceName] !== undefined) {
      validateBuildInfo(input)
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
  const folderName = `${name}.sol`
  const fileName = `${name}.json`
  const completeFilePath = join(artifactFilder, folderName, fileName)

  if (!(await existsAsync(completeFilePath))) {
    throw new Error(
      `Could not find artifact for: ${name}. Did you forget to import it in your script file?`
    )
  }

  const artifact = JSON.parse(await readFileAsync(completeFilePath, 'utf8'))

  return parseFoundryArtifact(artifact)
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
      .filter((file) => {
        return file.endsWith('.json')
      })
      .map(async (file) => {
        return JSON.parse(
          await readFileAsync(join(buildInfoFolder, file), 'utf8')
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
