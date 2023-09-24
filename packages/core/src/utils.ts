import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'
import { exec } from 'child_process'

import yesno from 'yesno'
import axios from 'axios'
import ora from 'ora'
import * as semver from 'semver'
import {
  Signer,
  Contract,
  ethers,
  Fragment,
  AbiCoder,
  Provider,
  JsonRpcSigner,
  ConstructorFragment,
} from 'ethers'
import {
  ProxyArtifact,
  SphinxRegistryABI,
  SphinxManagerABI,
  ProxyABI,
  AuthFactoryABI,
} from '@sphinx-labs/contracts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import chalk from 'chalk'
import { ProxyDeployment } from '@openzeppelin/upgrades-core'
import {
  ParsedTypeDetailed,
  StorageItem,
} from '@openzeppelin/upgrades-core/dist/storage/layout'
import {
  StorageField,
  StorageLayoutComparator,
  stripContractSubstrings,
} from '@openzeppelin/upgrades-core/dist/storage/compare'
import { HttpNetworkConfig, NetworkConfig, SolcBuild } from 'hardhat/types'
import { Compiler, NativeCompiler } from 'hardhat/internal/solidity/compiler'

import {
  CompilerConfig,
  UserContractKind,
  userContractKinds,
  ContractKind,
  ParsedConfigVariables,
  ParsedConfigVariable,
  ConfigArtifacts,
  CanonicalConfig,
  UserConstructorArgOverride,
  UserArgOverride,
  UserFunctionArgOverride,
  UserConfigVariable,
  UserCallAction,
  UserFunctionOptions,
  ExtendedDeployContractTODO,
  ExtendedFunctionCallTODO,
  ChainInfo,
  ParsedConfig,
  FunctionCallTODO,
  DecodedAction,
  DeployContractTODO,
} from './config/types'
import {
  SphinxActionBundle,
  SphinxActionType,
  SphinxBundles,
  DeploymentState,
  IPFSCommitResponse,
  ProposalRequest,
} from './actions/types'
import { Integration } from './constants'
import { SphinxJsonRpcProvider } from './provider'
import { AUTH_FACTORY_ADDRESS, getSphinxRegistryAddress } from './addresses'
import 'core-js/features/array/at'
import {
  BuildInfo,
  CompilerOutput,
  ContractArtifact,
} from './languages/solidity/types'
import { sphinxFetchSubtask } from './config/fetch'
import { getSolcBuild } from './languages'
import {
  fromRawSphinxAction,
  fromRawSphinxActionTODO,
  getDeployContractActions,
  isSetStorageAction,
} from './actions/bundle'
import { getCreate3Address, getTargetSalt } from './config/utils'
import {
  SUPPORTED_LOCAL_NETWORKS,
  SUPPORTED_NETWORKS,
  SupportedChainId,
  SupportedNetworkName,
} from './networks'

export const getDeploymentId = (
  bundles: SphinxBundles,
  configUri: string
): string => {
  const actionRoot = bundles.actionBundle.root
  const targetRoot = bundles.targetBundle.root
  const numTargets = bundles.targetBundle.targets.length

  const numTotalActions = bundles.actionBundle.actions.length
  const numSetStorageActions = bundles.actionBundle.actions
    .map((action) => fromRawSphinxAction(action.action))
    .filter(isSetStorageAction).length
  const numInitialActions = numTotalActions - numSetStorageActions

  return ethers.keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'string'],
      [
        actionRoot,
        targetRoot,
        numInitialActions,
        numSetStorageActions,
        numTargets,
        configUri,
      ]
    )
  )
}

export const writeSnapshotId = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  networkDirName: string,
  deploymentFolderPath: string
) => {
  const snapshotId = await provider.send('evm_snapshot', [])
  const networkPath = path.join(deploymentFolderPath, networkDirName)
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }
  const snapshotIdPath = path.join(networkPath, '.snapshotId')
  fs.writeFileSync(snapshotIdPath, snapshotId)
}

export const writeDeploymentFolderForNetwork = (
  networkDirName: string,
  deploymentFolderPath: string
) => {
  const networkPath = path.join(deploymentFolderPath, networkDirName)
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }
}

export const writeDeploymentArtifact = (
  networkDirName: string,
  deploymentFolderPath: string,
  artifact: any,
  referenceName: string
) => {
  const artifactPath = path.join(
    deploymentFolderPath,
    networkDirName,
    `${referenceName}.json`
  )
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, '\t'))
}

export const getDefaultProxyInitCode = (managerAddress: string): string => {
  const bytecode = ProxyArtifact.bytecode
  const iface = new ethers.Interface(ProxyABI)

  const initCode = bytecode.concat(
    remove0x(iface.encodeDeploy([managerAddress]))
  )

  return initCode
}

/**
 * Finalizes the registration of a project.
 *
 * @param Provider Provider corresponding to the signer that will execute the transaction.
 * @param ownerAddress Owner of the SphinxManager contract deployed by this call.
 */
export const registerOwner = async (
  projectName: string,
  registryAddress: string,
  managerAddress: string,
  ownerAddress: string,
  signer: Signer,
  spinner: ora.Ora
): Promise<void> => {
  spinner.start(`Registering the project...`)

  const registry = new Contract(registryAddress, SphinxRegistryABI, signer)
  const manager = new Contract(managerAddress, SphinxManagerABI, signer)

  if (!(await registry.isManagerDeployed(managerAddress))) {
    await (
      await registry.register(
        ownerAddress,
        projectName,
        '0x', // We don't pass any extra initializer data to this version of the SphinxManager.
        await getGasPriceOverrides(signer)
      )
    ).wait()
    spinner.succeed(`Project registered.`)
  } else {
    const existingOwnerAddress = await manager.owner()
    if (existingOwnerAddress !== ownerAddress) {
      throw new Error(`Project already owned by: ${existingOwnerAddress}.`)
    } else {
      spinner.succeed(`Project was already registered by the caller.`)
    }
  }
}

export const getSphinxRegistry = (signer: Signer): Contract => {
  return new Contract(getSphinxRegistryAddress(), SphinxRegistryABI, signer)
}

export const getSphinxRegistryReadOnly = (provider: Provider): Contract => {
  return new Contract(getSphinxRegistryAddress(), SphinxRegistryABI, provider)
}

export const getSphinxManager = (manager: string, signer: Signer): Contract => {
  return new Contract(manager, SphinxManagerABI, signer)
}

export const getSphinxManagerReadOnly = (
  manager: string,
  provider: Provider
): Contract => {
  return new Contract(manager, SphinxManagerABI, provider)
}

export const sphinxLog = (
  logLevel: 'warning' | 'error' = 'warning',
  title: string,
  lines: string[],
  silent: boolean,
  stream: NodeJS.WritableStream
): void => {
  if (silent) {
    return
  }

  const log = createSphinxLog(logLevel, title, lines)

  stream.write(log)
}

export const createSphinxLog = (
  logLevel: 'warning' | 'error' = 'warning',
  title: string,
  lines: string[]
): string => {
  const prefix = logLevel.charAt(0).toUpperCase() + logLevel.slice(1)

  const chalkColor = logLevel === 'warning' ? chalk.yellow : chalk.red

  const parts = ['\n' + chalkColor.bold(prefix + ':') + ' ' + title]

  if (lines.length > 0) {
    parts.push(lines.map((l) => l + '\n').join(''))
  }

  return parts.join('\n') + '\n'
}

export const getProxyAt = (signer: Signer, proxyAddress: string): Contract => {
  return new Contract(proxyAddress, ProxyABI, signer)
}

export const getCurrentSphinxActionType = (
  bundle: SphinxActionBundle,
  actionsExecuted: bigint
): bigint => {
  return bundle.actions[Number(actionsExecuted)].action.actionType
}

export const isContractDeployed = async (
  address: string,
  provider: Provider
): Promise<boolean> => {
  return (await provider.getCode(address)) !== '0x'
}

export const formatEther = (amount: bigint, decimals: number): string => {
  return parseFloat(ethers.formatEther(amount)).toFixed(decimals)
}

export const readCompilerConfig = async (
  compilerConfigFolderPath: string,
  configUri: string
): Promise<CompilerConfig | undefined> => {
  const ipfsHash = configUri.replace('ipfs://', '')

  // Check that the file containing the canonical config exists.
  const configFilePath = path.join(compilerConfigFolderPath, `${ipfsHash}.json`)
  if (!fs.existsSync(configFilePath)) {
    return undefined
  }

  return JSON.parse(fs.readFileSync(configFilePath, 'utf8'))
}

export const writeCompilerConfig = (
  compilerConfigDirPath: string,
  configUri: string,
  compilerConfig: CompilerConfig
) => {
  const ipfsHash = configUri.replace('ipfs://', '')

  // Create the compiler config network folder if it doesn't already exist.
  if (!fs.existsSync(compilerConfigDirPath)) {
    fs.mkdirSync(compilerConfigDirPath, { recursive: true })
  }

  // Write the compiler config to the local file system. It will exist in a JSON file that has the
  // config URI as its name.
  const compilerConfigFilePath = path.join(
    compilerConfigDirPath,
    `${ipfsHash}.json`
  )
  if (!fs.existsSync(compilerConfigFilePath)) {
    // TODO(docs)
    const convertedBigInts = convertBigIntToString(compilerConfig)
    fs.writeFileSync(
      path.join(compilerConfigDirPath, `${ipfsHash}.json`),
      JSON.stringify(convertedBigInts, null, 2)
    )
  }
}

export const getEIP1967ProxyImplementationAddress = async (
  provider: Provider,
  proxyAddress: string
): Promise<string> => {
  // keccak256('eip1967.proxy.implementation')) - 1
  // See: https://eips.ethereum.org/EIPS/eip-1967#specification
  const implStorageKey =
    '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

  const encodedImplAddress = await provider.getStorage(
    proxyAddress,
    implStorageKey
  )
  const [decoded] = AbiCoder.defaultAbiCoder().decode(
    ['address'],
    encodedImplAddress
  )
  return decoded
}

export const getEIP1967ProxyAdminAddress = async (
  provider: Provider,
  proxyAddress: string
): Promise<string> => {
  // See: https://eips.ethereum.org/EIPS/eip-1967#specification
  const ownerStorageKey =
    '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

  const [ownerAddress] = AbiCoder.defaultAbiCoder().decode(
    ['address'],
    await provider.getStorage(proxyAddress, ownerStorageKey)
  )
  return ownerAddress
}

/**
 * Overrides an object's gas price settings to support EIP-1559 transactions if EIP-1559 is
 * supported by the network. This only overrides the default behavior on Goerli, where transactions
 * sent via Alchemy or Infura do not yet support EIP-1559 gas pricing, despite the fact that
 * `maxFeePerGas` and `maxPriorityFeePerGas` are defined.
 *
 * @param provider Provider object.
 * @param overridden The object whose gas price settings will be overridden.
 * @returns The object whose gas price settings will be overridden.
 */
export const getGasPriceOverrides = async (
  signer: ethers.Signer,
  overridden: ethers.TransactionRequest = {}
): Promise<ethers.TransactionRequest> => {
  if (!signer.provider) {
    throw new Error(
      'Signer must be connected to a provider in order to get gas price overrides.'
    )
  }

  const feeData = await signer.provider!.getFeeData()

  const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } = feeData

  const chainId = Number((await signer.provider!.getNetwork()).chainId)

  switch (chainId) {
    // Overrides the gasPrice for Fantom Opera
    case 250:
      if (gasPrice !== null) {
        overridden.gasPrice = gasPrice
        return overridden
      }
    // Do not do anything for polygon zkevm and it's testnet
    case 1101 || 1442:
      return overridden
    // On linea and its testnet, just override the gasPrice
    case 59144 || 59140:
      if (gasPrice !== null) {
        overridden.gasPrice = gasPrice
        return overridden
      }
    // On Polygon POS, override the maxPriorityFeePerGas using the max fee
    case 137:
      if (maxFeePerGas !== null && maxPriorityFeePerGas !== null) {
        overridden.maxFeePerGas = maxFeePerGas
        overridden.maxPriorityFeePerGas = maxFeePerGas.toString()
      }
      return overridden
    // On mumbai, specify the nonce manually to override pending txs
    case 80001:
      overridden.nonce = await signer.provider.getTransactionCount(
        await signer.getAddress(),
        'latest'
      )
      return overridden
    // Default to overriding with maxFeePerGas and maxPriorityFeePerGas
    default:
      if (maxFeePerGas !== null && maxPriorityFeePerGas !== null) {
        overridden.maxFeePerGas = maxFeePerGas
        overridden.maxPriorityFeePerGas = maxPriorityFeePerGas
      }
      return overridden
  }
}

export const isInternalDefaultProxy = async (
  provider: Provider,
  proxyAddress: string
): Promise<boolean> => {
  const SphinxRegistry = new Contract(
    getSphinxRegistryAddress(),
    SphinxRegistryABI,
    provider
  )

  const actionExecutedEvents = await SphinxRegistry.queryFilter(
    SphinxRegistry.filters.EventAnnouncedWithData(
      'DefaultProxyDeployed',
      null,
      proxyAddress
    )
  )

  return actionExecutedEvents.length === 1
}

/**
 * Since both UUPS and Transparent proxies use the same interface we use a helper function to check that. This wrapper is intended to
 * keep the code clear by providing separate functions for checking UUPS and Transparent proxies.
 *
 * @param provider JSON RPC provider corresponding to the current project owner.
 * @param contractAddress Address of the contract to check the interface of
 * @returns
 */
export const isTransparentProxy = async (
  provider: Provider,
  proxyAddress: string
): Promise<boolean> => {
  // We don't consider default proxies to be transparent proxies, even though they share the same
  // interface.
  // TODO(upgrades): `isInternalDefaultProxy` relies on the `DefaultProxyDeployed` event, which no longer
  // exists. Also, `isInternalDefaultProxy` may not be necessary anymore -- not sure.
  // if ((await isInternalDefaultProxy(provider, proxyAddress)) === true) {
  //   return false
  // }

  // Fetch proxy owner address from storage slot defined by EIP-1967
  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxyAddress)

  // If proxy owner is not a valid address, then proxy type is incompatible
  if (!ethers.isAddress(ownerAddress)) {
    return false
  }

  return true
}

/**
 * Checks if the passed in proxy contract points to an implementation address which implements the minimum requirements to be
 * a Sphinx compatible UUPS proxy.
 *
 * @param provider JSON RPC provider corresponding to the current project owner.
 * @param proxyAddress Address of the proxy contract. Since this is a UUPS proxy, we check the interface of the implementation function.
 * @returns
 */
export const isUUPSProxy = async (
  provider: Provider,
  proxyAddress: string
): Promise<boolean> => {
  const implementationAddress = await getEIP1967ProxyImplementationAddress(
    provider,
    proxyAddress
  )

  // Fetch proxy owner address from storage slot defined by EIP-1967
  const ownerAddress = await getEIP1967ProxyAdminAddress(
    provider,
    implementationAddress
  )

  // If proxy owner is not a valid address, then proxy type is incompatible
  if (!ethers.isAddress(ownerAddress)) {
    return false
  }

  return true
}

export const isUserContractKind = (
  contractKind: string
): contractKind is UserContractKind => {
  return userContractKinds.includes(contractKind)
}

/**
 * Retrieves an artifact by name from the local file system.
 */
export const readContractArtifact = (
  contractArtifactPath: string,
  integration: Integration
): ContractArtifact => {
  const artifact: ContractArtifact = JSON.parse(
    fs.readFileSync(contractArtifactPath, 'utf8')
  )

  if (integration === 'hardhat') {
    return artifact
  } else if (integration === 'foundry') {
    return parseFoundryArtifact(artifact)
  } else {
    throw new Error('Unknown integration')
  }
}

/**
 * Reads the build info from the local file system.
 *
 * @param buildInfoPath Path to the build info file.
 * @returns BuildInfo object.
 */
export const readBuildInfo = (buildInfoPath: string): BuildInfo => {
  const buildInfo: BuildInfo = JSON.parse(
    fs.readFileSync(buildInfoPath, 'utf8')
  )

  return buildInfo
}

export const validateBuildInfo = (
  buildInfo: BuildInfo,
  integration: Integration
): void => {
  if (!semver.satisfies(buildInfo.solcVersion, '>0.5.x <0.9.x')) {
    throw new Error(
      `Storage layout for Solidity version ${buildInfo.solcVersion} not yet supported. Sorry!`
    )
  }

  if (integration === 'hardhat') {
    if (
      !buildInfo.input.settings.outputSelection['*']['*'].includes(
        'storageLayout'
      )
    ) {
      throw new Error(
        `Did you forget to set the "storageLayout" compiler option in your Hardhat config file?`
      )
    }

    if (
      !buildInfo.input.settings.outputSelection['*']['*'].includes(
        'evm.gasEstimates'
      )
    ) {
      throw new Error(
        `Did you forget to set the "evm.gasEstimates" compiler option in your Hardhat config file?`
      )
    }
  }
}

/**
 * Retrieves artifact info from foundry artifacts and returns it in hardhat compatible format.
 *
 * @param artifact Raw artifact object.
 * @returns ContractArtifact
 */
export const parseFoundryArtifact = (artifact: any): ContractArtifact => {
  const abi = artifact.abi
  const bytecode = add0x(artifact.bytecode.object)
  const deployedBytecode = add0x(artifact.deployedBytecode.object)

  const compilationTarget = artifact.metadata.settings.compilationTarget
  const sourceName = Object.keys(compilationTarget)[0]
  const contractName = compilationTarget[sourceName]

  return { abi, bytecode, sourceName, contractName, deployedBytecode }
}

export const isEqualType = (
  prevStorageObj: StorageItem<ParsedTypeDetailed>,
  newStorageObj: StorageItem<ParsedTypeDetailed>
): boolean => {
  // Copied from OpenZeppelin's core upgrades package:
  // https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/13c072776e381d33cf285f8953127023b664de64/packages/core/src/storage/compare.ts#L197-L202
  const isRetypedFromOriginal = (
    original: StorageField,
    updated: StorageField
  ): boolean => {
    const originalLabel = stripContractSubstrings(original.type.item.label)
    const updatedLabel = stripContractSubstrings(updated.retypedFrom?.trim())

    return originalLabel === updatedLabel
  }

  const layoutComparator = new StorageLayoutComparator(false, false)

  // Copied from OpenZeppelin's core upgrades package:
  // https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/13c072776e381d33cf285f8953127023b664de64/packages/core/src/storage/compare.ts#L171-L173
  const isEqual =
    !isRetypedFromOriginal(prevStorageObj, newStorageObj) &&
    !layoutComparator.getTypeChange(prevStorageObj.type, newStorageObj.type, {
      allowAppend: false,
    })

  return isEqual
}

/**
 * @notice Converts the variables from the object format used by Sphinx into an ordered array
 * which can be used by ethers.js and Etherscan.
 */
export const getFunctionArgValueArray = (
  args: ParsedConfigVariables,
  fragment?: Fragment
): Array<ParsedConfigVariable> => {
  const argValues: Array<ParsedConfigVariable> = []

  if (fragment === undefined) {
    return argValues
  }

  fragment.inputs.forEach((input) => {
    argValues.push(args[input.name])
  })

  return argValues
}

export const getCreationCodeWithConstructorArgs = (
  bytecode: string,
  constructorArgs: ParsedConfigVariables,
  abi: ContractArtifact['abi']
): string => {
  const iface = new ethers.Interface(abi)
  const constructorArgValues = getFunctionArgValueArray(
    constructorArgs,
    iface.fragments.find(ConstructorFragment.isFragment)
  )

  const creationCodeWithConstructorArgs = bytecode.concat(
    remove0x(iface.encodeDeploy(constructorArgValues))
  )

  return creationCodeWithConstructorArgs
}

/**
 *
 * @param promise A promise to wrap in a timeout
 * @param timeLimit The amount of time to wait for the promise to resolve
 * @returns The result of the promise, or an error due to the timeout being reached
 */
export const callWithTimeout = async <T>(
  promise: Promise<T>,
  timeout: number,
  errorMessage: string
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeout)
  })

  return Promise.race([promise, timeoutPromise]).then((result) => {
    clearTimeout(timeoutHandle)
    return result
  })
}

export const toOpenZeppelinContractKind = (
  contractKind: ContractKind
): ProxyDeployment['kind'] => {
  if (
    contractKind === 'proxy' ||
    contractKind === 'external-transparent' ||
    contractKind === 'oz-transparent'
  ) {
    return 'transparent'
  } else if (
    contractKind === 'oz-ownable-uups' ||
    contractKind === 'oz-access-control-uups'
  ) {
    return 'uups'
  } else {
    throw new Error(
      `Attempted to convert "${contractKind}" to an OpenZeppelin proxy type`
    )
  }
}

// export const getOpenZeppelinValidationOpts = (
//   contractConfig: ParsedContractConfig
// ): Required<ValidationOptions> => {
//   type UnsafeAllow = Required<ValidationOptions>['unsafeAllow']

//   const unsafeAllow: UnsafeAllow = [
//     'state-variable-assignment',
//     'constructor',
//     'state-variable-immutable',
//   ]
//   if (contractConfig.unsafeAllow?.delegatecall) {
//     unsafeAllow.push('delegatecall')
//   }
//   if (contractConfig.unsafeAllow?.selfdestruct) {
//     unsafeAllow.push('selfdestruct')
//   }
//   if (contractConfig.unsafeAllow?.missingPublicUpgradeTo) {
//     unsafeAllow.push('missing-public-upgradeto')
//   }

//   const { renames, skipStorageCheck } = contractConfig.unsafeAllow

//   const options = {
//     kind: toOpenZeppelinContractKind(contractConfig.kind),
//     unsafeAllow,
//     unsafeAllowRenames: renames,
//     unsafeSkipStorageCheck: skipStorageCheck,
//   }

//   return withValidationDefaults(options)
// }

// TODO(upgrades)
// export const getOpenZeppelinUpgradableContract = (
//   fullyQualifiedName: string,
//   compilerInput: CompilerInput,
//   compilerOutput: CompilerOutput,
//   contractConfig: ParsedContractConfig
// ): UpgradeableContract => {
//   const options = getOpenZeppelinValidationOpts(contractConfig)

//   // In addition to doing validation the `getOpenZeppelinUpgradableContract` function also outputs some warnings related to
//   // the provided override options. We want to output our own warnings, so we temporarily disable console.error.
//   const tmp = console.error
//   // eslint-disable-next-line @typescript-eslint/no-empty-function
//   console.error = () => {}

//   // fetch the contract and validate
//   // We use a try catch and then rethrow any errors because we temporarily disabled console.error
//   try {
//     const contract = new UpgradeableContract(
//       fullyQualifiedName,
//       compilerInput,
//       // Without converting the `compilerOutput` type to `any`, OpenZeppelin throws an error due
//       // to the `SolidityStorageLayout` type that we've added to Hardhat's `CompilerOutput` type.
//       // Converting this type to `any` shouldn't impact anything since we use Hardhat's default
//       // `CompilerOutput`, which is what OpenZeppelin expects.
//       compilerOutput as any,
//       options
//     )
//     // revert to standard console.error
//     console.error = tmp
//     return contract
//   } catch (e) {
//     throw e
//   }
// }

export const getPreviousConfigUri = async (
  provider: Provider,
  registry: ethers.Contract,
  proxyAddress: string
): Promise<string | undefined> => {
  const proxyUpgradedRegistryEvents = await registry.queryFilter(
    registry.filters.EventAnnouncedWithData('ProxyUpgraded', null, proxyAddress)
  )

  const latestRegistryEvent = proxyUpgradedRegistryEvents.at(-1)

  if (latestRegistryEvent === undefined) {
    return undefined
  } else if (!isEventLog(latestRegistryEvent)) {
    throw new Error(`ProxyUpgraded event has no args. Should never happen.`)
  }

  const manager = new Contract(
    latestRegistryEvent.args.manager,
    SphinxManagerABI,
    provider
  )

  const latestExecutionEvent = (
    await manager.queryFilter(manager.filters.ProxyUpgraded(null, proxyAddress))
  ).at(-1)

  if (latestExecutionEvent === undefined) {
    throw new Error(
      `ProxyUpgraded event detected in registry but not in manager contract. Should never happen.`
    )
  } else if (!isEventLog(latestExecutionEvent)) {
    throw new Error(`ProxyUpgraded event has no args. Should never happen.`)
  }

  const deploymentState: DeploymentState = await manager.deployments(
    latestExecutionEvent.args.deploymentId
  )

  return deploymentState.configUri
}

export const fetchAndCacheCompilerConfig = async (
  configUri: string,
  compilerConfigFolderPath: string
): Promise<CompilerConfig> => {
  const localCompilerConfig = await readCompilerConfig(
    compilerConfigFolderPath,
    configUri
  )
  if (localCompilerConfig) {
    return localCompilerConfig
  } else {
    const remoteCompilerConfig = await callWithTimeout<CompilerConfig>(
      sphinxFetchSubtask({ configUri }),
      30000,
      'Failed to fetch config file from IPFS'
    )

    // Cache the canonical config by saving it to the local filesystem.
    writeCompilerConfig(
      compilerConfigFolderPath,
      configUri,
      remoteCompilerConfig
    )
    return remoteCompilerConfig
  }
}

export const getConfigArtifactsRemote = async (
  compilerConfig: CompilerConfig
): Promise<ConfigArtifacts> => {
  const solcArray: BuildInfo[] = []
  // Get the compiler output for each compiler input.
  for (const sphinxInput of compilerConfig.inputs) {
    const solcBuild: SolcBuild = await getSolcBuild(sphinxInput.solcVersion)
    let compilerOutput: CompilerOutput
    if (solcBuild.isSolcJs) {
      const compiler = new Compiler(solcBuild.compilerPath)
      compilerOutput = await compiler.compile(sphinxInput.input)
    } else {
      const compiler = new NativeCompiler(solcBuild.compilerPath)
      compilerOutput = await compiler.compile(sphinxInput.input)
    }

    if (compilerOutput.errors) {
      const formattedErrorMessages: string[] = []
      compilerOutput.errors.forEach((error) => {
        // Ignore warnings thrown by the compiler.
        if (error.type.toLowerCase() !== 'warning') {
          formattedErrorMessages.push(error.formattedMessage)
        }
      })

      if (formattedErrorMessages.length > 0) {
        throw new Error(
          `Failed to compile. Please report this error to Sphinx.\n` +
            `${formattedErrorMessages}`
        )
      }
    }

    solcArray.push({
      input: sphinxInput.input,
      output: compilerOutput,
      id: sphinxInput.id,
      solcLongVersion: sphinxInput.solcLongVersion,
      solcVersion: sphinxInput.solcVersion,
    })
  }

  const artifacts: ConfigArtifacts = {}
  const notSkipping = compilerConfig.actionsTODO.filter((e) => !e.skip)
  for (const actionTODO of notSkipping) {
    const { fullyQualifiedName } = actionTODO
    // Split the contract's fully qualified name into its source name and contract name.
    const [sourceName, contractName] = actionTODO.fullyQualifiedName.split(':')

    const buildInfo = solcArray.find(
      (e) => e.output.contracts[sourceName][contractName]
    )
    if (!buildInfo) {
      throw new Error(
        `Could not find artifact for: ${fullyQualifiedName}. Should never happen.`
      )
    }
    const contractOutput = buildInfo.output.contracts[sourceName][contractName]

    artifacts[fullyQualifiedName] = {
      buildInfo,
      artifact: {
        abi: contractOutput.abi,
        sourceName,
        contractName,
        bytecode: add0x(contractOutput.evm.bytecode.object),
        deployedBytecode: add0x(contractOutput.evm.deployedBytecode.object),
      },
    }
  }
  return artifacts
}

export const getDeploymentEvents = async (
  SphinxManager: ethers.Contract,
  deploymentId: string
): Promise<ethers.EventLog[]> => {
  // Get the most recent approval event for this deployment ID.
  const approvalEvent = (
    await SphinxManager.queryFilter(
      SphinxManager.filters.SphinxDeploymentApproved(deploymentId)
    )
  ).at(-1)

  if (!approvalEvent) {
    throw new Error(
      `No approval event found for deployment ID ${deploymentId}. Should never happen.`
    )
  }

  const completedEvent = (
    await SphinxManager.queryFilter(
      SphinxManager.filters.SphinxDeploymentCompleted(deploymentId)
    )
  ).at(-1)

  if (!completedEvent) {
    throw new Error(
      `No deployment completed event found for deployment ID ${deploymentId}. Should never happen.`
    )
  }

  const contractDeployedEvents = await SphinxManager.queryFilter(
    SphinxManager.filters.ContractDeployed(null, deploymentId),
    approvalEvent.blockNumber,
    completedEvent.blockNumber
  )

  // Make sure that all of the events are EventLogs.
  if (contractDeployedEvents.some((event) => !isEventLog(event))) {
    throw new Error(`ContractDeployed event has no args. Should never happen.`)
  }

  return contractDeployedEvents.filter(isEventLog)
}

/**
 * Returns true and only if the variable is a valid ethers DataHexString:
 * https://docs.ethers.org/v5/api/utils/bytes/#DataHexString
 */
export const isDataHexString = (variable: any): boolean => {
  return ethers.isHexString(variable) && variable.length % 2 === 0
}

export const isLiveNetwork = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<boolean> => {
  try {
    // This RPC method will throw an error on live networks, but won't throw an error on Hardhat or
    // Anvil, including forked networks. It doesn't throw an error on Anvil because the `anvil_`
    // namespace is an alias for `hardhat_`. Source:
    // https://book.getfoundry.sh/reference/anvil/#custom-methods
    await provider.send('hardhat_impersonateAccount', [ethers.ZeroAddress])
  } catch (err) {
    return true
  }
  return false
}

export const getImpersonatedSigner = async (
  address: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<ethers.Signer> => {
  // This RPC method works for anvil too, since it's an alias for 'anvil_impersonateAccount'.
  await provider.send('hardhat_impersonateAccount', [address])

  if (provider instanceof SphinxJsonRpcProvider) {
    return new JsonRpcSigner(provider, address)
  } else {
    return provider.getSigner(address)
  }
}

/**
 * Checks if one of the `DEPLOY_CONTRACT` actions reverts. This does not guarantee that the
 * deployment will or will not revert, but it will return the correct result in most cases.
 */
export const deploymentDoesRevert = async (
  provider: SphinxJsonRpcProvider,
  managerAddress: string,
  actionBundle: SphinxActionBundle,
  actionsExecuted: number
): Promise<boolean> => {
  // Get the `DEPLOY_CONTRACT` actions that have not been executed yet.
  const deployContractActions =
    getDeployContractActions(actionBundle).slice(actionsExecuted)

  try {
    // Attempt to estimate the gas of the deployment transactions. This will throw an error if
    // gas estimation fails, which should only occur if a constructor reverts.
    await Promise.all(
      deployContractActions.map(async (action) =>
        provider.estimateGas({
          from: managerAddress,
          data: action.creationCodeWithConstructorArgs,
        })
      )
    )
  } catch (e) {
    // At least one of the constructors reverted.
    return true
  }
  return false
}

// Transfer ownership of the SphinxManager if a new project owner has been specified.
export const transferProjectOwnership = async (
  manager: ethers.Contract,
  newOwnerAddress: string,
  currOwnerAddress: string,
  signer: ethers.Signer,
  spinner: ora.Ora
) => {
  if (!ethers.isAddress(newOwnerAddress)) {
    throw new Error(`Invalid address for new project owner: ${newOwnerAddress}`)
  }

  if (newOwnerAddress !== currOwnerAddress) {
    spinner.start(`Transferring project ownership to: ${newOwnerAddress}`)
    if (newOwnerAddress === ethers.ZeroAddress) {
      // We must call a separate function if ownership is being transferred to address(0).
      await (
        await manager.renounceOwnership(await getGasPriceOverrides(signer))
      ).wait()
    } else {
      await (
        await manager.transferOwnership(
          newOwnerAddress,
          await getGasPriceOverrides(signer)
        )
      ).wait()
    }
    spinner.succeed(`Transferred project ownership to: ${newOwnerAddress}`)
  }
}

export const isOpenZeppelinContractKind = (kind: ContractKind): boolean => {
  return (
    kind === 'oz-transparent' ||
    kind === 'oz-ownable-uups' ||
    kind === 'oz-access-control-uups'
  )
}

/**
 * Returns the address of a proxy's implementation contract that would be deployed by Sphinx via
 * Create3. We use a 'salt' value that's a hash of the implementation contract's init code, which
 * includes constructor arguments. This essentially mimics the behavior of Create2 in the sense that
 * the implementation's address has a one-to-one mapping with its init code. This makes it easy to
 * detect if an implementation contract with the exact same bytecode is already deployed, which
 * allows us to skip deploying unnecessary implementations.
 */
export const getImplAddress = (
  managerAddress: string,
  bytecode: string,
  constructorArgs: ParsedConfigVariables,
  abi: ContractArtifact['abi']
): string => {
  const implInitCode = getCreationCodeWithConstructorArgs(
    bytecode,
    constructorArgs,
    abi
  )
  const implSalt = ethers.keccak256(implInitCode)
  return getCreate3Address(managerAddress, implSalt)
}

/**
 * @notice Stderr and stdout can be retrieved from the `stderr` and `stdout` properties of the
 * returned object. Error can be caught by wrapping the function in a try/catch block.
 */
export const execAsync = promisify(exec)

export const getDuplicateElements = (arr: Array<string>): Array<string> => {
  return [...new Set(arr.filter((e, i, a) => a.indexOf(e) !== i))]
}

export const fetchCanonicalConfig = async (
  orgId: string,
  isTestnet: boolean,
  apiKey: string,
  projectName: string
): Promise<CanonicalConfig | undefined> => {
  const response = await axios.post(
    `${fetchSphinxManagedBaseUrl()}/api/fetchCanonicalConfig`,
    {
      apiKey,
      isTestnet,
      orgId,
      projectName,
    }
  )
  const config: CanonicalConfig | undefined = response.data
  return config
}

export const fetchSphinxManagedBaseUrl = () => {
  return process.env.SPHINX_MANAGED_BASE_URL
    ? process.env.SPHINX_MANAGED_BASE_URL
    : 'https://www.sphinx.dev'
}

export const relayProposal = async (proposalRequest: ProposalRequest) => {
  // TODO: return undefined if the request returns an empty object.
  try {
    await axios.post(
      `${fetchSphinxManagedBaseUrl()}/api/propose`,
      proposalRequest
    )
  } catch (e) {
    if (e.response.status === 200) {
      return
    } else if (e.response.status === 400) {
      throw new Error(`Malformed Request: ${e.response.data}`)
    } else if (e.response.status === 401) {
      throw new Error(
        `Unauthorized request. Please check your Sphinx API key and organization ID are correct.`
      )
    } else if (e.response.status === 409) {
      throw new Error(
        `Unsupported network. Please report this to the developers.`
      )
    } else if (e.response.status === 500) {
      throw new Error(
        `Internal server error. Please report this to the developers.`
      )
    } else {
      throw new Error(
        `Unexpected response code. Please report this to the developers.`
      )
    }
  }
}

export const relayIPFSCommit = async (
  apiKey: string,
  orgId: string,
  ipfsData: Array<string>
): Promise<IPFSCommitResponse> => {
  const response = await axios.post(`${fetchSphinxManagedBaseUrl()}/api/pin`, {
    apiKey,
    orgId,
    ipfsData,
  })

  if (response.status === 200) {
    return response.data
  } else if (response.status === 400) {
    throw new Error(
      'Malformed request pinning to IPFS, please report this to the developers'
    )
  } else if (response.status === 401) {
    throw new Error(
      `Unauthorized, please check your API key and Org Id are correct`
    )
  } else {
    throw new Error(
      `Unexpected response code, please report this to the developers`
    )
  }
}

/**
 * @notice Returns a new CanonicalConfig with default parameters for the config options.
 * This is useful when the user is attempting to propose a completely new config, since
 * there is no previous config to use as a starting point yet.
 */
export const getEmptyCanonicalConfig = (
  chainIds: Array<number>,
  manager: string,
  orgId: string,
  projectName: string
): CanonicalConfig => {
  if (chainIds.length === 0) {
    throw new Error(`Must provide at least one chain ID.`)
  }

  const chainStates = {}

  chainIds.forEach((chainId) => {
    chainStates[chainId] = {
      firstProposalOccurred: false,
      projectCreated: false,
    }
  })

  return {
    projectName,
    manager,
    options: {
      orgId,
      owners: [],
      ownerThreshold: 0,
      proposers: [],
      managerVersion: 'v0.2.4',
    },
    chainStates,
  }
}

/**
 * Converts a parsed config into a canonical config. Assumes that the `SphinxAuth`
 * contract has been created on each chain.
 *
 * @param rpcProviders A mapping from network name to RPC provider. There must be an RPC provider
 * for each chain ID in the parsed config.
 */
// TODO: rm?
// export const toCanonicalConfig = async (
//   parsedConfig: ParsedConfig,
//   managerAddress: string,
//   authAddress: string,
//   rpcProviders: Record<string, SphinxJsonRpcProvider>
// ): Promise<CanonicalConfig> => {
//   const { projectName } = parsedConfig
//   const chainStates = {}

//   for (const chainId of parsedConfig.options.chainIds) {
//     const network = findNetwork(chainId)

//     if (!network) {
//       throw new Error(`Unsupported chain ID: ${chainId}`)
//     }
//     const provider = rpcProviders[network]
//     if (!parsedConfig.options.chainIds.includes(chainId)) {
//       throw new Error(
//         `Chain ID ${chainId} corresponds to an RPC provider but does not exist in the parsed config.`
//       )
//     }

//     const Auth = new ethers.Contract(authAddress, AuthABI, provider)
//     const firstProposalOccurred = await Auth.firstProposalOccurred()

//     const projectCreated = await isProjectCreated(provider, authAddress)

//     chainStates[chainId] = {
//       firstProposalOccurred,
//       projectCreated,
//     }
//   }

//   return {
//     projectName,
//     manager: managerAddress,
//     options: parsedConfig.options,
//     chainStates,
//   }
// }

export const isProjectCreated = async (
  provider: Provider,
  authAddress: string
): Promise<boolean> => {
  const AuthFactory = new ethers.Contract(
    AUTH_FACTORY_ADDRESS,
    AuthFactoryABI,
    provider
  )
  const isCreated: boolean = await AuthFactory.isDeployed(authAddress)
  return isCreated
}

export const findNetwork = (chainId: number): string => {
  const network = Object.keys(SUPPORTED_NETWORKS).find(
    (n) => SUPPORTED_NETWORKS[n] === chainId
  )

  if (!network) {
    throw new Error(`Unsupported chain ID: ${chainId}`)
  }

  return network
}

export const arraysEqual = (
  a: Array<string | ParsedConfigVariable>,
  b: Array<string | ParsedConfigVariable>
): boolean => {
  if (a.length !== b.length) {
    return false
  }

  for (let i = 0; i < a.length; i++) {
    if (!equal(a[i], b[i])) {
      return false
    }
  }

  return true
}

/**
 * @notice Returns a hyperlinked string that can be printed to the console.
 */
export const hyperlink = (text: string, url: string): string => {
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`
}

export const userConfirmation = async (question: string) => {
  const confirmed = await yesno({
    question,
  })
  if (!confirmed) {
    console.error(`Denied by the user.`)
    process.exit(1)
  }
}

export const resolveNetwork = async (
  network: {
    chainId: number | bigint
    name: string
  },
  isLiveNetwork_: boolean
): Promise<{
  networkName: string
  chainId: number
}> => {
  const networkName = network.name
  const chainIdNumber = Number(network.chainId)
  if (networkName !== 'unknown') {
    return { chainId: chainIdNumber, networkName }
  } else {
    // The network name could be 'unknown' on a supported network, e.g. gnosis-chiado. We check if
    // the chain ID matches a supported network and use the network name if it does.
    const supportedNetwork = Object.entries(SUPPORTED_NETWORKS).find(
      ([, supportedChainId]) => supportedChainId === chainIdNumber
    )
    if (supportedNetwork) {
      return { chainId: chainIdNumber, networkName: supportedNetwork[0] }
    } else if (!isLiveNetwork_) {
      return { chainId: chainIdNumber, networkName: 'local' }
    } else {
      // The network is an unsupported live network.
      throw new Error(`Unsupported network: ${chainIdNumber}`)
    }
  }
}

/**
 * @notice Returns the name of the directory that stores the artifacts for the specified network.
 * The directory name will be one of the following:
 *
 * 1. `networkName` if the network is a live network. For example, 'ethereum'.
 *
 * 2. `networkName-local` if the network matches a supported network and the network is local, i.e.
 * either a forked network or a local Anvil/Hardhat node with a user-defined chain ID. For
 * example, 'ethereum-local'. We say 'local' instead of 'fork' because it's difficult to reliably
 * infer whether a network is a fork or a Hardhat/Anvil node with a user-defined chain ID, e.g.
 * `anvil --chain-id 5`.
 *
 * 3. `<hardhat/anvil>-chainId` otherwise. This will occur on standard Hardhat/Anvil nodes. For
 * example, 'hardhat-31337'.
 */
export const getNetworkDirName = (
  networkName: string,
  isLiveNetwork_: boolean,
  chainId: number
): string => {
  if (isLiveNetwork_) {
    return networkName
  } else if (networkName === 'anvil' || networkName === 'hardhat') {
    return `${networkName}-${chainId}`
  } else {
    return `${networkName}-local`
  }
}

/**
 * @notice Returns a string that describes a network, which is used in the diff. A network tag can
 * take three forms (in order of precedence):
 *
 * 1. `networkName` if the network is a live network. For example, 'ethereum'.
 *
 * 2. `networkName (local)` if the network matches a supported network and the network is local, i.e.
 * either a forked network or a local Anvil/Hardhat node with a user-defined chain ID. For
 * example, 'ethereum-local'. We say 'local' instead of 'fork' because it's difficult to reliably
 * infer whether a network is a fork or a Hardhat/Anvil node with a user-defined chain ID, e.g.
 * `anvil --chain-id 5`.
 *
 * 3. `local (chain ID: <chainId>)` otherwise. This will occur on standard Hardhat/Anvil nodes. For
 * example, 'local (chain ID: 31337)'.
 */
export const getNetworkTag = (
  networkName: string,
  isLiveNetwork_: boolean,
  chainId: bigint
): string => {
  if (isLiveNetwork_) {
    return networkName
  } else if (
    Object.keys(SUPPORTED_NETWORKS).includes(networkName) &&
    !Object.keys(SUPPORTED_LOCAL_NETWORKS).includes(networkName)
  ) {
    return `${networkName} (local)`
  } else {
    return `local (chain ID: ${chainId})`
  }
}

export const getNetworkNameForChainId = (chainId: bigint): string => {
  const network = Object.keys(SUPPORTED_NETWORKS).find(
    (n) => SUPPORTED_NETWORKS[n] === Number(chainId)
  )

  if (!network) {
    return 'unknown'
  }

  return network
}

export const isEventLog = (
  event: ethers.EventLog | ethers.Log
): event is ethers.EventLog => {
  const eventLog = event as ethers.EventLog
  return (
    eventLog.args !== undefined &&
    eventLog.eventName !== undefined &&
    eventLog.eventSignature !== undefined &&
    eventLog.fragment !== undefined &&
    eventLog.interface !== undefined
  )
}

/**
 * @notice Sorts an array of hex strings in ascending order. This function mutates the array.
 */
export const sortHexStrings = (arr: Array<string>): void => {
  arr.sort((a, b) => {
    const aBigInt = BigInt(a)
    const bBigInt = BigInt(b)

    if (aBigInt < bBigInt) {
      return -1
    } else if (aBigInt > bBigInt) {
      return 1
    } else {
      return 0
    }
  })
}

/**
 * Removes "0x" from start of a string if it exists.
 *
 * @param str String to modify.
 * @returns the string without "0x".
 */
export const remove0x = (str: string): string => {
  if (str === undefined) {
    return str
  }
  return str.startsWith('0x') ? str.slice(2) : str
}

/**
 * Adds "0x" to the start of a string if necessary.
 *
 * @param str String to modify.
 * @returns the string with "0x".
 */
export const add0x = (str: string): string => {
  if (str === undefined) {
    return str
  }
  return str.startsWith('0x') ? str : '0x' + str
}

/**
 * Casts a hex string to a buffer.
 *
 * @param inp Input to cast to a buffer.
 * @return Input cast as a buffer.
 */
export const fromHexString = (inp: Buffer | string): Buffer => {
  if (typeof inp === 'string' && inp.startsWith('0x')) {
    return Buffer.from(inp.slice(2), 'hex')
  }

  return Buffer.from(inp)
}

/**
 * Casts an input to a hex string.
 *
 * @param inp Input to cast to a hex string.
 * @return Input cast as a hex string.
 */
export const toHexString = (inp: Buffer | string | number): string => {
  if (typeof inp === 'number') {
    return ethers.toBeHex(BigInt(inp))
  } else {
    return '0x' + fromHexString(inp).toString('hex')
  }
}

/**
 * Basic timeout-based async sleep function.
 *
 * @param ms Number of milliseconds to sleep.
 */
export const sleep = async (ms: number): Promise<void> => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

// From: https://github.com/NomicFoundation/hardhat/blob/f92e3233acc3180686e99b3c1b31a0e469f2ff1a/packages/hardhat-core/src/internal/core/config/config-resolution.ts#L112-L116
export const isHttpNetworkConfig = (
  config: NetworkConfig
): config is HttpNetworkConfig => {
  return 'url' in config
}

export const getCallHash = (to: string, data: string): string => {
  return ethers.keccak256(
    AbiCoder.defaultAbiCoder().encode(['address', 'bytes'], [to, data])
  )
}

export const isSupportedChainId = (
  chainId: number | bigint
): chainId is SupportedChainId => {
  return Object.values(SUPPORTED_NETWORKS).some(
    (supportedChainId) => supportedChainId === Number(chainId)
  )
}

export const isSupportedNetworkName = (
  networkName: string
): networkName is SupportedNetworkName => {
  const chainId = SUPPORTED_NETWORKS[networkName]
  return chainId !== undefined
}

export const isUserConstructorArgOverride = (
  arg: UserArgOverride
): arg is UserConstructorArgOverride => {
  return (arg as UserConstructorArgOverride).constructorArgs !== undefined
}

export const isUserFunctionOptions = (
  arg: UserConfigVariable | UserFunctionOptions | undefined
): arg is UserFunctionOptions => {
  return (
    arg !== undefined &&
    isUserFunctionArgOverrideArray((arg as UserFunctionOptions).overrides)
  )
}

export const isUserFunctionArgOverrideArray = (
  arg: Array<UserArgOverride> | UserConfigVariable | undefined
): arg is Array<UserFunctionArgOverride> => {
  return (
    Array.isArray(arg) &&
    arg.every((e) => {
      return (e as UserFunctionArgOverride).args !== undefined
    })
  )
}

export const getCallActionAddressForNetwork = (
  networkName: string,
  callAction: UserCallAction
): string => {
  const { address: defaultAddress, addressOverrides } = callAction
  if (addressOverrides === undefined) {
    return defaultAddress
  }

  for (const override of addressOverrides) {
    if (override.chains.includes(networkName)) {
      return override.address
    }
  }

  return defaultAddress
}

/**
 * @notice Returns a string that represents a function call in a string format that can be
 * displayed in a terminal. Note that this function does not support function calls with BigInt
 * arguments, since JSON.stringify can't parse them.
 *
 * @param spaceToIndentVariables Number of spaces to indent the variables in the JSON string.
 * @param spaceToIndentClosingParenthesis Number of spaces to indent the closing parenthesis.
 */
export const prettyFunctionCall = (
  referenceNameOrAddress: string,
  functionName: string,
  variables: ParsedConfigVariables | Array<UserConfigVariable>,
  spaceToIndentVariables: number = 2,
  spaceToIndentClosingParenthesis: number = 0
): string => {
  // TODO(docs)
  const convertedBigInts = convertBigIntToString(variables)

  const stringified = JSON.stringify(convertedBigInts, null, spaceToIndentVariables)
  // Removes the first and last characters, which are either '[' and ']', or '{' and '}'.
  const removedBrackets = stringified.substring(1, stringified.length - 1)

  // We only add a newline if the stringified variables contain a newline. Otherwise, a function
  // call without any parameters would look like this: `myFunction(    )` (note the extra spaces).
  const numSpacesForClosingParenthesis = removedBrackets.includes(`\n`)
    ? spaceToIndentClosingParenthesis
    : 0

  const addedSpaceToClosingParenthesis =
    removedBrackets + ' '.repeat(numSpacesForClosingParenthesis)

  const target = ethers.isAddress(referenceNameOrAddress)
    ? `(${referenceNameOrAddress})`
    : referenceNameOrAddress

  return `${target}.${functionName}(${addedSpaceToClosingParenthesis})`
}

/**
 * @notice Encodes the data that initializes a SphinxManager contract via the SphinxRegistry.
 *
 * @param owner Address of the SphinxManager's owner, which should be the SphinxAuth contract.
 */
export const getRegistryData = (owner: string, projectName: string): string => {
  return AbiCoder.defaultAbiCoder().encode(
    ['address', 'string', 'bytes'],
    [
      owner,
      projectName,
      // Empty bytes. Useful in case future versions of the SphinxManager contract has additional
      // fields.
      '0x',
    ]
  )
}

/**
 * @notice Returns true if and only if the two inputs are equal.
 */
export const equal = (
  a: ParsedConfigVariable,
  b: ParsedConfigVariable
): boolean => {
  if (
    (Array.isArray(a) && !Array.isArray(b)) ||
    (!Array.isArray(a) && Array.isArray(b)) ||
    typeof a !== typeof b
  ) {
    return false
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    } else {
      for (let i = 0; i < a.length; i++) {
        if (!equal(a[i], b[i])) {
          return false
        }
      }
      return true
    }
  } else if (typeof a === 'object' && typeof b === 'object') {
    if (Object.keys(a).length !== Object.keys(b).length) {
      return false
    } else {
      for (const key of Object.keys(a)) {
        if (!equal(a[key], b[key])) {
          return false
        }
      }
      return true
    }
  } else if (
    // We just check for the type of `a` here because we already checked that the type of `a` is
    // equal to the type of `b` above.
    typeof a === 'number' ||
    typeof a === 'boolean' ||
    typeof a === 'number'
  ) {
    return a === b
  } else {
    // We know that the types of `a` and `b` match due to the check at the beginning of this
    // function, so we just return the type of `a`.
    throw new Error(`Unsupported type: ${typeof a}`)
  }
}

export const isExtendedDeployContractTODO = (
  actionTODO: ExtendedDeployContractTODO | ExtendedFunctionCallTODO
): actionTODO is ExtendedDeployContractTODO => {
  return actionTODO.actionType === SphinxActionType.DEPLOY_CONTRACT
}

export const isDeployContractTODO = (
  actionTODO: DeployContractTODO | FunctionCallTODO
): actionTODO is DeployContractTODO => {
  return actionTODO.actionType === SphinxActionType.DEPLOY_CONTRACT
}

export const makeParsedConfig = (
  chainInfo: ChainInfo,
  configArtifacts: ConfigArtifacts
): ParsedConfig => {
  const {
    authAddress,
    managerAddress,
    chainId,
    actionsTODO,
    newConfig,
    isLiveNetwork: isLiveNetwork_,
    prevConfig,
  } = chainInfo

  const actions = actionsTODO.map(fromRawSphinxActionTODO)

  const extendedActions: Array<
    ExtendedDeployContractTODO | ExtendedFunctionCallTODO
  > = []
  for (const action of actions) {
    const { referenceName, fullyQualifiedName } = action
    const { abi } = configArtifacts[fullyQualifiedName].artifact
    const iface = new ethers.Interface(abi)
    const coder = ethers.AbiCoder.defaultAbiCoder()

    if (isDeployContractTODO(action)) {
      // TODO: getTargetSalt -> getCreate3Salt
      const create3Salt = getTargetSalt(referenceName, action.userSalt)
      const create3Address = getCreate3Address(managerAddress, create3Salt)

      // TODO: this doesn't have keys. you'll need to write a helper function that takes an ethers Interface
      // and the encoded values, then returns the variables object.
      // TODO(case): contract doesn't have a constructor
      // TODO(case): contract has a constructor with no args
      const constructorFragment = iface.fragments.find(
        ConstructorFragment.isFragment
      )
      const decodedConstructorArgs = constructorFragment
        ? coder.decode(constructorFragment.inputs, action.constructorArgs)
        : {}

      const decodedAction: DecodedAction = {
        referenceName,
        functionName: 'constructor',
        variables: decodedConstructorArgs,
      }
      extendedActions.push({ create3Address, decodedAction, ...action })
    } else {
      // TODO: this doesn't have keys. you'll need to write a helper function that takes an ethers Interface
      // and the encoded values, then returns the variables object.
      const decodedFunctionParams = iface.decodeFunctionData(
        action.selector,
        ethers.concat([action.selector, action.functionParams])
      )

      // TODO(case): what does this return for an overloaded function?
      const functionName = iface.getFunctionName(action.selector)

      const decodedAction: DecodedAction = {
        referenceName,
        functionName,
        variables: decodedFunctionParams,
      }
      extendedActions.push({ decodedAction, ...action })
    }
  }

  return {
    authAddress,
    managerAddress,
    chainId,
    newConfig,
    isLiveNetwork: isLiveNetwork_,
    prevConfig,
    actionsTODO: extendedActions,
  }
}

// TODO(refactor): rename "toString" b/c we may convert to number
// TODO: throw error if typeof obj === 'bigint' && obj > Number.MAX_SAFE_INTEGER
export const convertBigIntToString = (obj: any): any => {
  if (
    typeof obj === 'boolean' ||
    typeof obj === 'string' ||
    typeof obj === 'number'
  ) {
    return obj
  } else if (typeof obj === 'bigint') {
    return obj > Number.MAX_SAFE_INTEGER ? obj.toString() : Number(obj)
  } else if (Array.isArray(obj)) {
    return obj.map(convertBigIntToString)
  } else if (typeof obj === 'object') {
    const newObj: { [name: string]: any } = {}
    for (const key of Object.keys(obj)) {
      newObj[key] = convertBigIntToString(obj[key])
    }
    return newObj
  } else {
    throw new Error(`Unsupported type: ${typeof obj}`)
  }
}
