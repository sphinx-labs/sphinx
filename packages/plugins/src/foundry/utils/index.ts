import path, { basename, dirname, join } from 'path'
import { promisify } from 'util'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFile,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs'

import { BuildInfo } from '@sphinx-labs/core/dist/languages/solidity/types'
import {
  execAsync,
  sortHexStrings,
  spawnAsync,
  toSphinxTransaction,
} from '@sphinx-labs/core/dist/utils'
import {
  ConfigArtifacts,
  DeploymentInfo,
  FoundryDryRunTransaction,
  GetConfigArtifacts,
  ParsedConfig,
  RawActionInput,
  SphinxConfig,
} from '@sphinx-labs/core/dist/config/types'
import { parse } from 'semver'
import chain from 'stream-chain'
import parser from 'stream-json'
import { ignore } from 'stream-json/filters/Ignore'
import { pick } from 'stream-json/filters/Pick'
import { streamObject } from 'stream-json/streamers/StreamObject'
import { streamValues } from 'stream-json/streamers/StreamValues'
import {
  MerkleRootState,
  MerkleRootStatus,
  ProposalRequest,
  SphinxJsonRpcProvider,
  SupportedNetworkName,
  getReadableActions,
  networkEnumToName,
  findLeafWithProof,
} from '@sphinx-labs/core'
import ora from 'ora'
import {
  FoundryContractArtifact,
  SphinxLeafType,
  SphinxMerkleTree,
  SphinxModuleABI,
  parseFoundryArtifact,
  recursivelyConvertResult,
  remove0x,
} from '@sphinx-labs/contracts'
import { ethers } from 'ethers'

import {
  FoundryMultiChainDryRun,
  FoundrySingleChainBroadcast,
  FoundrySingleChainDryRun,
} from '../types'
import { FoundryToml } from '../options'

const readFileAsync = promisify(readFile)

/**
 * @field fullyQualifiedNames An array of fully qualified names, which are the keys of the
 * `BuildInfo.output.contracts` object. The fully qualified name is in the format
 * `path/to/SourceFile.sol:MyContract`. The source path can be an absolute path or a path relative
 * to the Foundry project's root.
 */
type BuildInfoCacheEntry = {
  name: string
  time: number
  fullyQualifiedNames: string[]
}

export const streamFullyQualifiedNames = async (filePath: string) => {
  const pipeline = new chain([
    createReadStream(filePath),
    parser(),
    pick({ filter: 'output' }),
    pick({ filter: 'contracts' }),
    streamObject(),
    (data) => {
      const fullyQualifiedNames: Array<string> = []
      for (const contractName of Object.keys(data.value)) {
        fullyQualifiedNames.push(`${data.key}:${contractName}`)
      }
      return fullyQualifiedNames
    },
  ])

  const names: string[] = []
  pipeline.on('data', (name) => {
    names.push(name)
  })

  await new Promise((resolve) => pipeline.on('finish', resolve))
  return names
}

export const streamBuildInfo = async (filePath: string) => {
  const pipeline = new chain([
    createReadStream(filePath),
    parser(),
    ignore({ filter: 'output' }),
    streamValues(),
    (data) => {
      return data
    },
  ])

  let buildInfo
  pipeline.on('data', (b) => {
    buildInfo = b.value
  })

  await new Promise((resolve) => pipeline.on('finish', resolve))
  return buildInfo
}

export const messageArtifactNotFound = (fullyQualifiedName: string): string => {
  return (
    `Could not find artifact for: ${fullyQualifiedName}. Please reload your artifacts by running:\n` +
    `forge clean`
  )
}

export const messageMultipleArtifactsFound = (
  contractNameOrFullyQualifiedName: string
): string => {
  return (
    `Detected multiple contracts with the name ${contractNameOrFullyQualifiedName}. Please use the fully \n` +
    `qualified name for this contract in the format: 'path/to/file/File.sol:MyContract'`
  )
}

/**
 * @notice Read a Foundry contract artifact from the file system.
 * @dev The location of an artifact file will be nested in the artifacts folder if there's more than
 * one contract in the contract source directory with the same name. This function ensures that we
 * retrieve the correct contract artifact in all cases. It works by checking the deepest possible
 * file location, and searching shallower directories until the file is found or until all
 * possibilities are exhausted.
 *
 * Example: Consider a project with a file structure where the project root is at
 * '/Users/dev/myRepo', and the contract is defined in
 * '/Users/dev/myRepo/src/tokens/MyFile.sol:MyContract'. The function will first try to find the
 * artifact in 'myRepo/artifacts/src/tokens/MyFile/MyContract.json'. If not found, it will then try
 * 'myRepo/artifacts/tokens/MyFile/MyContract.json' (notice that 'src/' is removed in this attempt),
 * and finally 'myRepo/artifacts/MyFile/MyContract.json' (notice that 'src/tokens/ is removed in
 * this attempt). If the artifact is still not found, it throws an error.
 */
export const readFoundryContractArtifact = async (
  fullyQualifiedName: string,
  projectRoot: string,
  artifactFolder: string
): Promise<FoundryContractArtifact> => {
  // Get the source file name (e.g. `MyFile.sol`) and contract name (e.g. `MyContractName`).
  const [sourceFileName, contractName] = path
    .basename(fullyQualifiedName)
    .split(':')

  // Removes the source file name and the contract name from the path. For example, if the fully
  // qualified name is `/Users/dev/myRepo/src/MySourceFile.sol:MyContractName`, then the source
  // directory path will be `/Users/dev/myRepo/src/`.
  const sourceDirectoryPath = dirname(fullyQualifiedName)

  // The source directory path can either be an absolute path or a path relative to the project
  // root. We change it to always be a path relative to the project root because this is the only
  // relevant segment of the path for retrieving the artifact.
  const relativeSourceDirPath = path.relative(projectRoot, sourceDirectoryPath)

  // Split the relative source directory path into parts.
  let pathParts = relativeSourceDirPath.split(path.sep)
  // Loop through the path parts. We start with the entire relative path on the first iteration, and
  // we remove the base directory on each iteration. We'll keep looping until we find a path that
  // contains a contract artifact, or until we run out of path parts. For example, if the initial
  // relative path is 'myDir/contracts/tokens/', we'll start with this entire path on the first
  // iteration, then 'contracts/tokens/' on the second iteration, and 'tokens/' on the third.
  while (pathParts.length > 0) {
    const joinedPathParts = pathParts.join(path.sep)
    const currentPath = join(
      artifactFolder,
      joinedPathParts,
      sourceFileName,
      `${contractName}.json`
    )

    if (existsSync(currentPath)) {
      return parseFoundryArtifact(
        JSON.parse(await readFileAsync(currentPath, 'utf8'))
      )
    }

    // Remove the base path part.
    pathParts = pathParts.slice(1)
  }

  // If we make it to this point, the artifact must exist at the most shallow level of the artifacts
  // directory, or not exist at all.

  const shortestPath = join(
    artifactFolder,
    sourceFileName,
    `${contractName}.json`
  )
  if (existsSync(shortestPath)) {
    return parseFoundryArtifact(
      JSON.parse(await readFileAsync(shortestPath, 'utf8'))
    )
  }

  throw new Error(messageArtifactNotFound(fullyQualifiedName))
}

export const getUniqueNames = (
  actionInputArray: Array<Array<RawActionInput>>,
  deploymentInfoArray: Array<DeploymentInfo>
): {
  uniqueFullyQualifiedNames: Array<string>
  uniqueContractNames: Array<string>
} => {
  const contractNamesSet = new Set<string>()
  const fullyQualifiedNamesSet = new Set<string>()
  for (const actionInputs of actionInputArray) {
    for (const rawInput of actionInputs) {
      if (typeof rawInput.contractName === 'string') {
        rawInput.contractName.includes(':')
          ? fullyQualifiedNamesSet.add(rawInput.contractName)
          : contractNamesSet.add(rawInput.contractName)
      }
    }
  }

  for (const deploymentInfo of deploymentInfoArray) {
    for (const label of deploymentInfo.labels) {
      // Only add the fully qualified name if it's not an empty string. The user can specify an empty
      // string when they want a contract to remain unlabeled.
      if (label.fullyQualifiedName !== '') {
        fullyQualifiedNamesSet.add(label.fullyQualifiedName)
      }
    }
  }

  return {
    uniqueFullyQualifiedNames: Array.from(fullyQualifiedNamesSet),
    uniqueContractNames: Array.from(contractNamesSet),
  }
}

/**
 * Creates a callback for `getConfigArtifacts`, which is a function that maps each contract in the
 * config to its artifact and build info. We use a callback to create a standard interface for the
 * `getConfigArtifacts` function, which may be used by Sphinx's future Hardhat plugin.
 */
export const makeGetConfigArtifacts = (
  artifactFolder: string,
  buildInfoFolder: string,
  projectRoot: string,
  cachePath: string
): GetConfigArtifacts => {
  return async (
    fullyQualifiedNames: Array<string>,
    contractNames: Array<string>
  ) => {
    // Check if the cache directory exists, and create it if not
    if (!existsSync(cachePath)) {
      mkdirSync(cachePath)
    }

    const buildInfoCacheFilePath = join(cachePath, 'sphinx-cache.json')
    // We keep track of the last modified time in each build info file so we can easily find the most recently generated build info files
    // We also keep track of all the contract files output by each build info file, so we can easily look up the required file for each contract artifact
    let buildInfoCache: Record<string, BuildInfoCacheEntry> = existsSync(
      buildInfoCacheFilePath
    )
      ? JSON.parse(readFileSync(buildInfoCacheFilePath, 'utf8'))
      : {}

    const buildInfoPath = join(buildInfoFolder)

    // Find all the build info files and their last modified time
    const buildInfoFileNames = readdirSync(buildInfoPath).filter((fileName) => {
      return fileName.endsWith('.json')
    })

    const cachedNames = Object.keys(buildInfoCache)
    // If there is only one build info file and it is not in the cache,
    // then clear the cache b/c the user must have force recompiled
    if (
      buildInfoFileNames.length === 1 ||
      (!cachedNames.includes(buildInfoFileNames[0]) &&
        // handles an edge case where the user made a change and then reverted it and force recompiled
        buildInfoFileNames.length > 1)
    ) {
      buildInfoCache = {}
    }

    const buildInfoFileNamesWithTime = buildInfoFileNames
      .map((fileName) => ({
        name: fileName,
        time: statSync(path.join(buildInfoPath, fileName)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time)

    // Read all of the new/modified files and update the cache to reflect the changes
    // We intentionally do not cache the files we read here because we do not know if they
    // will be used or not and storing all of them can result in memory issues if there are
    // a lot of large build info files which can happen in large projects.
    for (const file of buildInfoFileNamesWithTime) {
      // If the file exists in the cache and the time has changed, then we just update the time
      if (
        buildInfoCache[file.name]?.time &&
        buildInfoCache[file.name]?.time !== file.time
      ) {
        buildInfoCache[file.name].time = file.time
      } else {
        // Update the build info file dictionary in the cache
        buildInfoCache[file.name] = {
          name: file.name,
          time: file.time,
          fullyQualifiedNames: await streamFullyQualifiedNames(
            join(buildInfoFolder, file.name)
          ),
        }
      }
    }

    // Just make sure the files are sorted by time
    const sortedCachedFiles = Object.values(buildInfoCache).sort(
      (a, b) => b.time - a.time
    )

    // Look through the cache, read all the contract artifacts, and find all of the required build
    // info files names. We get the artifacts for every action, even if it'll be skipped, because the
    // artifact is necessary when we're creating the deployment preview, which includes skipped actions.
    const toReadFiles: string[] = []
    const localBuildInfoCache = {}

    const fullyQualifiedNamePromises = fullyQualifiedNames.map(
      async (fullyQualifiedName) => {
        const artifact = await readFoundryContractArtifact(
          fullyQualifiedName,
          projectRoot,
          artifactFolder
        )

        // Look through the cache for the first build info file that contains the contract
        for (const file of sortedCachedFiles) {
          if (file.fullyQualifiedNames?.includes(fullyQualifiedName)) {
            // Keep track of if we need to read the file or not
            if (!toReadFiles.includes(file.name)) {
              toReadFiles.push(file.name)
            }

            return {
              fullyQualifiedName,
              artifact,
              buildInfoName: file.name,
            }
          }
        }

        // Throw an error if no build info file is found in the cache for this contract
        // This should only happen if the user manually deletes a build info file
        if (existsSync(buildInfoCacheFilePath)) {
          unlinkSync(buildInfoCacheFilePath)
        }
        throw new Error(
          `Build info cache is outdated, please run 'forge build --force' then try again.`
        )
      }
    )

    const contractNamePromises = contractNames.map(
      async (targetContractName) => {
        // Look through the cache for the first build info file that contains the contract name.
        for (const cachedFile of sortedCachedFiles) {
          for (const fullyQualifiedName of cachedFile.fullyQualifiedNames) {
            const contractName = fullyQualifiedName.split(':')[1]
            if (contractName === targetContractName) {
              // Keep track of whether or not we need to read the build info file later
              if (!toReadFiles.includes(cachedFile.name)) {
                toReadFiles.push(cachedFile.name)
              }

              const artifact = await readFoundryContractArtifact(
                fullyQualifiedName,
                projectRoot,
                artifactFolder
              )
              return {
                fullyQualifiedName,
                artifact,
                buildInfoName: cachedFile.name,
              }
            }
          }
        }

        // Throw an error if no build info file is found in the cache for this contract name. This
        // should only happen if the user manually deletes a build info file.
        if (existsSync(buildInfoCacheFilePath)) {
          unlinkSync(buildInfoCacheFilePath)
        }
        throw new Error(
          `Build info cache is outdated. Please run 'forge build --force' then try again.`
        )
      }
    )

    const resolved = await Promise.all(
      fullyQualifiedNamePromises.concat(contractNamePromises)
    )

    // Read any build info files that we didn't already have in memory. This sometimes means we read
    // files twice (above, and then again here) which is not ideal, but reduces the memory footprint
    // of this function significantly in large projects.
    await Promise.all(
      toReadFiles.map(async (file) => {
        const fullFilePath = join(buildInfoFolder, file)
        if (!existsSync(fullFilePath)) {
          if (existsSync(buildInfoCacheFilePath)) {
            unlinkSync(buildInfoCacheFilePath)
          }
          throw new Error(
            `Build info cache is outdated, please run 'forge build --force' then try again.`
          )
        } else {
          const buildInfo = await streamBuildInfo(fullFilePath)
          localBuildInfoCache[file] = buildInfo
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
    writeFileSync(
      buildInfoCacheFilePath,
      JSON.stringify(buildInfoCache, null, 2)
    )

    const configArtifacts: ConfigArtifacts = {}

    for (const {
      fullyQualifiedName,
      artifact,
      buildInfo,
    } of completeArtifacts) {
      configArtifacts[fullyQualifiedName] = {
        artifact,
        buildInfo,
      }
    }

    return configArtifacts
  }
}

/**
 * Attempts to infer the default solc version given by `solc --version`. If this fails, it will
 * return the default solc version used by Foundry's "Getting Started" guide, which is 0.8.19.
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

export const getConfigArtifactForContractName = (
  targetContractName: string,
  configArtifacts: ConfigArtifacts
): {
  fullyQualifiedName: string
  buildInfo: BuildInfo
  artifact: FoundryContractArtifact
} => {
  for (const [fullyQualifiedName, { buildInfo, artifact }] of Object.entries(
    configArtifacts
  )) {
    const contractName = fullyQualifiedName.split(':')[1]
    if (contractName === targetContractName) {
      return {
        fullyQualifiedName,
        buildInfo,
        artifact,
      }
    }
  }
  throw new Error(
    `Could not find artifact for ${targetContractName}. Should never happen.`
  )
}

export const getSphinxConfigFromScript = async (
  scriptPath: string,
  sphinxPluginTypesInterface: ethers.Interface,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<SphinxConfig<SupportedNetworkName>> => {
  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxConfigABIEncoded()',
    '--silent', // Silence compiler output
    '--json',
  ]
  if (targetContract) {
    forgeScriptArgs.push('--target-contract', targetContract)
  }

  const { code, stdout, stderr } = await spawnAsync('forge', forgeScriptArgs)

  if (code !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  }

  const returned = JSON.parse(stdout).returns['0'].value

  // ABI decode the gas array.
  const coder = ethers.AbiCoder.defaultAbiCoder()
  const sphinxConfigFragment = findFunctionFragment(
    sphinxPluginTypesInterface,
    'sphinxConfigType'
  )

  const decoded = coder.decode(sphinxConfigFragment.outputs, returned)
  const { sphinxConfig } = recursivelyConvertResult(
    sphinxConfigFragment.outputs,
    decoded
  ) as any

  const parsed: SphinxConfig<SupportedNetworkName> = {
    projectName: sphinxConfig.projectName,
    owners: sortHexStrings(sphinxConfig.owners),
    threshold: sphinxConfig.threshold.toString(),
    orgId: sphinxConfig.orgId,
    testnets: sphinxConfig.testnets.map(networkEnumToName),
    mainnets: sphinxConfig.mainnets.map(networkEnumToName),
    saltNonce: sphinxConfig.saltNonce.toString(),
  }

  return parsed
}

export const getSphinxModuleAddressFromScript = async (
  scriptPath: string,
  forkUrl: string,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<string> => {
  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--rpc-url',
    forkUrl,
    '--sig',
    'sphinxModule()',
    '--silent', // Silence compiler output
    '--json',
  ]
  if (targetContract) {
    forgeScriptArgs.push('--target-contract', targetContract)
  }

  const { code, stdout, stderr } = await spawnAsync('forge', forgeScriptArgs)

  if (code !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  }

  const json = JSON.parse(stdout)

  const safeAddress = json.returns[0].value

  return safeAddress
}

export const getSphinxSafeAddressFromScript = async (
  scriptPath: string,
  forkUrl: string,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<string> => {
  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--rpc-url',
    forkUrl,
    '--sig',
    'sphinxSafe()',
    '--silent', // Silence compiler output
    '--json',
  ]
  if (targetContract) {
    forgeScriptArgs.push('--target-contract', targetContract)
  }

  const { code, stdout, stderr } = await spawnAsync('forge', forgeScriptArgs)

  if (code !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  }

  const json = JSON.parse(stdout)

  const safeAddress = json.returns[0].value

  return safeAddress
}

export const getSphinxLeafGasEstimates = async (
  scriptPath: string,
  foundryToml: FoundryToml,
  networkNames: Array<SupportedNetworkName>,
  sphinxPluginTypesInterface: ethers.Interface,
  collected: Array<{
    deploymentInfo: DeploymentInfo
    actionInputs: Array<RawActionInput>
  }>,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<Array<Array<string>>> => {
  const leafGasParamsFragment = findFunctionFragment(
    sphinxPluginTypesInterface,
    'leafGasParams'
  )

  const coder = ethers.AbiCoder.defaultAbiCoder()
  const leafGasInputsFilePath = join(
    foundryToml.cachePath,
    'sphinx-estimate-leaf-gas.txt'
  )

  const gasEstimatesArray: Array<Array<string>> = []
  for (const { actionInputs, deploymentInfo } of collected) {
    const txns = actionInputs.map(toSphinxTransaction)
    const encodedTxnArray = coder.encode(leafGasParamsFragment.outputs, [txns])

    // Write the ABI encoded data to the file system. We'll read it in the Forge script. We do this
    // instead of passing in the data as a parameter to the Forge script because it's possible to hit
    // Node's `spawn` input size limit if the data is large. This is particularly a concern because
    // the data contains contract init code.
    writeFileSync(leafGasInputsFilePath, encodedTxnArray)

    const leafGasEstimationScriptArgs = [
      'script',
      scriptPath,
      '--sig',
      'sphinxEstimateMerkleLeafGas(string,uint256)',
      leafGasInputsFilePath,
      deploymentInfo.chainId,
      '--silent', // Silence compiler output
      '--json',
    ]
    if (targetContract) {
      leafGasEstimationScriptArgs.push('--target-contract', targetContract)
    }

    const gasEstimationSpawnOutput = await spawnAsync(
      'forge',
      leafGasEstimationScriptArgs
    )
    if (gasEstimationSpawnOutput.code !== 0) {
      spinner?.stop()
      // The `stdout` contains the trace of the error.
      console.log(gasEstimationSpawnOutput.stdout)
      // The `stderr` contains the error message.
      console.log(gasEstimationSpawnOutput.stderr)
      process.exit(1)
    }

    const returned = JSON.parse(gasEstimationSpawnOutput.stdout).returns
      .abiEncodedGasArray.value
    // ABI decode the gas array.
    const [decoded] = coder.decode(['uint256[]'], returned)
    // Convert the BigInt elements to Numbers, then multiply by a buffer. This ensures the user's
    // transaction doesn't fail on-chain due to variations in the chain state, which could occur
    // between the time of the simulation and execution.
    const returnedGasArrayWithBuffer = decoded
      // Convert the BigInt elements to Numbers
      .map(Number)
      // Include a buffer to ensure the user's transaction doesn't fail on-chain due to variations
      // in the chain state, which could occur between the time of the simulation and execution. We
      // chose to multiply the gas by 1.3 because multiplying it by a higher number could make a
      // very large transaction unexecutable on-chain. Since the 1.3x multiplier doesn't impact
      // small transactions very much, we add a constant amount of 20k too.
      .map((gas) => Math.round(gas * 1.3 + 20_000).toString())

    gasEstimatesArray.push(returnedGasArrayWithBuffer)
  }

  return gasEstimatesArray
}

export const isFoundryMultiChainDryRun = (
  dryRun: FoundrySingleChainDryRun | FoundryMultiChainDryRun
): dryRun is FoundryMultiChainDryRun => {
  return (
    Array.isArray((dryRun as FoundryMultiChainDryRun).deployments) &&
    typeof (dryRun as FoundryMultiChainDryRun).timestamp === 'number' &&
    !isFoundrySingleChainDryRun(dryRun)
  )
}

export const isFoundrySingleChainDryRun = (
  dryRun: FoundrySingleChainDryRun | FoundryMultiChainDryRun
): dryRun is FoundrySingleChainDryRun => {
  return (
    Array.isArray((dryRun as FoundrySingleChainDryRun).transactions) &&
    Array.isArray((dryRun as FoundrySingleChainDryRun).receipts) &&
    Array.isArray((dryRun as FoundrySingleChainDryRun).libraries) &&
    Array.isArray((dryRun as FoundrySingleChainDryRun).pending) &&
    'returns' in (dryRun as FoundrySingleChainDryRun) &&
    typeof (dryRun as FoundrySingleChainDryRun).timestamp === 'number' &&
    typeof (dryRun as FoundrySingleChainDryRun).chain === 'number' &&
    typeof (dryRun as FoundrySingleChainDryRun).multi === 'boolean' &&
    typeof (dryRun as FoundrySingleChainDryRun).commit === 'string'
  )
}

/**
 * Read a Foundry multi-chain dry run file.
 *
 * @param timeThreshold The earliest time that the dry run file could have been written. This
 * function will return `undefined` if the dry run file was modified earlier than this time. This
 * ensures that we don't read a dry run file from an outdated dry run.
 */
export const readFoundryMultiChainDryRun = (
  broadcastFolder: string,
  scriptPath: string,
  functionNameOrSelector: string,
  timeThreshold: Date
): FoundryMultiChainDryRun | undefined => {
  // An example of the file location:
  // `broadcast/multi/dry-run/MyScript.s.sol-latest/myScriptFunctionName.json`
  const dryRunPath = join(
    broadcastFolder,
    'multi',
    'dry-run',
    `${basename(scriptPath)}-latest`,
    `${functionNameOrSelector}.json`
  )

  // Check that the file exists and it was modified later than the supplied time threshold. If the
  // file doesn't exist, this means there weren't any broadcasted transactions. If the file exists
  // but it was modified earlier than the time threshold, this means there's an outdated dry run at
  // the file location, which will also means there weren't any broadcasted transactions in the most
  // recent Forge script run. We don't want to use an outdated file because it likely contains a
  // different deployment.
  if (existsSync(dryRunPath) && statSync(dryRunPath).mtime > timeThreshold) {
    return JSON.parse(readFileSync(dryRunPath, 'utf8'))
  } else {
    return undefined
  }
}

export const getFoundrySingleChainDryRunPath = (
  broadcastFolder: string,
  scriptPath: string,
  chainId: string | bigint | number,
  functionNameOrSelector: string
): string => {
  // If the script is in a subdirectory (e.g. script/my/path/MyScript.s.sol), Foundry still only
  // uses only the script's file name, not its entire path. An example of the file location:
  // broadcast/MyScriptName/31337/dry-run/myScriptFunctionName-latest.json
  return join(
    broadcastFolder,
    basename(scriptPath),
    chainId.toString(),
    'dry-run',
    `${functionNameOrSelector}-latest.json`
  )
}

/**
 * @param timeThreshold The earliest time that the dry run file could have been written. This
 * function will return `undefined` if the dry run file was modified earlier than this time. This
 * ensures that we don't read a dry run file from an outdated dry run.
 */
export const readFoundrySingleChainBroadcast = (
  broadcastFolder: string,
  scriptPath: string,
  chainId: string | number | bigint,
  functionNameOrSelector: string,
  timeThreshold: Date
): FoundrySingleChainBroadcast | undefined => {
  const broadcastFilePath = join(
    broadcastFolder,
    basename(scriptPath),
    chainId.toString(),
    `${functionNameOrSelector}-latest.json`
  )

  // Check that the file exists and it was modified later than the supplied time threshold. If the
  // file doesn't exist, this means there weren't any broadcasted transactions. If the file exists
  // but it was modified earlier than the time threshold, this means there's an outdated broadcast
  // at the file location, which will also means there weren't any broadcasted transactions in the
  // most recent Forge script run. We don't want to use an outdated file because it likely contains
  // a different deployment.
  if (
    existsSync(broadcastFilePath) &&
    statSync(broadcastFilePath).mtime > timeThreshold
  ) {
    return JSON.parse(readFileSync(broadcastFilePath, 'utf8'))
  } else {
    return undefined
  }
}

/**
 * Read a Foundry multi-chain dry run file.
 *
 * @param timeThreshold The earliest time that the dry run file could have been written. This
 * function will return `undefined` if the dry run file was modified earlier than this time. This
 * ensures that we don't read a dry run file from an outdated dry run.
 */
export const readFoundrySingleChainDryRun = (
  broadcastFolder: string,
  scriptPath: string,
  chainId: string | bigint | number,
  functionNameOrSelector: string,
  timeThreshold: Date
): FoundrySingleChainDryRun | undefined => {
  const dryRunPath = getFoundrySingleChainDryRunPath(
    broadcastFolder,
    scriptPath,
    chainId.toString(),
    functionNameOrSelector
  )

  // Check that the file exists and it was modified later than the supplied time threshold. If the
  // file doesn't exist, this means there weren't any broadcasted transactions. If the file exists
  // but it was modified earlier than the time threshold, this means there's an outdated dry run at
  // the file location, which will also means there weren't any broadcasted transactions in the most
  // recent Forge script run. We don't want to use an outdated file because it likely contains a
  // different deployment.
  if (existsSync(dryRunPath) && statSync(dryRunPath).mtime > timeThreshold) {
    return JSON.parse(readFileSync(dryRunPath, 'utf8'))
  } else {
    return undefined
  }
}

export const approve = async (
  scriptPath: string,
  foundryToml: FoundryToml,
  merkleTree: SphinxMerkleTree,
  sphinxIface: ethers.Interface,
  chainId: number,
  rpcUrl: string,
  spinner?: ora.Ora,
  targetContract?: string
): Promise<FoundrySingleChainBroadcast> => {
  const approveLeafWithProof = findLeafWithProof(
    merkleTree,
    SphinxLeafType.APPROVE,
    BigInt(chainId)
  )

  const approveFragment = findFunctionFragment(sphinxIface, 'sphinxApprove')
  const encodedFunctionParams = sphinxIface.encodeFunctionData(
    approveFragment,
    [merkleTree.root, approveLeafWithProof, false]
  )

  const dateBeforeForgeScript = new Date()
  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--sig',
    encodedFunctionParams,
    '--rpc-url',
    rpcUrl,
    '--broadcast',
  ]
  if (targetContract) {
    forgeScriptArgs.push('--target-contract', targetContract)
  }

  const { code, stdout, stderr } = await spawnAsync('forge', forgeScriptArgs)

  if (code !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  }

  const broadcast = readFoundrySingleChainBroadcast(
    foundryToml.broadcastFolder,
    scriptPath,
    chainId,
    remove0x(approveFragment.selector),
    dateBeforeForgeScript
  )

  if (!broadcast) {
    throw new Error(
      `Could not read broadcast file for the Sphinx Module and Gnosis Safe deployment. Should never happen.`
    )
  }

  return broadcast
}

export const deploySphinxModuleAndGnosisSafe = async (
  scriptPath: string,
  foundryToml: FoundryToml,
  networkName: string,
  chainId: string,
  rpcUrl: string,
  spinner?: ora.Ora,
  targetContract?: string
): Promise<FoundrySingleChainBroadcast> => {
  const dateBeforeForgeScript = new Date()
  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxDeployModuleAndGnosisSafe(string)',
    networkName,
    '--rpc-url',
    rpcUrl,
    '--broadcast',
  ]
  if (targetContract) {
    forgeScriptArgs.push('--target-contract', targetContract)
  }

  const { code, stdout, stderr } = await spawnAsync('forge', forgeScriptArgs)

  if (code !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  }

  const broadcast = readFoundrySingleChainBroadcast(
    foundryToml.broadcastFolder,
    scriptPath,
    chainId,
    'sphinxDeployModuleAndGnosisSafe',
    dateBeforeForgeScript
  )

  if (!broadcast) {
    throw new Error(
      `Could not read broadcast file for the Sphinx Module and Gnosis Safe deployment. Should never happen.`
    )
  }

  return broadcast
}

export const getGasEstimatesOnNetworks = (
  dryRun: FoundrySingleChainDryRun | FoundryMultiChainDryRun,
  uniqueChainIds: Array<string>,
  managedServiceAddress: string
): ProposalRequest['gasEstimates'] => {
  const gasEstimates: ProposalRequest['gasEstimates'] = []
  for (const chainId of uniqueChainIds) {
    let transactions: Array<FoundryDryRunTransaction>
    if (isFoundryMultiChainDryRun(dryRun)) {
      // Find the dry run that corresponds to the current network.
      const deploymentOnNetwork = dryRun.deployments.find(
        (deployment) => deployment.chain.toString() === chainId
      )
      // If we couldn't find a dry run that corresponds to the current network, then there must not
      // be any transactions to execute on it. We use an empty transactions array in this case.
      transactions = deploymentOnNetwork ? deploymentOnNetwork.transactions : []
    } else if (isFoundrySingleChainDryRun(dryRun)) {
      // Check if the current network matches the network of the dry run. If the current network
      // doesn't match the dry run's network, then this means there weren't any transactions
      // executed on the current network. We use an empty transactions array in this case.
      transactions =
        chainId === dryRun.chain.toString() ? dryRun.transactions : []
    } else {
      throw new Error(
        `Foundry dry run is an incompatible type. Should never happen.`
      )
    }

    const estimatedGasOnChain = transactions
      // We remove any transactions that weren't broadcasted from the Managed Service contract.
      // Particularly, we broadcast from the Gnosis Safe to make the auto-generated Sphinx wallets
      // owners of the Gnosis Safe. We don't want to include those transactions in the gas estimate
      // because they won't occur in production.
      .filter(
        (tx) =>
          typeof tx.transaction.from === 'string' &&
          ethers.getAddress(tx.transaction.from) === managedServiceAddress
      )
      .map((tx) => tx.transaction.gas)
      // Narrow the TypeScript type of `gas` from `string | null` to `string`.
      .map((gas) => {
        if (typeof gas !== 'string') {
          throw new Error(
            `Detected a 'gas' field that is not a string. Should never happen.`
          )
        }
        return gas
      })
      // Convert the gas values from hex strings to numbers.
      .map((gas) => parseInt(gas, 16))

    gasEstimates.push({
      chainId: Number(chainId),
      // Sum the gas estimates then convert to a string.
      estimatedGas: estimatedGasOnChain.reduce((a, b) => a + b).toString(),
    })
  }

  return gasEstimates
}

export const execute = async (
  scriptPath: string,
  parsedConfig: ParsedConfig,
  merkleTree: SphinxMerkleTree,
  foundryToml: FoundryToml,
  rpcUrl: string,
  networkName: string,
  silent: boolean,
  sphinxPluginTypesInterface: ethers.Interface,
  targetContract?: string,
  verify?: boolean,
  spinner?: ora.Ora
): Promise<FoundrySingleChainBroadcast | undefined> => {
  spinner?.start(`Executing deployment...`)

  const provider = new SphinxJsonRpcProvider(rpcUrl)

  const deployTaskInputsFragment = findFunctionFragment(
    sphinxPluginTypesInterface,
    'deployTaskInputsType'
  )

  const humanReadableActions = getReadableActions(parsedConfig.actionInputs)

  // ABI encode the inputs to the deployment function.
  const coder = ethers.AbiCoder.defaultAbiCoder()
  const encodedDeployTaskInputs = coder.encode(
    deployTaskInputsFragment.outputs,
    [merkleTree, humanReadableActions]
  )
  const deployTaskInputsPath = join(
    foundryToml.cachePath,
    'sphinx-deploy-task-inputs.txt'
  )
  // Write the ABI encoded data to the file system. We'll read it in the Forge script that executes
  // the deployment. We do this instead of passing in the data as a parameter to the Forge script
  // because it's possible to hit Node's `spawn` input size limit if the data is large. This is
  // particularly a concern for the Merkle tree, which likely contains contract init code.
  writeFileSync(deployTaskInputsPath, encodedDeployTaskInputs)

  const forgeScriptDeployArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxExecute(string,string)',
    networkName,
    deployTaskInputsPath,
    '--fork-url',
    rpcUrl,
    '--broadcast',
    // Set the gas estimate multiplier to be 40% instead of Foundry's default 30%. We set it to be
    // slightly higher than normal because we encountered an issue on Anvil where Foundry
    // successfully simulated the deployment, but then submitted an insufficient amount of gas to
    // the Sphinx Module's `execute` function, leading to a "SphinxModule: insufficient gas" error.
    '--gas-estimate-multiplier',
    '140',
  ]
  if (verify) {
    forgeScriptDeployArgs.push('--verify')
  }
  if (targetContract) {
    forgeScriptDeployArgs.push('--target-contract', targetContract)
  }

  const dateBeforeForgeScriptDeploy = new Date()
  const { code, stdout, stderr } = await spawnAsync(
    'forge',
    forgeScriptDeployArgs
  )

  if (code !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  } else if (!silent) {
    console.log(stdout)
  }

  spinner?.succeed(`Executed deployment.`)
  spinner?.start(`Checking final deployment status...`)

  // Check the Merkle root's status. It's possible that the deployment succeeded during the
  // simulation but was marked as `FAILED` when the transactions were broadcasted.
  const sphinxModule = new ethers.Contract(
    parsedConfig.moduleAddress,
    SphinxModuleABI,
    provider
  )
  const merkleRootState: MerkleRootState = await sphinxModule.merkleRootStates(
    merkleTree.root
  )
  if (merkleRootState.status === MerkleRootStatus.FAILED) {
    spinner?.fail(`Deployment failed when broadcasting the transactions.`)
    process.exit(1)
  }

  spinner?.succeed(`Deployment succeeded.`)

  return readFoundrySingleChainBroadcast(
    foundryToml.broadcastFolder,
    scriptPath,
    parsedConfig.chainId,
    'sphinxExecute',
    dateBeforeForgeScriptDeploy
  )
}

export const readInterface = (
  artifactFolder: string,
  contractName: string
): ethers.Interface => {
  const abi: Array<any> =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(path.resolve(
      `${artifactFolder}/${contractName}.sol/${contractName}.json`
    )).abi
  return new ethers.Interface(abi)
}

const findFunctionFragment = (
  iface: ethers.Interface,
  fragmentName: string
): ethers.FunctionFragment => {
  const functionFragment = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === fragmentName)
  if (!functionFragment) {
    throw new Error(`Fragment not found in ABI.`)
  }
  return functionFragment
}
