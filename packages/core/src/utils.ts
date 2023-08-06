import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'
import { exec } from 'child_process'

import yesno from 'yesno'
import axios from 'axios'
import ora from 'ora'
import * as semver from 'semver'
import {
  utils,
  Signer,
  Contract,
  providers,
  ethers,
  PayableOverrides,
  BigNumber,
} from 'ethers'
import { Fragment } from 'ethers/lib/utils'
import {
  ProxyArtifact,
  SphinxRegistryABI,
  SphinxManagerABI,
  ProxyABI,
  AuthABI,
  AuthFactoryABI,
} from '@sphinx-labs/contracts'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { add0x, remove0x } from '@eth-optimism/core-utils'
import chalk from 'chalk'
import {
  ProxyDeployment,
  UpgradeableContract,
  ValidationOptions,
  withValidationDefaults,
} from '@openzeppelin/upgrades-core'
import {
  ParsedTypeDetailed,
  StorageItem,
} from '@openzeppelin/upgrades-core/dist/storage/layout'
import {
  StorageField,
  StorageLayoutComparator,
  stripContractSubstrings,
} from '@openzeppelin/upgrades-core/dist/storage/compare'
import { CompilerInput, SolcBuild } from 'hardhat/types'
import { Compiler, NativeCompiler } from 'hardhat/internal/solidity/compiler'

import {
  CompilerConfig,
  UserContractKind,
  userContractKinds,
  ParsedContractConfig,
  ContractKind,
  ParsedConfigVariables,
  ParsedConfigVariable,
  GetConfigArtifacts,
  ConfigArtifacts,
  GetCanonicalConfig,
  UserConfigWithOptions,
  CanonicalConfig,
  ParsedConfig,
  ParsedConfigWithOptions,
  NetworkType,
} from './config/types'
import {
  AuthLeaf,
  SphinxActionBundle,
  SphinxActionType,
  SphinxBundles,
  DeploymentState,
  IPFSCommitResponse,
  ProposalRequest,
} from './actions/types'
import { Integration } from './constants'
import {
  AUTH_FACTORY_ADDRESS,
  getAuthAddress,
  getSphinxManagerAddress,
  getSphinxRegistryAddress,
} from './addresses'
import 'core-js/features/array/at'
import {
  BuildInfo,
  CompilerOutput,
  ContractArtifact,
} from './languages/solidity/types'
import { sphinxFetchSubtask } from './config/fetch'
import { getSolcBuild } from './languages'
import {
  getAuthLeafsForChain,
  getDeployContractActions,
  getNumDeployContractActions,
} from './actions/bundle'
import { getCreate3Address } from './config/utils'
import {
  assertValidConfigOptions,
  getParsedConfigWithOptions,
  parseConfigOptions,
} from './config/parse'
import { SphinxRuntimeEnvironment, FailureAction } from './types'
import { SUPPORTED_NETWORKS } from './networks'

export const getDeploymentId = (
  bundles: SphinxBundles,
  configUri: string
): string => {
  const actionRoot = bundles.actionBundle.root
  const targetRoot = bundles.targetBundle.root
  const numActions = bundles.actionBundle.actions.length
  const numTargets = bundles.targetBundle.targets.length
  const numImmutableContracts = getNumDeployContractActions(
    bundles.actionBundle
  )

  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'string'],
      [
        actionRoot,
        targetRoot,
        numActions,
        numTargets,
        numImmutableContracts,
        configUri,
      ]
    )
  )
}

export const writeSnapshotId = async (
  provider: ethers.providers.JsonRpcProvider,
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
  const iface = new ethers.utils.Interface(ProxyABI)

  const initCode = bytecode.concat(
    remove0x(iface.encodeDeploy([managerAddress]))
  )

  return initCode
}

export const checkIsUpgrade = async (
  provider: ethers.providers.Provider,
  parsedConfig: ParsedConfig
): Promise<boolean | string> => {
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    if (await isContractDeployed(contractConfig.address, provider)) {
      return referenceName
    }
  }
  return false
}

/**
 * Finalizes the registration of a project.
 *
 * @param Provider Provider corresponding to the signer that will execute the transaction.
 * @param ownerAddress Owner of the SphinxManager contract deployed by this call.
 */
export const registerOwner = async (
  projectName: string,
  registry: ethers.Contract,
  manager: ethers.Contract,
  ownerAddress: string,
  provider: providers.JsonRpcProvider,
  spinner: ora.Ora
): Promise<void> => {
  spinner.start(`Registering the project...`)

  if (!(await registry.isManagerDeployed(manager.address))) {
    await (
      await registry.register(
        ownerAddress,
        projectName,
        [], // We don't pass any extra initializer data to this version of the SphinxManager.
        await getGasPriceOverrides(provider)
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

export const getSphinxRegistryReadOnly = (
  provider: providers.Provider
): Contract => {
  return new Contract(getSphinxRegistryAddress(), SphinxRegistryABI, provider)
}

export const getSphinxManager = (manager: string, signer: Signer): Contract => {
  return new Contract(manager, SphinxManagerABI, signer)
}

export const getSphinxManagerReadOnly = (
  manager: string,
  provider: providers.Provider
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

  const prefix = logLevel.charAt(0).toUpperCase() + logLevel.slice(1)

  const chalkColor = logLevel === 'warning' ? chalk.yellow : chalk.red

  const parts = ['\n' + chalkColor.bold(prefix + ':') + ' ' + title]

  if (lines.length > 0) {
    parts.push(lines.map((l) => l + '\n').join(''))
  }

  stream.write(parts.join('\n') + '\n')
}

export const displayDeploymentTable = (
  parsedConfig: ParsedConfig,
  silent: boolean
) => {
  if (!silent) {
    const deployments = {}
    Object.entries(parsedConfig.contracts).forEach(
      ([referenceName, contractConfig], i) => {
        deployments[i + 1] = {
          Contract: referenceName,
          Address: contractConfig.address,
        }
      }
    )
    console.table(deployments)
  }
}

export const getProxyAt = (signer: Signer, proxyAddress: string): Contract => {
  return new Contract(proxyAddress, ProxyABI, signer)
}

export const getCurrentSphinxActionType = (
  bundle: SphinxActionBundle,
  actionsExecuted: ethers.BigNumber
): SphinxActionType => {
  return bundle.actions[actionsExecuted.toNumber()].action.actionType
}

export const isContractDeployed = async (
  address: string,
  provider: providers.Provider
): Promise<boolean> => {
  return (await provider.getCode(address)) !== '0x'
}

export const formatEther = (
  amount: ethers.BigNumber,
  decimals: number
): string => {
  return parseFloat(ethers.utils.formatEther(amount)).toFixed(decimals)
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

  // Create the canonical config network folder if it doesn't already exist.
  if (!fs.existsSync(compilerConfigDirPath)) {
    fs.mkdirSync(compilerConfigDirPath, { recursive: true })
  }

  // Write the canonical config to the local file system. It will exist in a JSON file that has the
  // config URI as its name.
  fs.writeFileSync(
    path.join(compilerConfigDirPath, `${ipfsHash}.json`),
    JSON.stringify(compilerConfig, null, 2)
  )
}

export const getEIP1967ProxyImplementationAddress = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<string> => {
  // keccak256('eip1967.proxy.implementation')) - 1
  // See: https://eips.ethereum.org/EIPS/eip-1967#specification
  const implStorageKey =
    '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

  const encodedImplAddress = await provider.getStorageAt(
    proxyAddress,
    implStorageKey
  )
  const [decoded] = ethers.utils.defaultAbiCoder.decode(
    ['address'],
    encodedImplAddress
  )
  return decoded
}

export const getEIP1967ProxyAdminAddress = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<string> => {
  // See: https://eips.ethereum.org/EIPS/eip-1967#specification
  const ownerStorageKey =
    '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

  const [ownerAddress] = ethers.utils.defaultAbiCoder.decode(
    ['address'],
    await provider.getStorageAt(proxyAddress, ownerStorageKey)
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
  provider: ethers.providers.Provider,
  overridden: PayableOverrides | TransactionRequest = {}
): Promise<PayableOverrides | TransactionRequest> => {
  const { maxFeePerGas, maxPriorityFeePerGas } = await provider.getFeeData()

  if (
    BigNumber.isBigNumber(maxFeePerGas) &&
    BigNumber.isBigNumber(maxPriorityFeePerGas)
  ) {
    overridden.maxFeePerGas = maxFeePerGas
    overridden.maxPriorityFeePerGas = maxPriorityFeePerGas
  }

  return overridden
}

export const isInternalDefaultProxy = async (
  provider: providers.Provider,
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
  provider: providers.Provider,
  proxyAddress: string
): Promise<boolean> => {
  // We don't consider default proxies to be transparent proxies, even though they share the same
  // interface.
  // TODO: `isInternalDefaultProxy` relies on the `DefaultProxyDeployed` event, which no longer
  // exists. Also, `isInternalDefaultProxy` may not be necessary anymore -- not sure.
  // if ((await isInternalDefaultProxy(provider, proxyAddress)) === true) {
  //   return false
  // }

  // Check if the contract bytecode contains the expected interface
  const bytecode = await provider.getCode(proxyAddress)
  if (!(await bytecodeContainsEIP1967Interface(bytecode))) {
    return false
  }

  // Fetch proxy owner address from storage slot defined by EIP-1967
  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxyAddress)

  // If proxy owner is not a valid address, then proxy type is incompatible
  if (!ethers.utils.isAddress(ownerAddress)) {
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
  provider: providers.Provider,
  proxyAddress: string
): Promise<boolean> => {
  const implementationAddress = await getEIP1967ProxyImplementationAddress(
    provider,
    proxyAddress
  )

  // Check if the contract bytecode contains the expected interface
  const bytecode = await provider.getCode(implementationAddress)
  if (!(await bytecodeContainsUUPSInterface(bytecode))) {
    return false
  }

  // Fetch proxy owner address from storage slot defined by EIP-1967
  const ownerAddress = await getEIP1967ProxyAdminAddress(
    provider,
    implementationAddress
  )

  // If proxy owner is not a valid address, then proxy type is incompatible
  if (!ethers.utils.isAddress(ownerAddress)) {
    return false
  }

  return true
}

export const bytecodeContainsUUPSInterface = (bytecode: string): boolean => {
  return bytecodeContainsInterface(bytecode, ['upgradeTo'])
}

export const bytecodeContainsEIP1967Interface = (bytecode: string): boolean => {
  return bytecodeContainsInterface(bytecode, [
    'implementation',
    'admin',
    'upgradeTo',
    'changeAdmin',
  ])
}

/**
 * @param bytecode The bytecode of the contract to check the interface of.
 * @returns True if the contract contains the expected interface and false if not.
 */
const bytecodeContainsInterface = (
  bytecode: string,
  checkFunctions: string[]
): boolean => {
  // Fetch proxy bytecode and check if it contains the expected EIP-1967 function definitions
  const iface = new ethers.utils.Interface(ProxyABI)
  for (const func of checkFunctions) {
    const sigHash = remove0x(iface.getSighash(func))
    if (!bytecode.includes(sigHash)) {
      return false
    }
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

export const getConstructorArgs = (
  constructorArgs: ParsedConfigVariables,
  abi: Array<Fragment>
): Array<ParsedConfigVariable> => {
  const constructorArgValues: Array<ParsedConfigVariable> = []

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )

  if (constructorFragment === undefined) {
    return constructorArgValues
  }

  constructorFragment.inputs.forEach((input) => {
    constructorArgValues.push(constructorArgs[input.name])
  })

  return constructorArgValues
}

export const getCreationCodeWithConstructorArgs = (
  bytecode: string,
  constructorArgs: ParsedConfigVariables,
  abi: ContractArtifact['abi']
): string => {
  const constructorArgValues = getConstructorArgs(constructorArgs, abi)

  const iface = new ethers.utils.Interface(abi)

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

export const getOpenZeppelinValidationOpts = (
  contractConfig: ParsedContractConfig
): Required<ValidationOptions> => {
  type UnsafeAllow = Required<ValidationOptions>['unsafeAllow']

  const unsafeAllow: UnsafeAllow = [
    'state-variable-assignment',
    'constructor',
    'state-variable-immutable',
  ]
  if (contractConfig.unsafeAllow?.delegatecall) {
    unsafeAllow.push('delegatecall')
  }
  if (contractConfig.unsafeAllow?.selfdestruct) {
    unsafeAllow.push('selfdestruct')
  }
  if (contractConfig.unsafeAllow?.missingPublicUpgradeTo) {
    unsafeAllow.push('missing-public-upgradeto')
  }

  const { renames, skipStorageCheck } = contractConfig.unsafeAllow

  const options = {
    kind: toOpenZeppelinContractKind(contractConfig.kind),
    unsafeAllow,
    unsafeAllowRenames: renames,
    unsafeSkipStorageCheck: skipStorageCheck,
  }

  return withValidationDefaults(options)
}

export const getOpenZeppelinUpgradableContract = (
  fullyQualifiedName: string,
  compilerInput: CompilerInput,
  compilerOutput: CompilerOutput,
  contractConfig: ParsedContractConfig
): UpgradeableContract => {
  const options = getOpenZeppelinValidationOpts(contractConfig)

  // In addition to doing validation the `getOpenZeppelinUpgradableContract` function also outputs some warnings related to
  // the provided override options. We want to output our own warnings, so we temporarily disable console.error.
  const tmp = console.error
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.error = () => {}

  // fetch the contract and validate
  // We use a try catch and then rethrow any errors because we temporarily disabled console.error
  try {
    const contract = new UpgradeableContract(
      fullyQualifiedName,
      compilerInput,
      // Without converting the `compilerOutput` type to `any`, OpenZeppelin throws an error due
      // to the `SolidityStorageLayout` type that we've added to Hardhat's `CompilerOutput` type.
      // Converting this type to `any` shouldn't impact anything since we use Hardhat's default
      // `CompilerOutput`, which is what OpenZeppelin expects.
      compilerOutput as any,
      options
    )
    // revert to standard console.error
    console.error = tmp
    return contract
  } catch (e) {
    throw e
  }
}

export const getPreviousConfigUri = async (
  provider: providers.Provider,
  registry: ethers.Contract,
  proxyAddress: string
): Promise<string | undefined> => {
  const proxyUpgradedRegistryEvents = await registry.queryFilter(
    registry.filters.EventAnnouncedWithData('ProxyUpgraded', null, proxyAddress)
  )

  const latestRegistryEvent = proxyUpgradedRegistryEvents.at(-1)

  if (latestRegistryEvent === undefined) {
    return undefined
  } else if (latestRegistryEvent.args === undefined) {
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
  } else if (latestExecutionEvent.args === undefined) {
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
  // Generate an artifact for each contract in the Sphinx config.
  for (const [referenceName, contractConfig] of Object.entries(
    compilerConfig.contracts
  )) {
    // Split the contract's fully qualified name into its source name and contract name.
    const [sourceName, contractName] = contractConfig.contract.split(':')

    for (const buildInfo of solcArray) {
      const contractOutput =
        buildInfo.output.contracts[sourceName][contractName]

      if (contractOutput !== undefined) {
        artifacts[referenceName] = {
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
    }
  }
  return artifacts
}

export const getDeploymentEvents = async (
  SphinxManager: ethers.Contract,
  deploymentId: string
): Promise<ethers.Event[]> => {
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
    SphinxManager.filters.ContractDeployed(null, null, deploymentId),
    approvalEvent.blockNumber,
    completedEvent.blockNumber
  )

  return contractDeployedEvents
}

/**
 * Returns true and only if the variable is a valid ethers DataHexString:
 * https://docs.ethers.org/v5/api/utils/bytes/#DataHexString
 */
export const isDataHexString = (variable: any): boolean => {
  return ethers.utils.isHexString(variable) && variable.length % 2 === 0
}

export const getNetworkType = async (
  provider: providers.JsonRpcProvider
): Promise<NetworkType> => {
  try {
    // This RPC method will throw an error on live networks, but won't throw an error on Hardhat or
    // Anvil, including forked networks. It doesn't throw an error on Anvil because the `anvil_`
    // namespace is an alias for `hardhat_`. Source:
    // https://book.getfoundry.sh/reference/anvil/#custom-methods
    await provider.send('hardhat_impersonateAccount', [
      ethers.constants.AddressZero,
    ])
  } catch (err) {
    return NetworkType.LIVE_NETWORK
  }

  try {
    // This RPC method will throw an error on Hardhat but not Anvil. This includes forked networks.
    await provider.send('anvil_impersonateAccount', [
      ethers.constants.AddressZero,
    ])
    return NetworkType.ANVIL
  } catch (err) {
    return NetworkType.HARDHAT
  }
}

export const getImpersonatedSigner = async (
  address: string,
  provider: providers.JsonRpcProvider
): Promise<providers.JsonRpcSigner> => {
  // This RPC method works for anvil too, since it's an alias for 'anvil_impersonateAccount'.
  await provider.send('hardhat_impersonateAccount', [address])

  return provider.getSigner(address)
}

/**
 * Checks if one of the `DEPLOY_CONTRACT` actions reverts. This does not guarantee that the
 * deployment will or will not revert, but it will return the correct result in most cases.
 */
export const deploymentDoesRevert = async (
  provider: ethers.providers.JsonRpcProvider,
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
          data: action.code,
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
  provider: providers.Provider,
  spinner: ora.Ora
) => {
  if (!ethers.utils.isAddress(newOwnerAddress)) {
    throw new Error(`Invalid address for new project owner: ${newOwnerAddress}`)
  }

  if (newOwnerAddress !== currOwnerAddress) {
    spinner.start(`Transferring project ownership to: ${newOwnerAddress}`)
    if (newOwnerAddress === ethers.constants.AddressZero) {
      // We must call a separate function if ownership is being transferred to address(0).
      await (
        await manager.renounceOwnership(await getGasPriceOverrides(provider))
      ).wait()
    } else {
      await (
        await manager.transferOwnership(
          newOwnerAddress,
          await getGasPriceOverrides(provider)
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
  abi: Array<Fragment>
): string => {
  const implInitCode = getCreationCodeWithConstructorArgs(
    bytecode,
    constructorArgs,
    abi
  )
  const implSalt = ethers.utils.keccak256(implInitCode)
  return getCreate3Address(managerAddress, implSalt)
}

export const execAsync = promisify(exec)

export const getDuplicateElements = (arr: Array<string>): Array<string> => {
  return [...new Set(arr.filter((e, i, a) => a.indexOf(e) !== i))]
}

/**
 * @notice Gets various fields related to the Sphinx config from the back-end if it exists.
 * If it doesn't exist, it returns a new canonicalConfigFolderPath with default parameters for the config
 * options.
 *
 * @returns {chainIds, prevConfig, isNewConfig} where the `chainIds` array contains the chain IDs
 * in the current config. The `prevConfig` variable is the most recent CanonicalConfig,
 * which is fetched from the back-end. Lastly, `isNewConfig` is true if the `prevConfig` is a new
 * config, i.e. it has not been used to setup the project on any chain.
 */
export const getProjectConfigInfo = async (
  getCanonicalConfig: GetCanonicalConfig,
  userConfig: UserConfigWithOptions,
  isTestnet: boolean,
  apiKey: string,
  cre: SphinxRuntimeEnvironment,
  failureAction: FailureAction
): Promise<{
  chainIds: Array<number>
  prevConfig: CanonicalConfig
  isNewConfig: boolean
}> => {
  assertValidConfigOptions(userConfig.options, cre, failureAction)
  const parsedConfigOptions = parseConfigOptions(userConfig.options, isTestnet)

  const { projectName } = userConfig

  const prevConfig = await getCanonicalConfig(
    parsedConfigOptions.orgId,
    isTestnet,
    apiKey,
    userConfig.projectName
  )

  if (prevConfig) {
    return {
      prevConfig,
      isNewConfig: false,
      chainIds: parsedConfigOptions.chainIds,
    }
  } else {
    const { owners, threshold, chainIds, orgId } = parsedConfigOptions
    const auth = getAuthAddress(owners, threshold, projectName)
    const manager = getSphinxManagerAddress(auth, projectName)
    const emptyConfig = getEmptyCanonicalConfig(
      chainIds,
      manager,
      orgId,
      projectName
    )
    return { prevConfig: emptyConfig, isNewConfig: true, chainIds }
  }
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
        `Unauthorized, please check your API key and Org Id are correct`
      )
    } else if (e.response.status === 409) {
      throw new Error(
        `Unsupported network, please report this to the developers`
      )
    } else if (e.response.status === 500) {
      throw new Error(
        `Internal server error, please report this to the developers`
      )
    }
  }
}

export const relayIPFSCommit = async (
  apiKey: string,
  orgId: string,
  ipfsCommitRequest: Array<CompilerConfig>
): Promise<IPFSCommitResponse> => {
  const response = await axios.post(`${fetchSphinxManagedBaseUrl()}/api/pin`, {
    apiKey,
    orgId,
    ipfsData: ipfsCommitRequest.map((el) => JSON.stringify(el, null, 2)),
  })

  if (response.status === 400) {
    throw new Error(
      'Malformed request pinning to IPFS, please report this to the developers'
    )
  } else if (response.status === 401) {
    throw new Error(
      `Unauthorized, please check your API key and Org Id are correct`
    )
  }

  return response.data
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
      threshold: 0,
      proposers: [],
    },
    contracts: {},
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
export const toCanonicalConfig = async (
  parsedConfig: ParsedConfigWithOptions,
  managerAddress: string,
  authAddress: string,
  rpcProviders: Record<string, ethers.providers.JsonRpcProvider>
): Promise<CanonicalConfig> => {
  const { projectName } = parsedConfig
  const chainStates = {}

  for (const chainId of parsedConfig.options.chainIds) {
    const network = findNetwork(chainId)

    if (!network) {
      throw new Error(`Unsupported chain ID: ${chainId}`)
    }
    const provider = rpcProviders[network]
    if (!parsedConfig.options.chainIds.includes(chainId)) {
      throw new Error(
        `Chain ID ${chainId} corresponds to an RPC provider but does not exist in the parsed config.`
      )
    }

    const Auth = new ethers.Contract(authAddress, AuthABI, provider)
    const firstProposalOccurred = await Auth.firstProposalOccurred()

    const projectCreated = await isProjectCreated(provider, Auth.address)

    chainStates[chainId] = {
      firstProposalOccurred,
      projectCreated,
    }
  }

  return {
    projectName,
    manager: managerAddress,
    options: parsedConfig.options,
    contracts: parsedConfig.contracts,
    chainStates,
  }
}

export const getAuthLeafs = async (
  userConfig: UserConfigWithOptions,
  prevConfig: CanonicalConfig,
  rpcProviders: {
    [network: string]: ethers.providers.JsonRpcProvider
  },
  managerAddress: string,
  networks: Array<string>,
  isTestnet: boolean,
  cre: SphinxRuntimeEnvironment,
  getConfigArtifacts: GetConfigArtifacts
): Promise<Array<AuthLeaf>> => {
  const leafs: Array<AuthLeaf> = []
  for (const network of networks) {
    const provider = rpcProviders[network]

    const { parsedConfig, configCache, configArtifacts } =
      await getParsedConfigWithOptions(
        userConfig,
        managerAddress,
        isTestnet,
        provider,
        cre,
        getConfigArtifacts
      )

    const chainId = SUPPORTED_NETWORKS[network]
    const leafsForChain = await getAuthLeafsForChain(
      chainId,
      parsedConfig,
      configArtifacts,
      configCache,
      prevConfig
    )
    leafs.push(...leafsForChain)
  }
  return leafs
}

export const isProjectCreated = async (
  provider: providers.Provider,
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

export const arraysEqual = (a: Array<any>, b: Array<any>): boolean => {
  if (a.length !== b.length) {
    return false
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
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
  provider: ethers.providers.Provider,
  networkType: NetworkType
): Promise<{
  networkName: string
  chainId: number
}> => {
  const { chainId, name } = await provider.getNetwork()
  if (name !== 'unknown') {
    return { chainId, networkName: name }
  } else {
    // The network name could be 'unknown' on a supported network, e.g. gnosis-chiado. We check if
    // the chain ID matches a supported network and use the network name if it does.
    const supportedNetwork = Object.entries(SUPPORTED_NETWORKS).find(
      ([, supportedChainId]) => supportedChainId === chainId
    )
    if (supportedNetwork) {
      return { chainId, networkName: supportedNetwork[0] }
    } else if (networkType === NetworkType.ANVIL) {
      return { chainId, networkName: 'anvil' }
    } else if (networkType === NetworkType.HARDHAT) {
      return { chainId, networkName: 'hardhat' }
    } else {
      // The network is an unsupported live network.
      throw new Error(`Unsupported network: ${chainId}`)
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
  networkType: NetworkType,
  chainId: number
): string => {
  if (networkType === NetworkType.LIVE_NETWORK) {
    return networkName
  } else if (Object.keys(SUPPORTED_NETWORKS).includes(networkName)) {
    return `${networkName}-local`
  } else {
    const localNetworkName =
      networkType === NetworkType.ANVIL ? 'anvil' : 'hardhat'
    return `${localNetworkName}-${chainId}`
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
 * 3. `<hardhat/anvil> (chain ID: <chainId>)` otherwise. This will occur on standard Hardhat/Anvil nodes. For
 * example, 'hardhat-31337'.
 */
export const getNetworkTag = (
  networkName: string,
  networkType: NetworkType,
  chainId: number
): string => {
  if (networkType === NetworkType.LIVE_NETWORK) {
    return networkName
  } else if (Object.keys(SUPPORTED_NETWORKS).includes(networkName)) {
    return `${networkName} (local)`
  } else {
    const localNetworkType =
      networkType === NetworkType.ANVIL ? 'anvil' : 'hardhat'
    return `${localNetworkType} (chain ID: ${chainId})`
  }
}

export const getNetworkNameForChainId = (chainId: number): string => {
  const network = Object.keys(SUPPORTED_NETWORKS).find(
    (n) => SUPPORTED_NETWORKS[n] === chainId
  )

  if (!network) {
    throw new Error(`Unsupported chain ID: ${chainId}`)
  }

  return network
}
