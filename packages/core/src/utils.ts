import * as path from 'path'
import * as fs from 'fs'

import ora from 'ora'
import * as semver from 'semver'
import {
  utils,
  Signer,
  Wallet,
  Contract,
  providers,
  ethers,
  PayableOverrides,
  BigNumber,
} from 'ethers'
import { Fragment } from 'ethers/lib/utils'
import {
  ProxyArtifact,
  ChugSplashRegistryABI,
  ChugSplashManagerABI,
  ProxyABI,
  ChugSplashManagerProxyArtifact,
} from '@chugsplash/contracts'
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
  CanonicalChugSplashConfig,
  UserContractKind,
  userContractKinds,
  ParsedChugSplashConfig,
  ParsedContractConfig,
  ContractKind,
  ParsedConfigVariables,
  ConfigArtifacts,
  ParsedConfigVariable,
  ContractKindEnum,
} from './config/types'
import {
  ChugSplashActionBundle,
  ChugSplashActionType,
  ChugSplashBundles,
  DeploymentState,
} from './actions/types'
import { CURRENT_CHUGSPLASH_MANAGER_VERSION, Integration } from './constants'
import { getChugSplashRegistryAddress } from './addresses'
import 'core-js/features/array/at'
import {
  BuildInfo,
  CompilerOutput,
  CompilerOutputContract,
  ContractArtifact,
} from './languages/solidity/types'
import { chugsplashFetchSubtask } from './config/fetch'
import { getSolcBuild } from './languages'
import {
  getDeployContractActions,
  getNumDeployContractActions,
} from './actions/bundle'

export const getDeploymentId = (
  bundles: ChugSplashBundles,
  configUri: string
): string => {
  const actionRoot = bundles.actionBundle.root
  const targetRoot = bundles.targetBundle.root
  const numActions = bundles.actionBundle.actions.length
  const numTargets = bundles.targetBundle.targets.length
  const numNonProxyContracts = getNumDeployContractActions(bundles.actionBundle)

  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'string'],
      [
        actionRoot,
        targetRoot,
        numActions,
        numTargets,
        numNonProxyContracts,
        configUri,
      ]
    )
  )
}

export const writeSnapshotId = async (
  provider: ethers.providers.JsonRpcProvider,
  networkName: string,
  deploymentFolderPath: string
) => {
  const snapshotId = await provider.send('evm_snapshot', [])
  const networkPath = path.join(deploymentFolderPath, networkName)
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }
  const snapshotIdPath = path.join(networkPath, '.snapshotId')
  fs.writeFileSync(snapshotIdPath, snapshotId)
}

export const writeDeploymentFolderForNetwork = (
  networkName: string,
  deploymentFolderPath: string
) => {
  const networkPath = path.join(deploymentFolderPath, networkName)
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }
}

export const writeDeploymentArtifact = (
  networkName: string,
  deploymentFolderPath: string,
  artifact: any,
  referenceName: string
) => {
  const artifactPath = path.join(
    deploymentFolderPath,
    networkName,
    `${referenceName}.json`
  )
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, '\t'))
}

/**
 * Returns the address of a default proxy used by ChugSplash, which is calculated as a function of
 * the organizationID and the corresponding contract's reference name. Note that a default proxy will
 * NOT be used if the user defines their own proxy address in the ChugSplash config via the `proxy`
 * attribute.
 *
 * @param organizationID ID of the organization.
 * @param referenceName Reference name of the contract that corresponds to the proxy.
 * @returns Address of the default EIP-1967 proxy used by ChugSplash.
 */
export const getDefaultProxyAddress = (
  organizationID: string,
  projectName: string,
  referenceName: string
): string => {
  const chugSplashManagerAddress = getChugSplashManagerAddress(organizationID)

  const salt = utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['string', 'string'],
      [projectName, referenceName]
    )
  )

  return utils.getCreate2Address(
    chugSplashManagerAddress,
    salt,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ProxyArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [chugSplashManagerAddress]),
      ]
    )
  )
}

export const checkIsUpgrade = async (
  provider: ethers.providers.Provider,
  parsedConfig: ParsedChugSplashConfig
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

export const getManagerProxyBytecodeHash = (): string => {
  return utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ChugSplashManagerProxyArtifact.bytecode,
      utils.defaultAbiCoder.encode(
        ['address', 'address'],
        [getChugSplashRegistryAddress(), getChugSplashRegistryAddress()]
      ),
    ]
  )
}

export const getChugSplashManagerAddress = (organizationID: string) => {
  return utils.getCreate2Address(
    getChugSplashRegistryAddress(),
    organizationID,
    getManagerProxyBytecodeHash()
  )
}

/**
 * Finalizes the registration of an organization ID.
 *
 * @param Provider Provider corresponding to the signer that will execute the transaction.
 * @param organizationID ID of the organization.
 * @param newOwnerAddress Owner of the ChugSplashManager contract deployed by this call.
 * @returns True if the organization ID was already registered for the first time in this call, and
 * false if the project was already registered by the caller.
 */
export const finalizeRegistration = async (
  registry: ethers.Contract,
  manager: ethers.Contract,
  organizationID: string,
  newOwnerAddress: string,
  allowManagedProposals: boolean,
  provider: providers.JsonRpcProvider,
  spinner: ora.Ora
): Promise<void> => {
  spinner.start(`Claiming the project...`)

  if (!(await isProjectClaimed(registry, manager.address))) {
    // Encode the initialization arguments for the ChugSplashManager contract.
    // Note: Future versions of ChugSplash may require different arguments encoded in this way.
    const initializerData = ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'bool'],
      [newOwnerAddress, organizationID, allowManagedProposals]
    )

    await (
      await registry.finalizeRegistration(
        organizationID,
        newOwnerAddress,
        Object.values(CURRENT_CHUGSPLASH_MANAGER_VERSION),
        initializerData,
        await getGasPriceOverrides(provider)
      )
    ).wait()
  } else {
    const existingOwnerAddress = await manager.owner()
    if (existingOwnerAddress !== newOwnerAddress) {
      throw new Error(`Project already owned by: ${existingOwnerAddress}.`)
    } else {
      spinner.succeed(`Project was already claimed by the caller.`)
    }
  }
}

export const getChugSplashRegistry = (signer: Signer): Contract => {
  return new Contract(
    getChugSplashRegistryAddress(),
    ChugSplashRegistryABI,
    signer
  )
}

export const getChugSplashRegistryReadOnly = (
  provider: providers.Provider
): Contract => {
  return new Contract(
    getChugSplashRegistryAddress(),
    ChugSplashRegistryABI,
    provider
  )
}

export const getChugSplashManager = (
  signer: Signer,
  organizationID: string
) => {
  return new Contract(
    getChugSplashManagerAddress(organizationID),
    ChugSplashManagerABI,
    signer
  )
}

export const getChugSplashManagerReadOnly = (
  provider: providers.Provider,
  organizationID: string
) => {
  return new Contract(
    getChugSplashManagerAddress(organizationID),
    ChugSplashManagerABI,
    provider
  )
}

export const chugsplashLog = (
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
  parsedConfig: ParsedChugSplashConfig,
  silent: boolean
) => {
  const managerAddress = getChugSplashManagerAddress(
    parsedConfig.options.organizationID
  )
  if (!silent) {
    const deployments = {}
    Object.entries(parsedConfig.contracts).forEach(
      ([referenceName, contractConfig], i) => {
        // if contract is an unproxied, then we must resolve its true address
        const address =
          contractConfig.kind !== 'no-proxy'
            ? contractConfig.address
            : getCreate3Address(managerAddress, contractConfig.salt)

        deployments[i + 1] = {
          Contract: referenceName,
          Address: address,
        }
      }
    )
    console.table(deployments)
  }
}

export const claimExecutorPayment = async (
  executor: Wallet,
  ChugSplashManager: Contract
) => {
  // The amount to withdraw is the minimum of the executor's debt and the ChugSplashManager's
  // balance.
  const debt = BigNumber.from(
    await ChugSplashManager.executorDebt(executor.address)
  )
  const balance = BigNumber.from(
    await executor.provider.getBalance(ChugSplashManager.address)
  )
  const withdrawAmount = debt.lt(balance) ? debt : balance

  if (withdrawAmount.gt(0)) {
    await (
      await ChugSplashManager.claimExecutorPayment(
        withdrawAmount,
        await getGasPriceOverrides(executor.provider)
      )
    ).wait()
  }
}

export const getProxyAt = (signer: Signer, proxyAddress: string): Contract => {
  return new Contract(proxyAddress, ProxyABI, signer)
}

export const getCurrentChugSplashActionType = (
  bundle: ChugSplashActionBundle,
  actionsExecuted: ethers.BigNumber
): ChugSplashActionType => {
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

export const readCanonicalConfig = async (
  canonicalConfigFolderPath: string,
  configUri: string
): Promise<CanonicalChugSplashConfig | undefined> => {
  const ipfsHash = configUri.replace('ipfs://', '')

  // Check that the file containing the canonical config exists.
  const configFilePath = path.join(
    canonicalConfigFolderPath,
    `${ipfsHash}.json`
  )
  if (!fs.existsSync(configFilePath)) {
    return undefined
  }

  return JSON.parse(fs.readFileSync(configFilePath, 'utf8'))
}

export const writeCanonicalConfig = (
  canonicalConfigFolderPath: string,
  configUri: string,
  canonicalConfig: CanonicalChugSplashConfig
) => {
  const ipfsHash = configUri.replace('ipfs://', '')

  // Create the canonical config network folder if it doesn't already exist.
  if (!fs.existsSync(canonicalConfigFolderPath)) {
    fs.mkdirSync(canonicalConfigFolderPath, { recursive: true })
  }

  // Write the canonical config to the local file system. It will exist in a JSON file that has the
  // config URI as its name.
  fs.writeFileSync(
    path.join(canonicalConfigFolderPath, `${ipfsHash}.json`),
    JSON.stringify(canonicalConfig, null, 2)
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

export const isProjectClaimed = async (
  registry: ethers.Contract,
  managerAddress: string
) => {
  return registry.managerProxies(managerAddress)
}

export const isInternalDefaultProxy = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<boolean> => {
  const ChugSplashRegistry = new Contract(
    getChugSplashRegistryAddress(),
    ChugSplashRegistryABI,
    provider
  )

  const actionExecutedEvents = await ChugSplashRegistry.queryFilter(
    ChugSplashRegistry.filters.EventAnnouncedWithData(
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
  if ((await isInternalDefaultProxy(provider, proxyAddress)) === true) {
    return false
  }

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
 * a ChugSplash compatible UUPS proxy.
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

const bytecodeContainsUUPSInterface = async (
  bytecode: string
): Promise<boolean> => {
  return bytecodeContainsInterface(bytecode, ['upgradeTo'])
}

const bytecodeContainsEIP1967Interface = async (
  bytecode: string
): Promise<boolean> => {
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
const bytecodeContainsInterface = async (
  bytecode: string,
  checkFunctions: string[]
): Promise<boolean> => {
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

  validateBuildInfo(buildInfo)

  return buildInfo
}

export const validateBuildInfo = (buildInfo: BuildInfo): void => {
  if (!semver.satisfies(buildInfo.solcVersion, '>0.5.x <0.9.x')) {
    throw new Error(
      `Storage layout for Solidity version ${buildInfo.solcVersion} not yet supported. Sorry!`
    )
  }

  if (
    !buildInfo.input.settings.outputSelection['*']['*'].includes(
      'storageLayout'
    )
  ) {
    throw new Error(
      `Did you forget to set the "storageLayout" compiler option in your Hardhat/Foundry config file?`
    )
  }

  if (
    !buildInfo.input.settings.outputSelection['*']['*'].includes(
      'evm.gasEstimates'
    )
  ) {
    throw new Error(
      `Did you forget to set the "evm.gasEstimates" compiler option in your Hardhat/Foundry config file?`
    )
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

export const getNonProxyCreate3Salt = (
  projectName: string,
  referenceName: string,
  userSalt: string
): string => {
  return utils.solidityKeccak256(
    ['string', 'string', 'bytes32'],
    [projectName, referenceName, userSalt]
  )
}

/**
 * Returns the Create3 address of a non-proxy contract deployed by ChugSplash, which is calculated
 * as a function of the ChugSplashManager address, the project name, the contract's reference name,
 * and an optional 32-byte salt provided by the user. Note that the contract may
 * not yet be deployed at this address since it's calculated via Create3.
 *
 * @returns Address of the contract.
 */
export const getCreate3Address = (
  managerAddress: string,
  salt: string
): string => {
  // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the `CREATE3.sol`
  // library for details.
  const proxyBytecode = '0x67363d3d37363d34f03d5260086018f3'

  const proxyAddress = utils.getCreate2Address(
    managerAddress,
    salt,
    utils.keccak256(proxyBytecode)
  )

  const addressHash = utils.keccak256(
    utils.hexConcat(['0xd694', proxyAddress, '0x01'])
  )

  // Return the last 20 bytes of the address hash
  const last20Bytes = utils.hexDataSlice(addressHash, 12)

  // Return the checksum address
  return ethers.utils.getAddress(last20Bytes)
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
    contractKind === 'internal-default' ||
    contractKind === 'external-default' ||
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
    ChugSplashManagerABI,
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

export const fetchAndCacheCanonicalConfig = async (
  configUri: string,
  canonicalConfigFolderPath: string
): Promise<CanonicalChugSplashConfig> => {
  const localCanonicalConfig = await readCanonicalConfig(
    canonicalConfigFolderPath,
    configUri
  )
  if (localCanonicalConfig) {
    return localCanonicalConfig
  } else {
    const remoteCanonicalConfig =
      await callWithTimeout<CanonicalChugSplashConfig>(
        chugsplashFetchSubtask({ configUri }),
        30000,
        'Failed to fetch config file from IPFS'
      )

    // Cache the canonical config by saving it to the local filesystem.
    writeCanonicalConfig(
      canonicalConfigFolderPath,
      configUri,
      remoteCanonicalConfig
    )
    return remoteCanonicalConfig
  }
}

export const getConfigArtifactsRemote = async (
  canonicalConfig: CanonicalChugSplashConfig
): Promise<ConfigArtifacts> => {
  const solcArray: BuildInfo[] = []
  // Get the compiler output for each compiler input.
  for (const chugsplashInput of canonicalConfig.inputs) {
    const solcBuild: SolcBuild = await getSolcBuild(chugsplashInput.solcVersion)
    let compilerOutput: CompilerOutput
    if (solcBuild.isSolcJs) {
      const compiler = new Compiler(solcBuild.compilerPath)
      compilerOutput = await compiler.compile(chugsplashInput.input)
    } else {
      const compiler = new NativeCompiler(solcBuild.compilerPath)
      compilerOutput = await compiler.compile(chugsplashInput.input)
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
          `Failed to compile. Please report this error to ChugSplash.\n` +
            `${formattedErrorMessages}`
        )
      }
    }

    solcArray.push({
      input: chugsplashInput.input,
      output: compilerOutput,
      id: chugsplashInput.id,
      solcLongVersion: chugsplashInput.solcLongVersion,
      solcVersion: chugsplashInput.solcVersion,
    })
  }

  const artifacts: ConfigArtifacts = {}
  // Generate an artifact for each contract in the ChugSplash config.
  for (const [referenceName, contractConfig] of Object.entries(
    canonicalConfig.contracts
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
  ChugSplashManager: ethers.Contract,
  deploymentId: string
): Promise<ethers.Event[]> => {
  // Get the most recetn approval event for this deployment ID.
  const approvalEvent = (
    await ChugSplashManager.queryFilter(
      ChugSplashManager.filters.ChugSplashDeploymentApproved(deploymentId)
    )
  ).at(-1)

  if (!approvalEvent) {
    throw new Error(
      `No approval event found for deployment ID ${deploymentId}. Should never happen.`
    )
  }

  const completedEvent = (
    await ChugSplashManager.queryFilter(
      ChugSplashManager.filters.ChugSplashDeploymentCompleted(deploymentId)
    )
  ).at(-1)

  if (!completedEvent) {
    throw new Error(
      `No deployment completed event found for deployment ID ${deploymentId}. Should never happen.`
    )
  }

  const proxyDeployedEvents = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.DefaultProxyDeployed(null, null, deploymentId),
    approvalEvent.blockNumber,
    completedEvent.blockNumber
  )

  const contractDeployedEvents = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.ContractDeployed(null, null, deploymentId),
    approvalEvent.blockNumber,
    completedEvent.blockNumber
  )

  return proxyDeployedEvents.concat(contractDeployedEvents)
}

export const getChainId = async (
  provider: ethers.providers.Provider
): Promise<number> => {
  const network = await provider.getNetwork()
  return network.chainId
}

/**
 * Returns true and only if the variable is a valid ethers DataHexString:
 * https://docs.ethers.org/v5/api/utils/bytes/#DataHexString
 */
export const isDataHexString = (variable: any): boolean => {
  return ethers.utils.isHexString(variable) && variable.length % 2 === 0
}

/**
 * @notice Returns true if the current network is the local Hardhat network. Returns false if the
 * current network is a forked or live network.
 */
export const isLocalNetwork = async (
  provider: providers.JsonRpcProvider
): Promise<boolean> => {
  try {
    // This RPC method will throw an error on live networks.
    await provider.send('hardhat_impersonateAccount', [
      ethers.constants.AddressZero,
    ])
  } catch (err) {
    // We're on a live network, so return false.
    return false
  }

  try {
    if (await isHardhatFork(provider)) {
      return false
    }
  } catch (e) {
    return true
  }

  return true
}

export const isHardhatFork = async (
  provider: providers.JsonRpcProvider
): Promise<boolean> => {
  const metadata = await provider.send('hardhat_metadata', [])
  return metadata.forkedNetwork !== undefined
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
  actionBundle: ChugSplashActionBundle,
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

export const getDeployedCreationCodeWithArgsHash = async (
  manager: ethers.Contract,
  referenceName: string,
  contractAddress: string
): Promise<string | undefined> => {
  const latestDeploymentEvent = (
    await manager.queryFilter(
      manager.filters.ContractDeployed(referenceName, contractAddress)
    )
  ).at(-1)

  if (!latestDeploymentEvent || !latestDeploymentEvent.args) {
    return undefined
  } else {
    return latestDeploymentEvent.args.creationCodeWithArgsHash
  }
}

// Transfer ownership of the ChugSplashManager if a new project owner has been specified.
export const transferProjectOwnership = async (
  manager: ethers.Contract,
  newOwnerAddress: string,
  provider: providers.Provider,
  spinner: ora.Ora
) => {
  if (!ethers.utils.isAddress(newOwnerAddress)) {
    throw new Error(`Invalid address for new project owner: ${newOwnerAddress}`)
  }

  if (newOwnerAddress !== (await manager.owner())) {
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

export const toContractKindEnum = (kind: ContractKind): ContractKindEnum => {
  switch (kind) {
    case 'oz-transparent':
      return ContractKindEnum.OZ_TRANSPARENT
    case 'oz-ownable-uups':
      return ContractKindEnum.OZ_OWNABLE_UUPS
    case 'oz-access-control-uups':
      return ContractKindEnum.OZ_ACCESS_CONTROL_UUPS
    case 'external-default':
      return ContractKindEnum.EXTERNAL_DEFAULT
    case 'no-proxy':
      return ContractKindEnum.NO_PROXY
    case 'internal-default':
      return ContractKindEnum.INTERNAL_DEFAULT
    default:
      throw new Error(`Invalid contract kind: ${kind}`)
  }
}

export const getEstDeployContractCost = (
  gasEstimates: CompilerOutputContract['evm']['gasEstimates']
): BigNumber => {
  const { totalCost, codeDepositCost } = gasEstimates.creation

  if (totalCost === 'infinite') {
    // The `totalCost` is 'infinite' if the contract has a constructor. This is because the Solidity
    // compiler can't determine the cost of the deployment since the constructor can contain
    // arbitrary logic. In this case, we use the `executionCost` along a buffer multiplier of 1.5.
    return BigNumber.from(codeDepositCost).mul(3).div(2)
  } else {
    return BigNumber.from(totalCost)
  }
}
