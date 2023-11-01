import * as fs from 'fs'
import path, { join } from 'path'
import { promisify } from 'util'

import {
  BuildInfo,
  ContractArtifact,
} from '@sphinx-labs/core/dist/languages/solidity/types'
import {
  parseFoundryArtifact,
  execAsync,
  getNetworkNameForChainId,
  isRawDeployContractActionInput,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import {
  ConfigArtifacts,
  DeploymentInfo,
  GetConfigArtifacts,
  GetProviderForChainId,
  ParsedConfig,
  RawActionInput,
} from '@sphinx-labs/core/dist/config/types'
import { parse } from 'semver'
import chain from 'stream-chain'
import parser from 'stream-json'
import { ignore } from 'stream-json/filters/Ignore'
import { pick } from 'stream-json/filters/Pick'
import { streamObject } from 'stream-json/streamers/StreamObject'
import { streamValues } from 'stream-json/streamers/StreamValues'
import {
  AuthLeaf,
  SupportedNetworkName,
  getAuthLeafsForChain,
  getProjectBundleInfo,
  makeAuthBundle,
  networkEnumToName,
} from '@sphinx-labs/core'
import ora from 'ora'

import { BundleInfo } from '../types'

const readFileAsync = promisify(fs.readFile)

export const streamFullyQualifiedNames = async (filePath: string) => {
  const pipeline = new chain([
    fs.createReadStream(filePath),
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
    fs.createReadStream(filePath),
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

export const getContractArtifact = async (
  fullyQualifiedName: string,
  artifactFolder: string
): Promise<ContractArtifact> => {
  // The basename will be in the format `SomeFile.sol:MyContract`.
  const basename = path.basename(fullyQualifiedName)

  const [sourceName, contractName] = basename.split(':')
  const artifactPath = join(artifactFolder, sourceName, `${contractName}.json`)
  if (!fs.existsSync(artifactPath)) {
    throw new Error(messageArtifactNotFound(fullyQualifiedName))
  }
  return parseFoundryArtifact(
    JSON.parse(await readFileAsync(artifactPath, 'utf8'))
  )
}

/**
 * Creates a callback for `getProviderFromChainId`, which is a function that returns a provider
 * object for a given chain ID. We use a callback to create a standard interface for the
 * `getProviderFromChainId` function, which has a different implementation in Hardhat and Foundry.
 *
 * @param rpcEndpoints A map of chain aliases to RPC urls.
 * @returns The provider object that corresponds to the chain ID.
 */
export const makeGetProviderFromChainId = async (rpcEndpoints: {
  [chainAlias: string]: string
}): Promise<GetProviderForChainId> => {
  const urls = Object.values(rpcEndpoints)
  const networks = await Promise.all(
    urls.map(async (url) => {
      const provider = new SphinxJsonRpcProvider(url)
      try {
        // We put this RPC call in a try/catch because it may not be possible to connect to some of
        // the RPC endpoints in the foundry.toml file. For example, the user may have a local RPC
        // endpoint that is not currently running.
        const { chainId, name: networkName } = await provider.getNetwork()
        return { chainId: Number(chainId), url, networkName }
      } catch (err) {
        undefined
      }
    })
  )

  return (chainId: number): SphinxJsonRpcProvider => {
    const network = networks.find((n) => n && n.chainId === chainId)
    if (network === undefined) {
      throw new Error(
        `Could not find an RPC endpoint in your foundry.toml for the network: ${getNetworkNameForChainId(
          BigInt(chainId)
        )}.`
      )
    }

    return new SphinxJsonRpcProvider(network.url)
  }
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
      if (isRawDeployContractActionInput(rawInput)) {
        fullyQualifiedNamesSet.add(rawInput.fullyQualifiedName)
      } else if (typeof rawInput.contractName === 'string') {
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
 * TODO: Reduce the memory footprint of this function by using a stream parser to read in the build
 * info files and only actually store the parts of the build info files which are really necessary.
 * This is important for making sure we do not run out of memory loading the build info files of large
 * projects.
 *
 * Creates a callback for `getConfigArtifacts`, which is a function that maps each contract in the
 * config to its artifact and build info. We use a callback to create a standard interface for the
 * `getConfigArtifacts` function, which has a separate implementation for the Hardhat and Foundry
 * plugin.
 */
export const makeGetConfigArtifacts = (
  artifactFolder: string,
  buildInfoFolder: string,
  cachePath: string
): GetConfigArtifacts => {
  return async (
    fullyQualifiedNames: Array<string>,
    contractNames: Array<string>
  ) => {
    // Check if the cache directory exists, and create it if not
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath)
    }

    const buildInfoCacheFilePath = join(cachePath, 'sphinx-cache.json')
    // We keep track of the last modified time in each build info file so we can easily find the most recently generated build info files
    // We also keep track of all the contract files output by each build info file, so we can easily look up the required file for each contract artifact
    let buildInfoCache: Record<
      string,
      {
        name: string
        time: number
        contracts: string[]
      }
    > = fs.existsSync(buildInfoCacheFilePath)
      ? JSON.parse(fs.readFileSync(buildInfoCacheFilePath, 'utf8'))
      : {}

    const buildInfoPath = join(buildInfoFolder)

    // Find all the build info files and their last modified time
    const buildInfoFileNames = fs
      .readdirSync(buildInfoPath)
      .filter((fileName) => {
        return fileName.endsWith('.json')
      })

    const cachedNames = Object.keys(buildInfoCache)
    // If there is only one build info file and it is not in the cache,
    // then clear the cache b/c the user must have force recompiled
    if (
      buildInfoFileNames.length === 1 ||
      (!cachedNames.includes(buildInfoFileNames[0]) &&
        // handles an edge case where the user made a change and then reverted it and force recompiled
        // TODO(ryan): What's the purpose of `buildInfoFileNames.length > 1`? It seems like it'll
        // always be false because we already check that `buildInfoFileNames.length === 1`.
        buildInfoFileNames.length > 1)
    ) {
      buildInfoCache = {}
    }

    const buildInfoFileNamesWithTime = buildInfoFileNames
      .map((fileName) => ({
        name: fileName,
        time: fs.statSync(path.join(buildInfoPath, fileName)).mtime.getTime(),
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
        const outputContracts = await streamFullyQualifiedNames(
          join(buildInfoFolder, file.name)
        )

        // Update the build info file dictionary in the cache
        buildInfoCache[file.name] = {
          name: file.name,
          time: file.time,
          contracts: outputContracts,
        }
      }
    }

    // Just make sure the files are sorted by time
    const sortedCachedFiles = Object.values(buildInfoCache).sort(
      (a, b) => b.time - a.time
    )

    // Look through the cache, read all the contract artifacts, and find all of the required build
    // info files names. We get the artifacts for every action, even if it'll be skipped, because the
    // artifact is necessary when we're creating the preview, which includes skipped actions.
    const toReadFiles: string[] = []
    const localBuildInfoCache = {}

    const fullyQualifiedNamePromises = fullyQualifiedNames.map(
      async (fullyQualifiedName) => {
        const artifact = await getContractArtifact(
          fullyQualifiedName,
          artifactFolder
        )

        // Look through the cache for the first build info file that contains the contract
        for (const file of sortedCachedFiles) {
          if (file.contracts?.includes(fullyQualifiedName)) {
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
        if (fs.existsSync(buildInfoCacheFilePath)) {
          fs.unlinkSync(buildInfoCacheFilePath)
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
          for (const fullyQualifiedName of cachedFile.contracts) {
            const contractName = fullyQualifiedName.split(':')[1]
            if (contractName === targetContractName) {
              // Keep track of whether or not we need to read the build info file later
              if (!toReadFiles.includes(cachedFile.name)) {
                toReadFiles.push(cachedFile.name)
              }

              const artifact = await getContractArtifact(
                fullyQualifiedName,
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
        if (fs.existsSync(buildInfoCacheFilePath)) {
          fs.unlinkSync(buildInfoCacheFilePath)
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
        if (!fs.existsSync(fullFilePath)) {
          if (fs.existsSync(buildInfoCacheFilePath)) {
            fs.unlinkSync(buildInfoCacheFilePath)
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
    fs.writeFileSync(
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

export const getBundleInfoArray = async (
  configArtifacts: ConfigArtifacts,
  parsedConfigArray: Array<ParsedConfig>
): Promise<{
  authRoot: string
  bundleInfoArray: Array<BundleInfo>
}> => {
  const allAuthLeafs: Array<AuthLeaf> = []
  for (const parsedConfig of parsedConfigArray) {
    const authLeafsForChain = await getAuthLeafsForChain(
      parsedConfig,
      configArtifacts
    )
    allAuthLeafs.push(...authLeafsForChain)
  }

  const authBundle = makeAuthBundle(allAuthLeafs)

  const bundleInfoArray: Array<BundleInfo> = []
  for (const parsedConfig of parsedConfigArray) {
    const networkName = getNetworkNameForChainId(BigInt(parsedConfig.chainId))

    const authLeafsForChain = authBundle.leafs.filter(
      (l) => l.leaf.chainId === BigInt(parsedConfig.chainId)
    )

    const { configUri, bundles, compilerConfig, humanReadableActions } =
      await getProjectBundleInfo(parsedConfig, configArtifacts)

    bundleInfoArray.push({
      configUri,
      networkName,
      authLeafs: authLeafsForChain,
      actionBundle: bundles.actionBundle,
      targetBundle: bundles.targetBundle,
      humanReadableActions,
      compilerConfig,
    })
  }

  return {
    bundleInfoArray,
    authRoot: authBundle.root,
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

export const getSphinxConfigNetworksFromScript = async (
  scriptPath: string,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<{
  testnets: Array<SupportedNetworkName>
  mainnets: Array<SupportedNetworkName>
}> => {
  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxConfigNetworks()',
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

  const returned = JSON.parse(stdout).returns

  const testnetEnums = JSON.parse(returned['0'].value).map((e) => BigInt(e))
  const mainnetEnums = JSON.parse(returned['1'].value).map((e) => BigInt(e))

  return {
    testnets: testnetEnums.map(networkEnumToName),
    mainnets: mainnetEnums.map(networkEnumToName),
  }
}

export const getSphinxManagerAddressFromScript = async (
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
    'sphinxManager()',
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

  const managerAddress = json.returns[0].value

  return managerAddress
}
