import * as fs from 'fs'
import path, { join } from 'path'
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

export const getBuildInfo = (
  buildInfos: Array<{
    buildInfo: BuildInfo
    name: string
  }>,
  sourceName: string
):
  | {
      buildInfo: BuildInfo
      name: string
    }
  | false => {
  // Find the correct build info file
  for (const input of buildInfos) {
    if (input?.buildInfo.output?.contracts[sourceName] !== undefined) {
      validateBuildInfo(input.buildInfo, 'foundry')
      return input
    }
  }

  return false
}

export const getContractArtifact = async (
  name: string,
  artifactFilder: string,
  cachedContractNames: Record<string, string[]>
): Promise<ContractArtifact> => {
  const sources = cachedContractNames[name]
  if (sources?.length > 1) {
    throw new Error(
      `Detected multiple contracts with the name ${name} in different files, to resolve this:
- Use the fully qualified name for this contract: 'path/to/file/SomeFile.sol:MyContract'
- Or rename one of the contracts and force recompile: 'forge build --force'`
    )
  }

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

  if (fs.existsSync(standardFilePath)) {
    return parseFoundryArtifact(
      JSON.parse(await readFileAsync(standardFilePath, 'utf8'))
    )
  } else if (fs.existsSync(qualifiedFilePath)) {
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
  buildInfoFolder: string,
  cachePath: string
): GetConfigArtifacts => {
  return async (contractConfigs: UserContractConfigs) => {
    // Check if the cache directory exists, and create it if not
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath)
    }

    const buildInfoCacheFilePath = join(cachePath, 'chugsplash-cache.json')
    let buildInfoCache: {
      // We track all contract names and the associated source files that contain them
      // This allows us to detect ambiguous contract names and prompt the user to use fully qualified names
      contracts: Record<string, string[]>
      // We keep track of the last modified time in each build info file so we can easily find the most recently generated build info files
      // We also keep track of all the contract files output by each build info file, so we can easily look up the required file for each contract artifact
      files: Record<
        string,
        {
          name: string
          time: number
          contracts: string[]
        }
      >
    } = fs.existsSync(buildInfoCacheFilePath)
      ? JSON.parse(fs.readFileSync(buildInfoCacheFilePath, 'utf8'))
      : {
          contracts: {},
          files: {},
        }

    const buildInfoPath = join(buildInfoFolder)

    // Find all the build info files and their last modified time
    const buildInfoFileNames = fs
      .readdirSync(buildInfoPath)
      .filter((fileName) => {
        return fileName.endsWith('.json')
      })

    const cachedNames = Object.keys(buildInfoCache.files)
    // If there is only one build info file and it is not in the cache,
    // then clear the cache b/c the user must have force recompiled
    if (
      buildInfoFileNames.length === 1 &&
      (!cachedNames.includes(buildInfoFileNames[0]) ||
        // handles an edge case where the user made a change and then reverted it and force recompiled
        buildInfoFileNames.length > 1)
    ) {
      buildInfoCache = {
        contracts: {},
        files: {},
      }
    }

    const buildInfoFileNamesWithTime = buildInfoFileNames
      .map((fileName) => ({
        name: fileName,
        time: fs.statSync(path.join(buildInfoPath, fileName)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time)

    // Read all of the new/modified files and update the cache to reflect the changes
    // Keep an in memory cache of the read files so we don't have to read them again later
    const localBuildInfoCache = {}
    await Promise.all(
      buildInfoFileNamesWithTime
        .filter((file) => buildInfoCache.files[file.name]?.time !== file.time)
        .map(async (file) => {
          // If the file exists in the cache and the time has changed, then we just update the time
          if (
            buildInfoCache.files[file.name]?.time &&
            buildInfoCache.files[file.name]?.time !== file.time
          ) {
            buildInfoCache.files[file.name].time = file.time
            return
          }

          const buildInfo = JSON.parse(
            fs.readFileSync(join(buildInfoFolder, file.name), 'utf8')
          )

          // Update the contract name to source file dictionary in the cache
          Object.keys(buildInfo.output.contracts).map((contractSourceName) => {
            const contractOutput =
              buildInfo.output.contracts[contractSourceName]
            const contractNames = Object.keys(contractOutput)
            contractNames.map((contractName) => {
              if (!buildInfoCache.contracts[contractName]) {
                buildInfoCache.contracts[contractName] = [contractSourceName]
              } else if (
                !buildInfoCache.contracts[contractName].includes(
                  contractSourceName
                )
              ) {
                buildInfoCache.contracts[contractName].push(contractSourceName)
              }
            })
          })

          // Update the build info file dictionary in the cache
          buildInfoCache.files[file.name] = {
            name: file.name,
            time: file.time,
            contracts: Object.keys(buildInfo.output.contracts),
          }

          localBuildInfoCache[file.name] = buildInfo
        })
    )
    // Just make sure the files are sorted by time
    const sortedCachedFiles = Object.values(buildInfoCache.files).sort(
      (a, b) => b.time - a.time
    )

    // Look through the cache, read all the contract artifacts, and find all of the build info files names required for the passed in contract config
    const toReadFiles: string[] = []
    const resolved = await Promise.all(
      Object.entries(contractConfigs).map(
        async ([referenceName, contractConfig]) => {
          const artifact = await getContractArtifact(
            contractConfig.contract,
            artifactFolder,
            buildInfoCache.contracts
          )

          // Look through the cahce for the first build info file that contains the contract
          for (const file of sortedCachedFiles) {
            if (file.contracts.includes(artifact.sourceName)) {
              const buildInfo =
                file.name in localBuildInfoCache
                  ? (localBuildInfoCache[file.name] as BuildInfo)
                  : undefined

              // Keep track of if we need to read the file or not
              if (!buildInfo && !toReadFiles.includes(file.name)) {
                toReadFiles.push(file.name)
              }

              return {
                referenceName,
                artifact,
                buildInfoName: file.name,
                buildInfo,
              }
            }
          }

          // Throw an error if no build info file is found in the cache for this contract
          // This should only happen if the user manually deletes a build info file
          throw new Error(
            `Failed to find build info for ${artifact.sourceName}. Try recompiling with force: forge build --force`
          )
        }
      )
    )

    // Read any build info files that we didn't already have in memory
    await Promise.all(
      toReadFiles.map(async (file) => {
        try {
          const buildInfo = JSON.parse(
            await readFileAsync(join(buildInfoFolder, file), 'utf8')
          )
          localBuildInfoCache[file] = buildInfo
        } catch (e) {
          // Throw an error if we can't read the file
          // This should only happen if the user manually deleted the file
          throw new Error(
            `Failed to read file ${file}. Try recompiling with force: forge build --force`
          )
        }
      })
    )

    // Combine the cached build infos with the contract artifacts
    const completeArtifacts = resolved.map((artifactInfo) => {
      return {
        ...artifactInfo,
        buildInfo: localBuildInfoCache[artifactInfo.buildInfoName],
      }
    })

    // Write the updated build info cache
    fs.writeFileSync(
      buildInfoCacheFilePath,
      JSON.stringify(buildInfoCache, null, 2)
    )

    const configArtifacts: ConfigArtifacts = {}

    for (const { referenceName, artifact, buildInfo } of completeArtifacts) {
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
