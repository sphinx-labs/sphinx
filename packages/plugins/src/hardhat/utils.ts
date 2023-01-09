import path from 'path'

import {
  ParsedChugSplashConfig,
  getChugSplashManagerProxyAddress,
  getChugSplashRegistry,
  parseChugSplashConfig,
  writeSnapshotId,
} from '@chugsplash/core'
import { Signer } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import {
  ParsedConfigVariables,
  StorageSlotPair,
  padHexSlotValue,
  decodeVariable,
  StorageSlotMapping,
  getSolcVersionFromSolcLongVersion,
  UserChugSplashConfig,
  ParsedContractConfig,
  getChugSplashRegistryReadOnly,
  chugsplashFetchSubtask,
  computeStorageSlots,
  SolidityStorageLayout,
  CompilerOutput,
  convertNumbersToStrings,
  mapVarNameToStorageObj,
  errorConfigVarNotInContract,
  CanonicalChugSplashConfig,
} from '@chugsplash/core'
import { Contract, ethers, providers, Signer, utils } from 'ethers'
import { compile, compileRemoteBundle } from '@chugsplash/executor'
import { add0x } from '@eth-optimism/core-utils'
import { HardhatConfig, HardhatRuntimeEnvironment } from 'hardhat/types'
import { ChugSplashManagerABI } from '@chugsplash/contracts'

export const writeHardhatSnapshotId = async (
  hre: HardhatRuntimeEnvironment,
  networkName?: string
) => {
  const inferredNetworkName =
    hre.network.name === 'localhost' ? 'localhost' : 'hardhat'
  await writeSnapshotId(
    networkName === undefined ? inferredNetworkName : networkName,
    hre.config.paths.deployments,
    await hre.network.provider.send('evm_snapshot', [])
  )
}

/**
 * Loads a ChugSplash config file synchronously.
 *
 * @param configPath Path to the ChugSplash config file.
 */
export const loadParsedChugSplashConfig = (
  configPath: string
): ParsedChugSplashConfig => {
  const userConfig = loadUserChugSplashConfig(configPath)
  return parseChugSplashConfig(userConfig)
}

export const loadUserChugSplashConfig = (
  configPath: string
): UserChugSplashConfig => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let config = require(path.resolve(configPath))
  config = config.default || config
  return config
}

export const isProjectRegistered = async (
  signer: Signer,
  projectName: string
) => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)
  const chugsplashManagerAddress = getChugSplashManagerProxyAddress(projectName)
  const isRegistered: boolean = await ChugSplashRegistry.managers(
    chugsplashManagerAddress
  )
  return isRegistered
}

export const getDeployedContractConfig = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<ParsedContractConfig> => {
  const canonicalConfig = await getLatestDeployedCanonicalConfig(
    provider,
    proxyAddress
  )
  return {
    contract: 'TODO',
    proxy: ethers.constants.AddressZero,
  }

  // const configSlotAry = computeStorageSlots(
  //   storageLayout,
  //   contractConfig,
  //   immutableVariableNames
  // )

  // const deployedStorageSlotMapping = await getDeployedStorageSlotMapping(
  //   provider,
  //   proxyAddress,
  //   configSlotAry.map((slot) => slot.key)
  // )

  // const varNameToStorageObjMapping = mapVarNameToStorageObj(
  //   storageLayout.storage,
  //   contractConfig
  // )

  // const variables: ParsedConfigVariables = {}
  // for (const [varName, variable] of Object.entries(contractConfig.variables)) {
  //   if (immutableVariableNames.includes(varName)) {
  //     // TODO: handle immutables
  //     continue
  //   }

  //   // Get the storage object that corresponds to this variable name.
  //   const storageObj = varNameToStorageObjMapping[varName]

  //   // Throw an error if attempting to set a variable that exists in the ChugSplash config but
  //   // doesn't exist in the storage layout.
  //   if (!storageObj) {
  //     errorConfigVarNotInContract(varName, contractConfig.contract)
  //   }

  //   variables[varName] = await decodeVariable(
  //     provider,
  //     proxyAddress,
  //     deployedStorageSlotMapping,
  //     storageObj,
  //     storageLayout.types,
  //     '0',
  //     variable
  //   )
  // }

  // return {
  //   contract: 'TODO',
  //   proxy: proxyAddress,
  //   variables: { ...variables }, // TODO: add immutables
  // }
}

export const getLatestDeployedCanonicalConfig = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<CanonicalChugSplashConfig> => {
  const ChugSplashRegistry = getChugSplashRegistryReadOnly(provider)

  const registryEvents = await ChugSplashRegistry.queryFilter(
    ChugSplashRegistry.filters.EventAnnouncedWithData(
      'ChugSplashActionExecuted',
      null,
      proxyAddress
    )
  )

  if (registryEvents.length === 0) {
    throw new Error(`No contract config detected for proxy: ${proxyAddress}`)
  }

  const latestRegistryEvent = registryEvents.at(-1)

  const ChugSplashManager = new Contract(
    latestRegistryEvent.args.manager,
    ChugSplashManagerABI,
    provider
  )

  const latestExecutionEvent = (
    await ChugSplashManager.queryFilter(
      ChugSplashManager.filters.ChugSplashActionExecuted(null, proxyAddress)
    )
  ).at(-1)

  const latestProposalEvent = (
    await ChugSplashManager.queryFilter(
      ChugSplashManager.filters.ChugSplashBundleProposed(
        latestExecutionEvent.args.bundleId
      )
    )
  ).at(-1)

  const canonicalConfig = await chugsplashFetchSubtask({
    configUri: latestProposalEvent.args.configUri,
  })
  return canonicalConfig
}

export const getDeployedContractConfigUsingArtifact = async (
  provider: providers.Provider,
  deploymentArtifact: any, // TODO: deployment artifact type
  proxyAddress: string
): Promise<ParsedContractConfig> => {
  const slotKeys = deploymentArtifact.storageLayout.storage.map((storageObj) =>
    padHexSlotValue(storageObj.slot, 0)
  )

  const deployedStorageSlotMapping = await getDeployedStorageSlotMapping(
    provider,
    proxyAddress,
    slotKeys
  )

  const variables: ParsedConfigVariables = {}
  for (const storageObj of deploymentArtifact.storageLayout.storage) {
    variables[storageObj.label] = await decodeVariable(
      provider,
      proxyAddress,
      deployedStorageSlotMapping,
      storageObj,
      deploymentArtifact.storageLayout.types,
      '0'
    )
  }

  const artifactMetadata =
    typeof deploymentArtifact.metadata === 'string'
      ? JSON.parse(deploymentArtifact.metadata)
      : deploymentArtifact.metadata

  const { language, sources, settings } = artifactMetadata

  Object.values(sources).forEach((source) => {
    delete (source as any).license
  })

  const { optimizer, evmVersion, libraries, metadata } = settings
  const compilerOutput = await compile(
    {
      language,
      sources,
      settings: {
        optimizer,
        evmVersion,
        outputSelection: {
          '*': {
            '*': [
              'storageLayout',
              'abi',
              'evm.bytecode',
              'evm.deployedBytecode',
              'evm.methodIdentifiers',
              'metadata',
            ],
            '': ['ast'],
          },
        },
        libraries,
        metadata,
      },
    },
    getSolcVersionFromSolcLongVersion(artifactMetadata.compiler.version)
  )

  const compilationTarget = artifactMetadata.settings.compilationTarget
  if (Object.keys(compilationTarget).length > 1) {
    throw new Error(
      `Found more than one compilation target for: ${
        deploymentArtifact.contractName
      }. Please report this error.
Compilation targets:
${Object.keys(compilationTarget)}`
    )
  }

  const [sourceName] = Object.keys(compilationTarget)
  const contractName = compilationTarget[sourceName]
  const immutableVariables = getImmutableVariables(
    compilerOutput,
    deploymentArtifact.deployedBytecode,
    sourceName,
    contractName
  )

  return {
    contract: contractName,
    proxy: proxyAddress,
    variables: { ...variables, ...immutableVariables },
  }
}

// TODO: refactor this with `getImmutableVariableNames`?
export const getImmutableVariables = (
  compilerOutput: CompilerOutput,
  deployedBytecode: string,
  sourceName: string,
  contractName: string
): ParsedConfigVariables => {
  const immutableReferences =
    compilerOutput.contracts[sourceName][contractName].evm.deployedBytecode
      .immutableReferences

  const immutableVariables: ParsedConfigVariables = {}
  for (const source of Object.values(compilerOutput.sources)) {
    for (const contractNode of (source as any).ast.nodes) {
      if (
        contractNode.nodeType === 'ContractDefinition' &&
        contractNode.nodes !== undefined
      ) {
        for (const node of contractNode.nodes) {
          if (
            node.nodeType === 'VariableDeclaration' &&
            node.mutability === 'immutable' &&
            Object.keys(immutableReferences).includes(node.id.toString(10))
          ) {
            const [{ length, start }] = immutableReferences[node.id]
            const rawValue = deployedBytecode.slice(
              2 + 2 * start,
              2 + 2 * (start + length)
            )
            const [decodedValue] = utils.defaultAbiCoder.decode(
              [node.typeDescriptions.typeString],
              add0x(rawValue)
            )
            immutableVariables[node.name] =
              convertNumbersToStrings(decodedValue)
          }
        }
      }
    }
  }

  return immutableVariables
}

export const validateHardhatConfig = (hardhatConfig: HardhatConfig) => {
  const hardhatConfigExtName = path.extname(hardhatConfig.paths.configFile)
  const isTypeScriptProject = hardhatConfigExtName === '.ts'

  const configSetupInstructions = `Follow the instructions here: ${
    isTypeScriptProject
      ? 'https://github.com/chugsplash/chugsplash/blob/develop/docs/setup-project.md#setup-chugsplash-using-typescript'
      : 'https://github.com/chugsplash/chugsplash/blob/develop/docs/setup-project.md#setup-chugsplash-using-javascript'
  }`

  hardhatConfig.solidity.compilers.forEach((compiler) => {
    // Check that each compiler setting has the 'outputSelection' option included.
    if (
      !compiler.settings.outputSelection?.['*']?.['*'].includes('storageLayout')
    ) {
      throw new Error(`You must include the 'outputSelection' setting in your hardhat.config${hardhatConfigExtName} file for
the compiler with Solidity version: ${compiler.version}.
${configSetupInstructions}`)
    }

    // Check that each compiler setting has `useLiteralContent` to `true`.
    if (compiler.settings.metadata?.useLiteralContent !== true) {
      throw new Error(`You must set the 'useLiteralContent' setting to 'true' in your hardhat.config${hardhatConfigExtName} file for
the compiler with Solidity version: ${compiler.version}
${configSetupInstructions}`)
    }
  })
}

export const getDeployedStorageSlotMapping = async (
  provider: providers.Provider,
  proxyAddress: string,
  slotKeys: string[]
): Promise<StorageSlotMapping> => {
  const storageSlotAry = await Promise.all(
    slotKeys.map(async (slotKey): Promise<StorageSlotPair> => {
      return {
        key: slotKey,
        val: await provider.getStorageAt(proxyAddress, slotKey),
      }
    })
  )

  const storageSlotMapping: StorageSlotMapping = {}
  storageSlotAry.forEach((slot) => {
    storageSlotMapping[slot.key] = slot.val
  })
  return storageSlotMapping
}
