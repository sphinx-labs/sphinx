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
import { spawnSync } from 'child_process'

import {
  BuildInfo,
  SphinxTransactionReceipt,
} from '@sphinx-labs/core/dist/languages/solidity/types'
import {
  execAsync,
  formatSolcLongVersion,
  getBytesLength,
  getNetworkNameForChainId,
  getSystemContractInfo,
  sortHexStrings,
  spawnAsync,
  toSphinxTransaction,
  zeroOutLibraryReferences,
} from '@sphinx-labs/core/dist/utils'
import {
  ConfigArtifacts,
  DeploymentInfo,
  GetConfigArtifacts,
  ParsedConfig,
  ParsedVariable,
  RawActionInput,
  SphinxConfigWithAddresses,
} from '@sphinx-labs/core/dist/config/types'
import { parse } from 'semver'
import chain from 'stream-chain'
import parser from 'stream-json'
import { ignore } from 'stream-json/filters/Ignore'
import { pick } from 'stream-json/filters/Pick'
import { streamObject } from 'stream-json/streamers/StreamObject'
import { streamValues } from 'stream-json/streamers/StreamValues'
import { SphinxJsonRpcProvider, networkEnumToName } from '@sphinx-labs/core'
import ora from 'ora'
import {
  ContractArtifact,
  parseFoundryContractArtifact,
  recursivelyConvertResult,
} from '@sphinx-labs/contracts'
import { ConstructorFragment, ethers } from 'ethers'
import { red } from 'chalk'

import {
  FoundryMultiChainDryRun,
  FoundrySingleChainBroadcast,
  FoundrySingleChainDryRun,
  FoundryToml,
} from '../types'
import { simulate } from '../../hardhat/simulate'
import { GetNetworkGasEstimate } from '../../cli/types'

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
export const readContractArtifact = async (
  fullyQualifiedName: string,
  projectRoot: string,
  artifactFolder: string
): Promise<ContractArtifact> => {
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
      return parseFoundryContractArtifact(
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
    return parseFoundryContractArtifact(
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
 * Compile the contracts using Forge.
 *
 * @param force Force re-compile the contracts. This ensures that we're using the most recent
 * artifacts for the user's contracts. This is mostly out of an abundance of caution, since using an
 * incorrect contract artifact will prevent us from creating the correct contract deployment
 * artifact and verifying the contract on Etherscan. It's best to force re-compile as late as
 * possible in commands like the Deploy and Propose CLI commands because recompilation can take a
 * very long time. If recompilation occurs early and the user runs into errors later in the command,
 * they'll spend a lot of time waiting for recompilation to occur each time they run the command.
 * It's fine for recompilation to occur after running the user's Forge script because Foundry
 * automatically compiles the necessary contracts before executing it.
 */
export const compile = (silent: boolean, force: boolean): void => {
  const forgeBuildArgs = ['build']

  if (silent) {
    forgeBuildArgs.push('--silent')
  }
  if (force) {
    forgeBuildArgs.push('--force')
  }

  // We use `spawnSync` to display the compilation process to the user as it occurs. Compiler errors
  // will be displayed to the user even if the `silent` flag is included.
  const { status: compilationStatus } = spawnSync(`forge`, forgeBuildArgs, {
    stdio: 'inherit',
  })
  if (compilationStatus !== 0) {
    process.exit(1)
  }
}

/**
 * Creates a callback for `getConfigArtifacts`, which is a function that maps each contract in the
 * config to its artifact and build info. We use a callback to create a standard interface for the
 * `getConfigArtifacts` function, which may be used by Sphinx's future Hardhat plugin.
 *
 * @dev We do not use this function directly, instead we call it via SphinxContext to facilitate
 * dependency injection.
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
      mkdirSync(cachePath, { recursive: true })
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
      buildInfoFileNames.length === 1 &&
      !cachedNames.includes(buildInfoFileNames[0])
    ) {
      buildInfoCache = {}
    }

    // Remove any files in the cache that no longer exist
    for (const cachedName of cachedNames) {
      if (!buildInfoFileNames.includes(cachedName)) {
        delete buildInfoCache[cachedName]
      }
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
      } else if (!buildInfoCache[file.name]) {
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
        const artifact = await readContractArtifact(
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

              const artifact = await readContractArtifact(
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
      buildInfo.solcLongVersion = formatSolcLongVersion(
        buildInfo.solcLongVersion
      )

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
  artifact: ContractArtifact
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

/**
 * Returns `true` if the given contract init code with constructor args belongs to the given
 * contract artifact, and returns `false` otherwise. There may be a couple differences between this
 * init code (which we'll call the "actual" init code) and the contract artifact's `bytecode` field.
 * We'll need to account for these differences when determining whether the init code belongs to the
 * artifact.
 *
 * These differences are:
 * 1. The actual init code may be appended with ABI-encoded constructor arguments, whereas the
 * artifact's init code is not.
 * 2. If the contract uses libraries, the actual init code contains library addresses, whereas the
 * artifact's init code contains library placeholders. For more info on library placeholders,
 * see: https://docs.soliditylang.org/en/v0.8.23/using-the-compiler.html#library-linking
 *
 * This function does not need to handle immutable variable references because these references only
 * exist in the runtime bytecode and not the init code. This is made clear by the Solidity docs,
 * which only have a `deployedBytecode.immutableReferences` field:
 * https://docs.soliditylang.org/en/v0.8.23/using-the-compiler.html#library-linking
 */
export const isInitCodeMatch = (
  actualInitCodeWithArgs: string,
  artifact: ContractArtifact
): boolean => {
  const coder = ethers.AbiCoder.defaultAbiCoder()
  const iface = new ethers.Interface(artifact.abi)

  const artifactBytecodeLength = getBytesLength(artifact.bytecode)
  const actualInitCodeLength = getBytesLength(actualInitCodeWithArgs)

  // Return `false` if the length of the artifact's init code is greater than the length of the
  // actual init code. It's necessary to explicitly check this because the `ethers.dataSlice` call,
  // which we'll execute soon, reverts with an out-of-bounds error under this condition.
  if (artifactBytecodeLength > actualInitCodeLength) {
    return false
  }

  // Split the actual init code into two parts:
  // 1. The init code without the constructor arguments
  // 2. The ABI encoded constructor arguments
  //
  // We use the length of the `artifact.bytecode` to determine where the contract's creation code
  // ends and the constructor arguments begin. This works even if the `artifact.bytecode` contains
  // externally linked library placeholders, which are always the same length as the real values.
  const actualInitCodeNoArgs = ethers.dataSlice(
    actualInitCodeWithArgs,
    0,
    artifactBytecodeLength
  )
  const encodedArgs = ethers.dataSlice(
    actualInitCodeWithArgs,
    artifactBytecodeLength
  )

  const constructorFragment = iface.fragments.find(
    ConstructorFragment.isFragment
  )
  if (constructorFragment) {
    // ABI-decode the constructor arguments. This will throw an error if the decoding fails.
    try {
      coder.decode(constructorFragment.inputs, encodedArgs)
    } catch {
      return false
    }
  } else if (
    // If there's no constructor fragment, the length of the artifact's init code and the actual
    // init code must match. They must match for contracts without a constructor fragment because
    // the artifact's init code does _not_ include constructor arguments, whereas the actual init
    // code does.
    artifactBytecodeLength !== actualInitCodeLength
  ) {
    return false
  }

  // Replace the library references with zeros in both init codes. In the actual init code, this
  // will replace the actual library addresses. In the artifact's init code, this will replace the
  // library placeholders with zeros.
  const artifactInitCodeNoLibraries = zeroOutLibraryReferences(
    artifact.bytecode,
    artifact.linkReferences
  )
  const actualInitCodeNoLibraries = zeroOutLibraryReferences(
    actualInitCodeNoArgs,
    artifact.linkReferences
  )

  // Check if we've found a match.
  return (
    artifactInitCodeNoLibraries.toLowerCase() ===
    actualInitCodeNoLibraries.toLowerCase()
  )
}

export const getSphinxConfigFromScript = async (
  scriptPath: string,
  sphinxPluginTypesInterface: ethers.Interface,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<SphinxConfigWithAddresses> => {
  const json = await callForgeScriptFunction<{
    0: {
      value: string
    }
  }>(
    scriptPath,
    'sphinxConfigABIEncoded()',
    [],
    undefined,
    targetContract,
    spinner
  )

  const returned = json.returns[0].value
  // ABI decode the gas array.
  const coder = ethers.AbiCoder.defaultAbiCoder()
  const sphinxConfigFragment = findFunctionFragment(
    sphinxPluginTypesInterface,
    'sphinxConfigType'
  )

  const decoded = coder.decode(
    [...sphinxConfigFragment.outputs, 'address', 'address'],
    returned
  )

  const { sphinxConfig } = recursivelyConvertResult(
    sphinxConfigFragment.outputs,
    decoded
  ) as any

  const parsed: SphinxConfigWithAddresses = {
    projectName: sphinxConfig.projectName,
    owners: sortHexStrings(sphinxConfig.owners),
    threshold: sphinxConfig.threshold.toString(),
    orgId: sphinxConfig.orgId,
    testnets: sphinxConfig.testnets.map(networkEnumToName),
    mainnets: sphinxConfig.mainnets.map(networkEnumToName),
    saltNonce: sphinxConfig.saltNonce.toString(),
    safeAddress: decoded[1],
    moduleAddress: decoded[2],
  }

  return parsed
}

type ForgeScriptResponse<T> = {
  logs: Array<string>
  returns: T
}

export const getForgeScriptArgs = (
  scriptPath: string,
  signature: string,
  args: string[],
  forkUrl?: string,
  targetContract?: string,
  silent: boolean = true,
  json: boolean = true,
  broadcast: boolean = false
) => {
  const forgeScriptArgs = [
    'script',
    scriptPath,
    ...(forkUrl ? ['--rpc-url', forkUrl] : []),
    '--sig',
    signature,
    ...args,
  ]

  if (silent) {
    forgeScriptArgs.push('--silent')
  }

  if (json) {
    forgeScriptArgs.push('--json')
  }

  if (broadcast) {
    forgeScriptArgs.push('--broadcast')
  }

  if (targetContract) {
    forgeScriptArgs.push('--target-contract', targetContract)
  }

  return forgeScriptArgs
}

export const callForgeScriptFunction = async <T>(
  scriptPath: string,
  signature: string,
  args: string[],
  forkUrl?: string,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<ForgeScriptResponse<T>> => {
  // First we call without silent or json and detect any failures
  // We have to do this b/c the returned `code` will be 0 even if the script failed.
  // Also the trace isn't output if `--silent` or `--json` is enabled, so we also have
  // to do this to provide a useful trace to the user.
  const testScriptArgs = getForgeScriptArgs(
    scriptPath,
    signature,
    args,
    forkUrl,
    targetContract,
    false,
    false
  )
  const {
    code: testCode,
    stdout: testOut,
    stderr: testErr,
  } = await spawnAsync('forge', testScriptArgs)

  if (testCode !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(testOut)
    // The `stderr` contains the error message.
    console.log(testErr)
    process.exit(1)
  }

  // Then call with silent and json, and parse the result
  const forgeScriptArgs = getForgeScriptArgs(
    scriptPath,
    signature,
    args,
    forkUrl,
    targetContract,
    true,
    true
  )

  const { code, stdout, stderr } = await spawnAsync('forge', forgeScriptArgs)

  // For good measure, we still read the code and error if necessary but this is unlikely to be triggered
  if (code !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  }

  // Attempt to parse the `stdout`. This could fail if the user supplies an invalid Etherscan API
  // key or URL in their `foundry.toml`. In this scenario, Foundry does not throw an error; instead,
  // it writes a message to `stdout` that contains "etherscan: Failed to deserialize response".
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(`Failed to parse Foundry output. Reason:\n${stdout}`)
  }
}

export const getSphinxLeafGasEstimates = async (
  scriptPath: string,
  foundryToml: FoundryToml,
  sphinxPluginTypesInterface: ethers.Interface,
  collected: Array<{
    deploymentInfo: DeploymentInfo
    actionInputs: Array<RawActionInput>
    forkUrl: string
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
  for (const { actionInputs, deploymentInfo, forkUrl } of collected) {
    const txns = actionInputs.map(toSphinxTransaction)
    const encodedTxnArray = coder.encode(leafGasParamsFragment.outputs, [
      txns,
      getSystemContractInfo(),
    ])

    // Write the ABI encoded data to the file system. We'll read it in the Forge script. We do this
    // instead of passing in the data as a parameter to the Forge script because it's possible to hit
    // Node's `spawn` input size limit if the data is large. This is particularly a concern because
    // the data contains contract init code.
    writeFileSync(leafGasInputsFilePath, encodedTxnArray)

    const json = await callForgeScriptFunction<{
      abiEncodedGasArray: {
        value: string
      }
    }>(
      scriptPath,
      'sphinxEstimateMerkleLeafGas(string)',
      [leafGasInputsFilePath, deploymentInfo.chainId],
      forkUrl,
      targetContract,
      spinner
    )

    const returned = json.returns.abiEncodedGasArray.value
    // ABI decode the gas array.
    const [decoded] = coder.decode(['uint256[]'], returned)
    // Convert the BigInt elements to Numbers, then multiply by a buffer. This ensures the user's
    // transaction doesn't fail on-chain due to variations in the chain state, which could occur
    // between the time of the simulation and execution.
    const returnedGasArrayWithBuffer = decoded
      // Convert the BigInt elements to Numbers
      .map(Number)
      // Include a buffer to ensure the user's transaction doesn't fail on-chain due to variations
      // between the simulation and the live execution environment. There are a couple areas in
      // particular that could lead to variations:
      // 1. The on-chain state could vary. For example, existing contracts could have different
      //    state, which could impact the cost of execution. This is inherently a source of
      //    variation because there's a delay between the simulation and execution.
      // 2. Foundry's simulation is treated as a single transaction, which means SLOADs are more
      //    likely to be "warm" (i.e. cheaper) than the production environment, where transactions
      //    may be split between batches. In practice, the execution process uses large batches, so
      //    the variation shouldn't be significant.
      // We chose to multiply the gas by 1.3 because multiplying it by a higher number
      // could make a very large transaction unexecutable on-chain. Since the 1.3x multiplier
      // doesn't impact small transactions very much, we add a constant amount of 20k too.
      .map((gas) => Math.round(gas * 1.3 + 20_000).toString())

    gasEstimatesArray.push(returnedGasArrayWithBuffer)
  }

  return gasEstimatesArray
}

export const isFoundryMultiChainDryRun = (
  dryRun: FoundrySingleChainDryRun | FoundryMultiChainDryRun
): dryRun is FoundryMultiChainDryRun => {
  const multiChainDryRun = dryRun as FoundryMultiChainDryRun
  return (
    Array.isArray(multiChainDryRun.deployments) &&
    !isFoundrySingleChainDryRun(dryRun)
  )
}

export const isFoundrySingleChainDryRun = (
  dryRun: FoundrySingleChainDryRun | FoundryMultiChainDryRun
): dryRun is FoundrySingleChainDryRun => {
  const singleChainDryRun = dryRun as FoundrySingleChainDryRun
  return (
    Array.isArray(singleChainDryRun.transactions) &&
    Array.isArray(singleChainDryRun.receipts) &&
    Array.isArray(singleChainDryRun.libraries)
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

export const findFunctionFragment = (
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

export const convertLibraryFormat = (
  librariesArray: Array<string>
): Array<string> => {
  return librariesArray.map((libraryString) => {
    // Splitting by both ':' and '='
    const parts = libraryString.split(/[:=]/)
    if (parts.length !== 3) {
      throw new Error('Invalid library string format.')
    }

    const [filePath, contractName, address] = parts
    return `${filePath}:${contractName}=${ethers.getAddress(address)}`
  })
}
/**
 * Estimates the gas used by a deployment on a single network. Includes a buffer of 30% to account
 * for variations between the local simulation and the production environment. Also adjusts the
 * minimum gas limit on networks like Arbitrum to include the L1 gas fee, which isn't captured on
 * forks.
 */
export const getEstimatedGas = async (
  receipts: Array<SphinxTransactionReceipt>,
  provider: SphinxJsonRpcProvider
): Promise<string> => {
  // Estimate the minimum gas limit. On Ethereum, this will be 21k. (Technically, since
  // `eth_estimateGas` generally overestimates the gas used, it will be slightly greater than 21k.
  // It was 21001 during development). On Arbitrum and perhaps other L2s, the minimum gas limit will
  // be closer to one million. This is because each transaction includes the L1 gas used. The local
  // simulation that produced the transaction receipts doesn't capture this difference. We account
  // for this difference by adding `estimatedMinGasLimit - 21_000` to each receipt. This provides a
  // more accurate estimate on networks like Arbitrum.
  const estimatedMinGasLimit = await provider.estimateGas({
    to: ethers.ZeroAddress,
    data: '0x',
  })
  const adjustedGasLimit = Number(estimatedMinGasLimit) - 21_000

  const estimatedGas = receipts
    .map((receipt) => receipt.gasUsed)
    .map(Number)
    .map((gasUsed) => Math.round(gasUsed * 1.3))
    .map((gasWithBuffer) => {
      // Add the adjusted gas limit amount. We add this after multiplying by the 1.3x buffer because
      // the estimated minimum gas limit already includes a ~1.35x buffer due to the fact that the
      // `eth_estimateGas` RPC method overestimates the gas. ref:
      // https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_estimategas
      const totalGas = gasWithBuffer + adjustedGasLimit
      // Check that the total gas isn't negative out of an abundance of caution.
      if (totalGas < 0) {
        throw new Error('Gas used is less than 0. Should never happen.')
      }
      return totalGas
    })
    .reduce((a, b) => a + b, 0)

  return estimatedGas.toString()
}

export const getNetworkGasEstimate: GetNetworkGasEstimate = async (
  parsedConfigArray: Array<ParsedConfig>,
  chainId: string,
  foundryToml: FoundryToml
): Promise<{
  chainId: number
  estimatedGas: string
}> => {
  const networkName = getNetworkNameForChainId(BigInt(chainId))
  const rpcUrl = foundryToml.rpcEndpoints[networkName]

  if (!rpcUrl) {
    console.error(
      red(
        `No RPC endpoint specified in your foundry.toml for the network: ${networkName}.`
      )
    )
    process.exit(1)
  }

  const { receipts } = await simulate(parsedConfigArray, chainId, rpcUrl)

  const provider = new SphinxJsonRpcProvider(rpcUrl)
  const estimatedGas = await getEstimatedGas(receipts, provider)

  return {
    chainId: Number(chainId),
    estimatedGas,
  }
}

/**
 * Recursively replaces environment variable placeholders in the input with their actual values.
 * This function does not mutate the original object.
 */
export const replaceEnvVariables = (input: ParsedVariable): any => {
  // Regular expression to match environment variables in the form ${VAR_NAME}
  const envVarRegex = /\$\{((\w|\s)+)\}/g

  // Function to replace environment variables in a string with their values
  const replaceEnvVar = (str: string): string => {
    // Trim whitespace and then replace environment variables
    return str.trim().replace(envVarRegex, (_, envVar) => {
      return process.env[envVar.trim()] || ''
    })
  }

  if (typeof input === 'string') {
    // If the input is a string, replace environment variables in it
    return replaceEnvVar(input)
  } else if (Array.isArray(input)) {
    // If the input is an array, recursively process each element
    return input.map((element) => replaceEnvVariables(element))
  } else if (typeof input === 'object' && input !== null) {
    // If the input is an object, recursively process each property
    const result: { [key: string]: ParsedVariable } = {}
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        result[key] = replaceEnvVariables(input[key])
      }
    }
    return result
  } else {
    // For booleans and numbers, return as is
    return input
  }
}
