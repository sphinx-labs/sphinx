import * as path from 'path'
import * as fs from 'fs'

import * as semver from 'semver'
import {
  utils,
  constants,
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
  ChugSplashManagerProxyArtifact,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  ProxyABI,
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
  CHUGSPLASH_RECORDER_ADDRESS,
  ChugSplashRecorderABI,
} from '@chugsplash/contracts'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { add0x, remove0x } from '@eth-optimism/core-utils'
import {
  ProxyDeployment,
  StorageLayout,
  UpgradeableContract,
  ValidationOptions,
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
  CanonicalConfigArtifacts,
  ExternalProxyType,
  externalProxyTypes,
  ParsedChugSplashConfig,
  ParsedConfigVariable,
  ParsedConfigVariables,
  ParsedContractConfig,
  ProxyType,
  UserConfigVariable,
  UserContractConfig,
} from './config/types'
import { ChugSplashActionBundle, ChugSplashActionType } from './actions/types'
import { Integration } from './constants'
import 'core-js/features/array/at'
import { FoundryContractArtifact } from './types'
import {
  ContractArtifact,
  ContractASTNode,
  CompilerOutputSources,
  BuildInfo,
  CompilerOutput,
} from './languages/solidity/types'
import { chugsplashFetchSubtask } from './config/fetch'
import { getSolcBuild } from './languages'

export const computeBundleId = (
  actionRoot: string,
  targetRoot: string,
  numActions: number,
  numTargets: number,
  configUri: string
): string => {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'uint256', 'string'],
      [actionRoot, targetRoot, numActions, numTargets, configUri]
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

export const createDeploymentFolderForNetwork = (
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
 * the projectName and the corresponding contract's reference name. Note that a default proxy will
 * NOT be used if the user defines their own proxy address in the ChugSplash config via the `proxy`
 * attribute.
 *
 * @param projectName Name of the ChugSplash project.
 * @param referenceName Reference name of the contract that corresponds to the proxy.
 * @returns Address of the default EIP-1967 proxy used by ChugSplash.
 */
export const getDefaultProxyAddress = (
  projectName: string,
  referenceName: string
): string => {
  // const chugSplashManagerAddress = getChugSplashManagerAddress(projectName)
  const chugSplashManagerAddress = getChugSplashManagerProxyAddress(projectName)

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
    if (await isContractDeployed(contractConfig.proxy, provider)) {
      return referenceName
    }
  }
  return false
}

export const getChugSplashManagerProxyAddress = (organizationID: string) => {
  if (organizationID === 'ChugSplash') {
    return ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS
  } else {
    return utils.getCreate2Address(
      CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
      organizationID,
      utils.solidityKeccak256(
        ['bytes', 'bytes'],
        [
          ChugSplashManagerProxyArtifact.bytecode,
          utils.defaultAbiCoder.encode(
            ['address', 'address'],
            [
              CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
              CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
            ]
          ),
        ]
      )
    )
  }
}

/**
 * Registers a new ChugSplash project.
 *
 * @param Provider Provider corresponding to the signer that will execute the transaction.
 * @param projectName Name of the created project.
 * @param projectOwner Owner of the ChugSplashManager contract deployed by this call.
 * @returns True if the project was registered for the first time in this call, and false if the
 * project was already registered by the caller.
 */
export const registerChugSplashProject = async (
  provider: providers.JsonRpcProvider,
  signer: Signer,
  signerAddress: string,
  organizationID: string,
  projectName: string,
  projectOwner: string,
  allowManagedProposals: boolean
): Promise<boolean> => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)

  if (
    (await ChugSplashRegistry.projects(organizationID)) ===
    constants.AddressZero
  ) {
    await (
      await ChugSplashRegistry.register(
        organizationID,
        projectOwner,
        allowManagedProposals,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    return true
  } else {
    const existingProjectOwner = await getProjectOwnerAddress(
      signer,
      projectName
    )
    if (existingProjectOwner !== signerAddress) {
      throw new Error(`Project already owned by: ${existingProjectOwner}.`)
    } else {
      return false
    }
  }
}

export const getProjectOwnerAddress = async (
  signer: Signer,
  projectName: string
): Promise<string> => {
  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const ownershipTransferredEvents = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.OwnershipTransferred()
  )

  const latestEvent = ownershipTransferredEvents.at(-1)

  if (latestEvent === undefined) {
    throw new Error(`Could not find OwnershipTransferred event.`)
  } else if (latestEvent.args === undefined) {
    throw new Error(`No args found for OwnershipTransferred event.`)
  }

  // Get the most recent owner from the list of events
  const projectOwner = latestEvent.args.newOwner

  return projectOwner
}

export const getChugSplashRegistry = (
  signerOrProvider: Signer | providers.Provider
): Contract => {
  return new Contract(
    // CHUGSPLASH_REGISTRY_ADDRESS,
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    ChugSplashRegistryABI,
    signerOrProvider
  )
}

export const getChugSplashManager = (signer: Signer, projectName: string) => {
  return new Contract(
    getChugSplashManagerProxyAddress(projectName),
    ChugSplashManagerABI,
    signer
  )
}

export const getChugSplashManagerReadOnly = (
  provider: providers.Provider,
  projectName: string
) => {
  return new Contract(
    getChugSplashManagerProxyAddress(projectName),
    ChugSplashManagerABI,
    provider
  )
}

export const chugsplashLog = (text: string, silent: boolean) => {
  if (!silent) {
    console.log(text)
  }
}

export const displayProposerTable = (proposerAddresses: string[]) => {
  const proposers = {}
  proposerAddresses.forEach((address, i) => {
    proposers[i + 1] = {
      Address: address,
    }
  })
  console.table(proposers)
}

export const displayDeploymentTable = (
  parsedConfig: ParsedChugSplashConfig,
  silent: boolean
) => {
  if (!silent) {
    const deployments = {}
    Object.entries(parsedConfig.contracts).forEach(
      ([referenceName, contractConfig], i) => {
        const contractName = contractConfig.contract.includes(':')
          ? contractConfig.contract.split(':').at(-1)
          : contractConfig.contract
        deployments[i + 1] = {
          'Reference Name': referenceName,
          Contract: contractName,
          Address: contractConfig.proxy,
        }
      }
    )
    console.table(deployments)
  }
}

export const generateFoundryTestArtifacts = (
  parsedConfig: ParsedChugSplashConfig
): FoundryContractArtifact[] => {
  const artifacts: {
    referenceName: string
    contractName: string
    contractAddress: string
  }[] = []
  Object.entries(parsedConfig.contracts).forEach(
    ([referenceName, contractConfig], i) =>
      (artifacts[i] = {
        referenceName,
        contractName: contractConfig.contract.split(':')[1],
        contractAddress: contractConfig.proxy,
      })
  )
  return artifacts
}

export const claimExecutorPayment = async (
  executor: Wallet,
  ChugSplashManager: Contract
) => {
  const executorDebt = await ChugSplashManager.executorDebt(executor.address)
  if (executorDebt.gt(0)) {
    await (
      await ChugSplashManager.claimExecutorPayment(
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

export const readCanonicalConfig = (
  canonicalConfigFolderPath: string,
  configUri: string
): CanonicalChugSplashConfig => {
  const ipfsHash = configUri.replace('ipfs://', '')
  // Check that the file containing the canonical config exists.
  const canonicalConfigFilePath = path.join(
    canonicalConfigFolderPath,
    `${ipfsHash}.json`
  )
  if (!fs.existsSync(canonicalConfigFilePath)) {
    throw new Error(`Could not find cached canonical config file at:
${canonicalConfigFilePath}`)
  }

  return JSON.parse(fs.readFileSync(canonicalConfigFilePath, 'utf8'))
}

export const writeCanonicalConfig = (
  canonicalConfigFolderPath: string,
  configUri: string,
  canonicalConfig: CanonicalChugSplashConfig
) => {
  const ipfsHash = configUri.replace('ipfs://', '')

  // Create the canonical config folder if it doesn't already exist.
  if (!fs.existsSync(canonicalConfigFolderPath)) {
    fs.mkdirSync(canonicalConfigFolderPath)
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

export const isProjectRegistered = async (
  signer: Signer,
  projectName: string
) => {
  const ChugSplashRecorder = new ethers.Contract(
    CHUGSPLASH_RECORDER_ADDRESS,
    ChugSplashRecorderABI,
    signer
  )
  const chugsplashManagerAddress = getChugSplashManagerProxyAddress(projectName)
  const isRegistered: boolean = await ChugSplashRecorder.managers(
    chugsplashManagerAddress
  )
  return isRegistered
}

export const isInternalDefaultProxy = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<boolean> => {
  const ChugSplashRecorder = new Contract(
    CHUGSPLASH_RECORDER_ADDRESS,
    ChugSplashRecorderABI,
    provider
  )

  const actionExecutedEvents = await ChugSplashRecorder.queryFilter(
    ChugSplashRecorder.filters.EventAnnouncedWithData(
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

export const isExternalProxyType = (
  proxyType: string
): proxyType is ExternalProxyType => {
  return externalProxyTypes.includes(proxyType)
}

/**
 * Throws an error if the given variable contains any invalid contract references. Specifically,
 * it'll throw an error if any of the following conditions occur:
 *
 * 1. There are any leading spaces before '{{', or any trailing spaces after '}}'. This ensures the
 * template string converts into a valid address when it's parsed. If there are any leading or
 * trailing spaces in an address, `ethers.utils.isAddress` will return false.
 *
 * 2. The contract reference is not included in the array of valid contract references.
 *
 * @param variable Config variable defined by the user.
 * @param referenceNames Valid reference names for this ChugSplash config file.
 */
export const assertValidContractReferences = (
  variable: UserConfigVariable,
  referenceNames: string[]
) => {
  if (
    typeof variable === 'string' &&
    variable.includes('{{') &&
    variable.includes('}}')
  ) {
    if (!variable.startsWith('{{')) {
      throw new Error(
        `Contract reference cannot contain leading spaces before '{{' : ${variable}`
      )
    }
    if (!variable.endsWith('}}')) {
      throw new Error(
        `Contract reference cannot contain trailing spaces: ${variable}`
      )
    }

    const contractReference = variable.substring(2, variable.length - 2).trim()

    if (!referenceNames.includes(contractReference)) {
      throw new Error(
        `Invalid contract reference: ${variable}.\n` +
          `Did you misspell this contract reference, or forget to define a contract with this reference name?`
      )
    }
  } else if (Array.isArray(variable)) {
    for (const element of variable) {
      assertValidContractReferences(element, referenceNames)
    }
  } else if (typeof variable === 'object') {
    for (const [varName, varValue] of Object.entries(variable)) {
      assertValidContractReferences(varName, referenceNames)
      assertValidContractReferences(varValue, referenceNames)
    }
  } else if (
    typeof variable === 'boolean' ||
    typeof variable === 'number' ||
    typeof variable === 'string'
  ) {
    return
  } else {
    throw new Error(
      `Detected unknown variable type, ${typeof variable}, for variable: ${variable}.`
    )
  }
}

export const getParentContractASTNodes = (
  compilerOutputSources: CompilerOutputSources,
  parentContractNodeAstIds: Array<number>
): Array<ContractASTNode> => {
  const parentContractNodes: Array<ContractASTNode> = []
  for (const source of Object.values(compilerOutputSources)) {
    for (const node of source.ast.nodes) {
      if (parentContractNodeAstIds.includes(node.id)) {
        parentContractNodes.push(node)
      }
    }
  }

  // Should never happen.
  if (parentContractNodes.length !== parentContractNodeAstIds.length) {
    throw new Error(
      `Expected ${parentContractNodeAstIds.length} parent contract AST nodes, but got ${parentContractNodes.length}.\n` +
        `Please report this error to ChugSplash.`
    )
  }

  return parentContractNodes
}

/**
 * Grabs the transaction hash of the transaction that completed the given bundle.
 *
 * @param ChugSplashManager ChugSplashManager contract instance.
 * @param bundleId ID of the bundle to look up.
 * @returns Transaction hash of the transaction that completed the bundle.
 */
export const getBundleCompletionTxnHash = async (
  ChugSplashManager: ethers.Contract,
  bundleId: string
): Promise<string> => {
  const events = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.ChugSplashBundleCompleted(bundleId)
  )

  // Might happen if we're asking for the event too quickly after completing the bundle.
  if (events.length === 0) {
    throw new Error(
      `no ChugSplashBundleCompleted event found for bundle ${bundleId}`
    )
  }

  // Shouldn't happen.
  if (events.length > 1) {
    throw new Error(
      `multiple ChugSplashBundleCompleted events found for bundle ${bundleId}`
    )
  }

  return events[0].transactionHash
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

  if (!semver.satisfies(buildInfo.solcVersion, '>=0.4.x <0.9.x')) {
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
      `Storage layout not found. Did you forget to set the "storageLayout" compiler option in your\n` +
        `Hardhat/Foundry config file?\n\n` +
        `If you're using Hardhat, see how to configure your project here:\n` +
        `https://github.com/chugsplash/chugsplash/blob/develop/docs/hardhat/setup-project.md#setup-chugsplash-using-typescript\n\n` +
        `If you're using Foundry, see how to configure your project here:\n` +
        `https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry/getting-started.md#3-configure-your-foundrytoml-file`
    )
  }

  return buildInfo
}

/**
 * Retrieves artifact info from foundry artifacts and returns it in hardhat compatible format.
 *
 * @param artifact Raw artifact object.
 * @returns ContractArtifact
 */
export const parseFoundryArtifact = (artifact: any): ContractArtifact => {
  const abi = artifact.abi
  const bytecode = artifact.bytecode.object

  const compilationTarget = artifact.metadata.settings.compilationTarget
  const sourceName = Object.keys(compilationTarget)[0]
  const contractName = compilationTarget[sourceName]

  return { abi, bytecode, sourceName, contractName }
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
 * Returns the Create2 address of an implementation contract deployed by ChugSplash, which is
 * calculated as a function of the projectName and the corresponding contract's reference name. Note
 * that the contract may not yet be deployed at this address since it's calculated via Create2.
 *
 * @param projectName Name of the ChugSplash project.
 * @param referenceName Reference name of the contract that corresponds to the proxy.
 * @returns Address of the implementation contract.
 */
export const getImplAddress = (
  projectName: string,
  referenceName: string,
  creationCodeWithConstructorArgs: string
): string => {
  const chugSplashManagerAddress = getChugSplashManagerProxyAddress(projectName)

  return utils.getCreate2Address(
    chugSplashManagerAddress,
    utils.keccak256(utils.toUtf8Bytes(referenceName)),
    utils.solidityKeccak256(['bytes'], [creationCodeWithConstructorArgs])
  )
}

export const getConstructorArgs = (
  constructorArgs: ParsedConfigVariables,
  referenceName: string,
  abi: Array<Fragment>
): {
  constructorArgTypes: Array<string>
  constructorArgValues: ParsedConfigVariable[]
} => {
  const constructorArgTypes: Array<string> = []
  const constructorArgValues: Array<ParsedConfigVariable> = []

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )

  if (constructorFragment === undefined) {
    return { constructorArgTypes, constructorArgValues }
  }

  constructorFragment.inputs.forEach((input) => {
    const constructorArgValue = constructorArgs[input.name]
    constructorArgTypes.push(input.type)
    constructorArgValues.push(constructorArgValue)
  })

  return { constructorArgTypes, constructorArgValues }
}

export const getCreationCodeWithConstructorArgs = (
  bytecode: string,
  constructorArgs: ParsedConfigVariables,
  referenceName: string,
  abi: any
): string => {
  const { constructorArgTypes, constructorArgValues } = getConstructorArgs(
    constructorArgs,
    referenceName,
    abi
  )

  const creationCodeWithConstructorArgs = bytecode.concat(
    remove0x(
      utils.defaultAbiCoder.encode(constructorArgTypes, constructorArgValues)
    )
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

export const toOpenZeppelinProxyType = (
  proxyType: ProxyType
): ProxyDeployment['kind'] => {
  if (
    proxyType === 'internal-default' ||
    proxyType === 'external-default' ||
    proxyType === 'oz-transparent'
  ) {
    return 'transparent'
  } else if (
    proxyType === 'oz-ownable-uups' ||
    proxyType === 'oz-access-control-uups'
  ) {
    return 'uups'
  } else {
    throw new Error(
      `Attempted to convert "${proxyType}" to an OpenZeppelin proxy type`
    )
  }
}

export const getOpenZeppelinValidationOpts = (
  proxyType: ProxyType
): Required<ValidationOptions> => {
  return {
    kind: toOpenZeppelinProxyType(proxyType),
    unsafeAllow: [],
    unsafeAllowCustomTypes: false,
    unsafeAllowLinkedLibraries: false,
    unsafeAllowRenames: false,
    unsafeSkipStorageCheck: false,
  }
}

export const getOpenZeppelinStorageLayout = (
  fullyQualifiedName: string,
  compilerInput: CompilerInput,
  compilerOutput: CompilerOutput,
  proxyType: ProxyType
): StorageLayout => {
  const contract = new UpgradeableContract(
    fullyQualifiedName,
    compilerInput,
    // Without converting the `compilerOutput` type to `any`, OpenZeppelin throws an error due
    // to the `SolidityStorageLayout` type that we've added to Hardhat's `CompilerOutput` type.
    // Converting this type to `any` shouldn't impact anything since we use Hardhat's default
    // `CompilerOutput`, which is what OpenZeppelin expects.
    compilerOutput as any,
    getOpenZeppelinValidationOpts(proxyType)
  )

  return contract.layout
}

/**
 * Get the most recent storage layout for the given reference name. Uses OpenZeppelin's
 * StorageLayout format for consistency.
 *
 * When retrieving the storage layout, this function uses the following order of priority (from
 * highest to lowest):
 * 1. The 'previousBuildInfo' and 'previousFullyQualifiedName' fields if both have been declared by
 * the user.
 * 2. The latest deployment in the ChugSplash system for the proxy address that corresponds to the
 * reference name.
 * 3. OpenZeppelin's Network File if the proxy is an OpenZeppelin proxy type
 *
 * If (1) and (2) above are both satisfied, we log a warning to the user and default to using the
 * storage layout located at 'previousBuildInfo'.
 */
export const getPreviousStorageLayoutOZFormat = async (
  provider: providers.Provider,
  referenceName: string,
  parsedContractConfig: ParsedContractConfig,
  userContractConfig: UserContractConfig,
  remoteExecution: boolean,
  canonicalConfigFolderPath: string,
  openzeppelinStorageLayouts?: {
    [referenceName: string]: StorageLayout
  }
): Promise<StorageLayout> => {
  if ((await provider.getCode(parsedContractConfig.proxy)) === '0x') {
    throw new Error(
      `Proxy has not been deployed for the contract: ${referenceName}.`
    )
  }

  const previousCanonicalConfig = await getPreviousCanonicalConfig(
    provider,
    parsedContractConfig.proxy,
    remoteExecution,
    canonicalConfigFolderPath
  )

  if (
    userContractConfig.previousFullyQualifiedName !== undefined &&
    userContractConfig.previousBuildInfo !== undefined
  ) {
    const { input, output } = readBuildInfo(
      userContractConfig.previousBuildInfo
    )

    if (previousCanonicalConfig !== undefined) {
      console.warn(
        '\x1b[33m%s\x1b[0m', // Display message in yellow
        `\nUsing the "previousBuildInfo" and "previousFullyQualifiedName" field to get the storage layout for\n` +
          `the contract: ${referenceName}. If you'd like to use the storage layout from your most recent\n` +
          `ChugSplash deployment instead, please remove these two fields from your ChugSplash config file.`
      )
    }

    return getOpenZeppelinStorageLayout(
      userContractConfig.previousFullyQualifiedName,
      input,
      output,
      parsedContractConfig.proxyType
    )
  } else if (previousCanonicalConfig !== undefined) {
    const prevCanonicalConfigArtifacts = await getCanonicalConfigArtifacts(
      previousCanonicalConfig
    )
    const { sourceName, contractName, compilerInput, compilerOutput } =
      prevCanonicalConfigArtifacts[referenceName]
    return getOpenZeppelinStorageLayout(
      `${sourceName}:${contractName}`,
      compilerInput,
      compilerOutput,
      parsedContractConfig.proxyType
    )
  } else if (openzeppelinStorageLayouts?.[referenceName] !== undefined) {
    return openzeppelinStorageLayouts[referenceName]
  } else {
    throw new Error(
      `Could not find the previous storage layout for the contract: ${referenceName}. Please include\n` +
        `a "previousBuildInfo" and "previousFullyQualifiedName" field for this contract in your ChugSplash config file.`
    )
  }
}

export const getPreviousCanonicalConfig = async (
  provider: providers.Provider,
  proxyAddress: string,
  remoteExecution: boolean,
  canonicalConfigFolderPath: string
): Promise<CanonicalChugSplashConfig | undefined> => {
  const ChugSplashRecorder = new Contract(
    CHUGSPLASH_RECORDER_ADDRESS,
    ChugSplashRecorderABI,
    provider
  )

  const actionExecutedEvents = await ChugSplashRecorder.queryFilter(
    ChugSplashRecorder.filters.EventAnnouncedWithData(
      'ChugSplashActionExecuted',
      null,
      proxyAddress
    )
  )

  if (actionExecutedEvents.length === 0) {
    return undefined
  }

  const latestRegistryEvent = actionExecutedEvents.at(-1)

  if (latestRegistryEvent === undefined) {
    return undefined
  } else if (latestRegistryEvent.args === undefined) {
    throw new Error(`ChugSplashActionExecuted event has no args.`)
  }

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

  if (latestExecutionEvent === undefined) {
    throw new Error(
      `ChugSplashActionExecuted event detected in registry but not in manager contract`
    )
  } else if (latestExecutionEvent.args === undefined) {
    throw new Error(`ChugSplashActionExecuted event has no args.`)
  }

  const latestProposalEvent = (
    await ChugSplashManager.queryFilter(
      ChugSplashManager.filters.ChugSplashBundleProposed(
        latestExecutionEvent.args.bundleId
      )
    )
  ).at(-1)

  if (latestProposalEvent === undefined) {
    throw new Error(
      `ChugSplashManager emitted a ChugSplashActionExecuted event but not a ChugSplashBundleProposed event`
    )
  } else if (latestProposalEvent.args === undefined) {
    throw new Error(`ChugSplashBundleProposed event does not have args`)
  }

  if (remoteExecution) {
    return callWithTimeout<CanonicalChugSplashConfig>(
      chugsplashFetchSubtask({ configUri: latestProposalEvent.args.configUri }),
      30000,
      'Failed to fetch config file from IPFS'
    )
  } else {
    return readCanonicalConfig(
      canonicalConfigFolderPath,
      latestProposalEvent.args.configUri
    )
  }
}

export const getCanonicalConfigArtifacts = async (
  canonicalConfig: CanonicalChugSplashConfig
): Promise<CanonicalConfigArtifacts> => {
  const solcArray: {
    compilerInput: CompilerInput
    compilerOutput: CompilerOutput
  }[] = []
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
      compilerInput: chugsplashInput.input,
      compilerOutput,
    })
  }

  const artifacts: CanonicalConfigArtifacts = {}
  // Generate an artifact for each contract in the ChugSplash config.
  for (const [referenceName, contractConfig] of Object.entries(
    canonicalConfig.contracts
  )) {
    // Split the contract's fully qualified name into its source name and contract name.
    const [sourceName, contractName] = contractConfig.contract.split(':')

    for (const { compilerInput, compilerOutput } of solcArray) {
      const contractOutput =
        compilerOutput.contracts?.[sourceName]?.[contractName]

      if (contractOutput !== undefined) {
        const creationCodeWithConstructorArgs =
          getCreationCodeWithConstructorArgs(
            add0x(contractOutput.evm.bytecode.object),
            contractConfig.constructorArgs,
            referenceName,
            contractOutput.abi
          )

        artifacts[referenceName] = {
          creationCodeWithConstructorArgs,
          abi: contractOutput.abi,
          compilerInput,
          compilerOutput,
          sourceName,
          contractName,
        }
      }
    }
  }
  return artifacts
}
