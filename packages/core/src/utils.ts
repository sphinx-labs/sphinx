import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'
import { exec, spawn } from 'child_process'

import yesno from 'yesno'
import axios from 'axios'
import ora from 'ora'
import * as semver from 'semver'
import { ethers, AbiCoder, Provider, JsonRpcSigner } from 'ethers'
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
  ParsedVariable,
  BuildInfoRemote,
  ConfigArtifactsRemote,
  RawFunctionCallActionInput,
  ActionInput,
  RawCreate2ActionInput,
  RawActionInput,
  Label,
  ParsedConfig,
  Create2ActionInput,
  FunctionCallActionInput,
} from './config/types'
import {
  SphinxActionBundle,
  SphinxActionType,
  IPFSCommitResponse,
  ProposalRequest,
  SphinxTargetBundle,
} from './actions/types'
import { Integration } from './constants'
import { SphinxJsonRpcProvider } from './provider'
import 'core-js/features/array/at'
import { BuildInfo, CompilerOutput } from './languages/solidity/types'
import { getSolcBuild } from './languages'
import { fromRawSphinxAction, isSetStorageAction } from './actions/bundle'
import {
  SUPPORTED_LOCAL_NETWORKS,
  SUPPORTED_NETWORKS,
  SupportedChainId,
  SupportedNetworkName,
} from './networks'

import { ContractArtifact, add0x } from '@sphinx-labs/contracts'

export const getDeploymentId = (
  actionBundle: SphinxActionBundle,
  targetBundle: SphinxTargetBundle,
  configUri: string
): string => {
  const actionRoot = actionBundle.root
  const targetRoot = targetBundle.root
  const numTargets = targetBundle.targets.length

  const numTotalActions = actionBundle.actions.length
  const numSetStorageActions = actionBundle.actions
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

// export const isInternalDefaultProxy = async (
//   provider: Provider,
//   proxyAddress: string
// ): Promise<boolean> => {
//   const SphinxRegistry = new Contract(
//     getSphinxRegistryAddress(),
//     SphinxRegistryABI,
//     provider
//   )

// TODO(upgrades): A lot of public rpc endpoints / networks don't allow
// querying events past a certain block number, so this call would likely fail.
//   const actionExecutedEvents = await SphinxRegistry.queryFilter(
//     SphinxRegistry.filters.EventAnnouncedWithData(
//       'DefaultProxyDeployed',
//       null,
//       proxyAddress
//     )
//   )

//   return actionExecutedEvents.length === 1
// }

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
    return artifact
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
  }
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

export const getConfigArtifactsRemote = async (
  compilerConfig: CompilerConfig
): Promise<ConfigArtifactsRemote> => {
  const solcArray: BuildInfoRemote[] = []
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

  const artifacts: ConfigArtifactsRemote = {}
  for (const actionInput of compilerConfig.actionInputs) {
    for (const address of Object.keys(actionInput.contracts)) {
      const { fullyQualifiedName } = actionInput.contracts[address]

      // Split the contract's fully qualified name into its source name and contract name.
      const [sourceName, contractName] = fullyQualifiedName.split(':')

      const buildInfo = solcArray.find(
        (e) => e.output.contracts[sourceName][contractName]
      )
      if (!buildInfo) {
        throw new Error(
          `Could not find artifact for: ${fullyQualifiedName}. Should never happen.`
        )
      }
      const contractOutput =
        buildInfo.output.contracts[sourceName][contractName]

      const metadata =
        typeof contractOutput.metadata === 'string'
          ? JSON.parse(contractOutput.metadata)
          : contractOutput.metadata
      artifacts[fullyQualifiedName] = {
        buildInfo,
        artifact: {
          abi: contractOutput.abi,
          sourceName,
          contractName,
          bytecode: add0x(contractOutput.evm.bytecode.object),
          deployedBytecode: add0x(contractOutput.evm.deployedBytecode.object),
          methodIdentifiers: contractOutput.evm.methodIdentifiers,
          metadata,
        },
      }
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
 * @notice Stderr and stdout can be retrieved from the `stderr` and `stdout` properties of the
 * returned object. Error can be caught by wrapping the function in a try/catch block.
 */
export const execAsync = promisify(exec)

export const getDuplicateElements = (arr: Array<string>): Array<string> => {
  return [...new Set(arr.filter((e, i, a) => a.indexOf(e) !== i))]
}

export const fetchSphinxManagedBaseUrl = () => {
  return process.env.SPHINX_MANAGED_BASE_URL
    ? process.env.SPHINX_MANAGED_BASE_URL
    : 'https://www.sphinx.dev'
}

export const relayProposal = async (proposalRequest: ProposalRequest) => {
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
  a: Array<ParsedVariable>,
  b: Array<ParsedVariable>
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
 * @notice Returns a string that describes a network, which is used in the preview. A network tag can
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
  address: string,
  functionName: string,
  variables: ParsedVariable,
  spaceToIndentVariables: number = 2,
  spaceToIndentClosingParenthesis: number = 0
): string => {
  const stringified = JSON.stringify(variables, null, spaceToIndentVariables)
  // Removes the first and last characters, which are either '[' and ']', or '{' and '}'.
  const removedBrackets = stringified.substring(1, stringified.length - 1)

  // We only add a newline if the stringified variables contain a newline. Otherwise, a function
  // call without any parameters would look like this: `myFunction(    )` (note the extra spaces).
  const numSpacesForClosingParenthesis = removedBrackets.includes(`\n`)
    ? spaceToIndentClosingParenthesis
    : 0

  const addedSpaceToClosingParenthesis =
    removedBrackets + ' '.repeat(numSpacesForClosingParenthesis)

  const addressTag = address !== '' ? `<${address}>` : ''
  const target = ethers.isAddress(referenceNameOrAddress)
    ? `(${referenceNameOrAddress})`
    : `${referenceNameOrAddress}${addressTag}`

  return `${target}.${functionName}(${addedSpaceToClosingParenthesis})`
}

export const prettyRawFunctionCall = (to: string, data: string): string => {
  return `(${to}).${data}`
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
export const equal = (a: ParsedVariable, b: ParsedVariable): boolean => {
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
    typeof a === 'number' ||
    typeof a === 'string' ||
    typeof a === 'bigint'
  ) {
    return a === b
  } else {
    // We know that the types of `a` and `b` match due to the check at the beginning of this
    // function, so we just return the type of `a`.
    throw new Error(`Unsupported type: ${typeof a}`)
  }
}

export const isRawFunctionCallActionInput = (
  actionInput: ActionInput | RawActionInput
): actionInput is RawFunctionCallActionInput => {
  const callActionInput = actionInput as RawFunctionCallActionInput
  return (
    callActionInput.actionType === SphinxActionType.CALL.toString() &&
    callActionInput.to !== undefined &&
    callActionInput.txData !== undefined
  )
}

export const isRawCreate2ActionInput = (
  actionInput: RawActionInput | ActionInput
): actionInput is RawCreate2ActionInput => {
  const rawCreate2 = actionInput as RawCreate2ActionInput
  return (
    rawCreate2.actionType === SphinxActionType.CALL.toString() &&
    rawCreate2.contractName !== undefined &&
    rawCreate2.create2Address !== undefined &&
    rawCreate2.txData !== undefined &&
    rawCreate2.gas !== undefined
  )
}

export const isFunctionCallActionInput = (
  actionInput: RawActionInput | ActionInput
): actionInput is FunctionCallActionInput => {
  const functionCall = actionInput as Create2ActionInput
  return (
    isRawCreate2ActionInput(actionInput) && functionCall.contracts !== undefined
  )
}

export const isCreate2ActionInput = (
  actionInput: RawActionInput | ActionInput
): actionInput is Create2ActionInput => {
  const create2 = actionInput as Create2ActionInput
  return isRawCreate2ActionInput(actionInput) && create2.contracts !== undefined
}

export const elementsEqual = (ary: Array<ParsedVariable>): boolean => {
  return ary.every((e) => equal(e, ary[0]))
}

export const displayDeploymentTable = (parsedConfig: ParsedConfig) => {
  const deployments = {}
  let idx = 0
  for (const input of parsedConfig.actionInputs) {
    for (const address of Object.keys(input.contracts)) {
      const fullyQualifiedName = input.contracts[address].fullyQualifiedName
      const contractName = fullyQualifiedName.split(':')[1]
      deployments[idx + 1] = {
        Contract: contractName,
        Address: address,
      }
      idx += 1
    }
  }
  if (Object.keys(deployments).length > 0) {
    console.table(deployments)
  }
}

/**
 * @notice Spawns a child process and returns a promise that resolves when the process exits. Use
 * this function instead of `execAsync` if the command generates a lot of output, since `execAsync`
 * will run out of memory if the output is too large.
 */
export const spawnAsync = (
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<{ stdout: string; stderr: string; code: number | null }> => {
  return new Promise((resolve) => {
    const output: Buffer[] = []
    const error: Buffer[] = []

    const envVars = env ? { ...process.env, ...env } : process.env

    // Include the environment variables in the options for the spawn function
    const child = spawn(cmd, args, { env: envVars })

    child.stdout.on('data', (data: Buffer) => {
      output.push(data)
    })

    child.stderr.on('data', (data: Buffer) => {
      error.push(data)
    })

    child.on('close', (code) => {
      return resolve({
        stdout: Buffer.concat(output).toString(),
        stderr: Buffer.concat(error).toString(),
        code,
      })
    })
  })
}

export const isString = (str: string | null | undefined): str is string => {
  return typeof str === 'string'
}

export const isLabel = (l: Label | undefined): l is Label => {
  if (l === undefined) {
    return false
  }

  return (
    typeof (l as Label).addr === 'string' &&
    typeof (l as Label).fullyQualifiedName === 'string'
  )
}
