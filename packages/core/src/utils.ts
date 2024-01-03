import * as fs from 'fs'
import { promisify } from 'util'
import { exec, execSync, spawn } from 'child_process'

import yesno from 'yesno'
import axios from 'axios'
import { ethers, AbiCoder, Provider, JsonRpcSigner } from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import chalk from 'chalk'
import { HttpNetworkConfig, NetworkConfig, SolcBuild } from 'hardhat/types'
import { Compiler, NativeCompiler } from 'hardhat/internal/solidity/compiler'
import {
  GnosisSafeArtifact,
  SphinxLeaf,
  SphinxMerkleTree,
  SphinxTransaction,
  add0x,
  SphinxLeafWithProof,
  SphinxLeafType,
  getManagedServiceAddress,
  ManagedServiceArtifact,
  Operation,
  ContractArtifact,
  isContractArtifact,
  SolidityStorageLayout,
} from '@sphinx-labs/contracts'

import {
  CompilerConfig,
  UserContractKind,
  userContractKinds,
  ParsedVariable,
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
  SphinxActionType,
  ProposalRequest,
  MerkleRootStatus,
  HumanReadableAction,
} from './actions/types'
import { ExecutionMode, RELAYER_ROLE } from './constants'
import { SphinxJsonRpcProvider } from './provider'
import { BuildInfo, CompilerOutput } from './languages/solidity/types'
import { getSolcBuild } from './languages'
import {
  SUPPORTED_LOCAL_NETWORKS,
  SUPPORTED_NETWORKS,
  SupportedChainId,
  SupportedNetworkName,
} from './networks'

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
 * Overrides an object's gas price settings to handle a variety of edge cases on different networks.
 *
 * @param provider Provider object.
 * @param overridden The object whose gas price settings will be overridden.
 * @returns The object whose gas price settings will be overridden.
 */
export const getGasPriceOverrides = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Signer,
  overridden: ethers.TransactionRequest = {}
): Promise<ethers.TransactionRequest> => {
  const [block, isLiveNetwork_, feeData, network] = await Promise.all([
    provider.getBlock('latest'),
    isLiveNetwork(provider),
    provider.getFeeData(),
    provider.getNetwork(),
  ])

  if (!block) {
    throw new Error(`Unable to retrieve latest block.`)
  }

  if (!isLiveNetwork_) {
    // Hard-code the gas limit to be the block gas limit. This is an optimization that significantly
    // speeds up deployments on local networks because it removes the need for EthersJS to call
    // `eth_estimateGas`, which is a very slow operation for large transactions. We don't override
    // this on live networks because the signer is the user's wallet, which may have a limited
    // amount of ETH. It's fine to set a very high gas limit on local networks because we use an
    // auto-generated wallet to execute the transactions.
    overridden.gasLimit = block.gasLimit
    return overridden
  }

  const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } = feeData

  switch (Number(network.chainId)) {
    // Overrides the gasPrice for Fantom Opera
    case 250:
      if (gasPrice !== null) {
        overridden.gasPrice = gasPrice
        return overridden
      }
    // Do not do anything for polygon zkevm and it's testnet
    case 1442:
    case 1101:
      return overridden
    // On linea and its testnet, just override the gasPrice
    case 59140:
    case 59144:
      if (gasPrice !== null) {
        overridden.gasPrice = gasPrice
        return overridden
      }
    // On Polygon PoS, override the maxPriorityFeePerGas using the max fee
    case 137:
      if (maxFeePerGas !== null && maxPriorityFeePerGas !== null) {
        overridden.maxFeePerGas = maxFeePerGas
        overridden.maxPriorityFeePerGas = maxFeePerGas.toString()
      }
      return overridden
    // On mumbai, specify the nonce manually to override pending txs
    case 56:
    case 80001:
      overridden.nonce = await provider.getTransactionCount(
        await signer.getAddress(),
        'latest'
      )
      return overridden
    // On Gnosis, set the gas limit artificially high (since ethers does not seem to always estimate it proplerly especially for contract deployments)
    case 100:
    case 10200:
      overridden.gasLimit = getMaxGasLimit(block.gasLimit)
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

export const isUserContractKind = (
  contractKind: string
): contractKind is UserContractKind => {
  return userContractKinds.includes(contractKind)
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

export const getConfigArtifactsRemote = async (
  compilerConfigs: Array<CompilerConfig>
): Promise<ConfigArtifactsRemote> => {
  const solcArray: BuildInfo[] = []
  const artifacts: ConfigArtifactsRemote = {}
  // Get the compiler output for each compiler input.
  for (const compilerConfig of compilerConfigs) {
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

      const formattedSolcLongVersion = formatSolcLongVersion(
        sphinxInput.solcLongVersion
      )

      solcArray.push({
        input: sphinxInput.input,
        output: compilerOutput,
        id: sphinxInput.id,
        solcLongVersion: formattedSolcLongVersion,
        solcVersion: sphinxInput.solcVersion,
      })
    }

    for (const actionInput of compilerConfig.actionInputs) {
      for (const { fullyQualifiedName } of actionInput.contracts) {
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

        const artifact: ContractArtifact = {
          abi: contractOutput.abi,
          sourceName,
          contractName,
          bytecode: add0x(contractOutput.evm.bytecode.object),
          deployedBytecode: add0x(contractOutput.evm.deployedBytecode.object),
          methodIdentifiers: contractOutput.evm.methodIdentifiers,
          linkReferences: contractOutput.evm.bytecode.linkReferences,
          deployedLinkReferences:
            contractOutput.evm.deployedBytecode.linkReferences,
          metadata,
          storageLayout: contractOutput.storageLayout,
        }

        if (!isContractArtifact(artifact)) {
          throw new Error(
            `Invalid artifact for: ${fullyQualifiedName}. Should never happen.`
          )
        }

        artifacts[fullyQualifiedName] = {
          buildInfo,
          artifact,
        }
      }
    }
  }

  return artifacts
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
    await provider.send('hardhat_getAutomine', [])
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

export const stopImpersonatingAccount = async (
  address: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<void> => {
  // Stop impersonating the Gnosis Safe. This RPC method works for Anvil too because it's an alias
  // for 'anvil_stopImpersonatingAccount'.
  await provider.send('hardhat_stopImpersonatingAccount', [address])
}

/**
 * @notice This function doesn't return the output until the promise resolves. Stderr and stdout can
 * be retrieved from the `stderr` and `stdout` properties of the returned object. Errors can be
 * caught by wrapping the function in a try/catch block.
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
        `Unauthorized request. Please check your Sphinx API Key and organization ID are correct.`
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

export const storeCanonicalConfig = async (
  apiKey: string,
  orgId: string,
  configData: Array<string>
): Promise<string> => {
  const response: {
    status: number
    data: string[]
  } = await axios.post(`${fetchSphinxManagedBaseUrl()}/api/pin`, {
    apiKey,
    orgId,
    configData,
  })

  if (response.status === 200) {
    return response.data[0]
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

/**
 * @dev We do not call this function directly, instead we call it via SphinxContext to facilitate.
 * dependency injection.
 */
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
 * @notice Returns the name of the directory that stores artifacts for a network. This directory
 * name is the string name of the network. If the network is a local node, the network name will be
 * appended with `-local` (e.g. `ethereum-local`).
 */
export const getNetworkNameDirectory = (
  chainId: string,
  executionMode: ExecutionMode
): string => {
  const networkName = getNetworkNameForChainId(BigInt(chainId))
  if (
    executionMode === ExecutionMode.LiveNetworkCLI ||
    executionMode === ExecutionMode.Platform
  ) {
    return networkName
  } else if (executionMode === ExecutionMode.LocalNetworkCLI) {
    return `${networkName}-local`
  } else {
    throw new Error(`Unknown execution type.`)
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
  executionMode: ExecutionMode,
  chainId: bigint
): string => {
  if (
    executionMode === ExecutionMode.Platform ||
    executionMode === ExecutionMode.LiveNetworkCLI
  ) {
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
 * Sorts an array of hex strings in ascending order and returns the sorted array. Does not mutate
 * the original array.
 *
 * @param arr The array of hex strings to sort.
 * @returns A new sorted array.
 */
export const sortHexStrings = (arr: Array<string>): Array<string> => {
  // Create a copy of the array
  const arrCopy = [...arr]

  // Sort the copied array
  return arrCopy.sort((a, b) => {
    const aBigInt = BigInt(a)
    const bBigInt = BigInt(b)
    return aBigInt < bBigInt ? -1 : aBigInt > bBigInt ? 1 : 0
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
 * @notice Returns true if and only if the two inputs are equal.
 */
export const equal = (a: ParsedVariable, b: ParsedVariable): boolean => {
  if (a === null || b === null) {
    return a === b
  } else if (
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
    typeof a === 'string'
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
    for (const { address, fullyQualifiedName } of input.contracts) {
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
 * @notice Spawns a child process and returns a promise that resolves when the process exits. This
 * function doesn't return the output until the promise resolves. Use this function instead of
 * `execAsync` if the command generates a lot of output, since `execAsync` will run out of memory if
 * the output is too large.
 *
 * @param inputData Optional string data to pass into the `stdin` of the child process.
 */
export const spawnAsync = (
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  inputData?: string
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

    // Write inputData to the child process stdin
    if (inputData) {
      child.stdin.write(inputData)
      child.stdin.end()
    }

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

export const toSphinxTransaction = (
  actionInput: RawActionInput
): SphinxTransaction => {
  const { to, value, txData, gas, operation, requireSuccess } = actionInput
  return {
    to,
    value,
    txData,
    gas,
    operation,
    requireSuccess,
  }
}

/**
 * Get auto-generated wallets sorted in ascending order according to their addresses.
 */
export const getSphinxWalletsSortedByAddress = (
  numWallets: number | bigint,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Array<ethers.Wallet> => {
  const wallets: Array<ethers.Wallet> = []
  for (let i = 0; i < Number(numWallets); i++) {
    const privateKey = getSphinxWalletPrivateKey(i)
    wallets.push(new ethers.Wallet(privateKey, provider))
  }

  // Sort the wallets by address in ascending order
  const sortedWallets = wallets.sort((a, b) =>
    Number(BigInt(a.address) - BigInt(b.address))
  )

  return sortedWallets
}

export const getSphinxWalletPrivateKey = (walletIndex: number): string => {
  const coder = ethers.AbiCoder.defaultAbiCoder()
  return ethers.keccak256(
    coder.encode(['string', 'uint256'], ['sphinx.wallet', walletIndex])
  )
}

/**
 * Add a set of auto-generated addresses as owners of a Gnosis Safe. This is necessary to simulate a
 * deployment on local networks like Anvil and Hardhat because the private keys of the actual Gnosis
 * Safe owners aren't known. Only works on local nodes (i.e. Anvil or Hardhat).
 */
export const addSphinxWalletsToGnosisSafeOwners = async (
  safeAddress: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<Array<ethers.Wallet>> => {
  // The caller of the transactions on the Gnosis Safe will be the Gnosis Safe itself. This is
  // necessary to prevent the calls from reverting.
  const safeSigner = await getImpersonatedSigner(safeAddress, provider)
  const safe = new ethers.Contract(
    safeAddress,
    GnosisSafeArtifact.abi,
    safeSigner
  )

  // Get the initial Gnosis Safe balance. We'll restore it at the end of this function.
  const initialSafeBalance = await provider.getBalance(safeAddress)

  // Set the balance of the Gnosis Safe. This ensures that it has enough funds to submit the
  // transactions.
  await fundAccount(safeAddress, provider)

  const ownerThreshold: bigint = await safe.getThreshold()

  // Create a list of auto-generated wallets. We'll add these as the Gnosis Safe owners.
  const sphinxWallets = getSphinxWalletsSortedByAddress(
    ownerThreshold,
    provider
  )

  // Add the auto-generated wallets as owners of the Gnosis Safe. We add `threshold`
  // owners so that the signature validation logic in the Gnosis Safe will iterate
  // over the same number of owners locally as in production. This is important for
  // gas estimation.
  for (const wallet of sphinxWallets) {
    // The Gnosis Safe doesn't have an "addOwner" function, which is why we need to use
    // "addOwnerWithThreshold".
    await safe.addOwnerWithThreshold(
      wallet.address,
      ownerThreshold,
      await getGasPriceOverrides(provider, safeSigner)
    )
  }

  // Restore the initial balance of the Gnosis Safe.
  await setBalance(safeAddress, ethers.toBeHex(initialSafeBalance), provider)

  // Stop impersonating the Gnosis Safe. This RPC method works for Anvil too because it's an alias
  // for 'anvil_stopImpersonatingAccount'.
  await provider.send('hardhat_stopImpersonatingAccount', [safeAddress])

  return sphinxWallets
}

/**
 * Remove a set of auto-generated addresses as owners of a Gnosis Safe. Only works on local nodes
 * (i.e. Anvil or Hardhat).
 */
export const removeSphinxWalletsFromGnosisSafeOwners = async (
  sphinxWallets: Array<ethers.Wallet>,
  safeAddress: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
) => {
  // The caller of the transactions on the Gnosis Safe will be the Gnosis Safe itself. This is
  // necessary to prevent the calls from reverting.
  const safeSigner = await getImpersonatedSigner(safeAddress, provider)
  const safe = new ethers.Contract(
    safeAddress,
    GnosisSafeArtifact.abi,
    safeSigner
  )

  // Get the initial Gnosis Safe balance. We'll restore it at the end of this function.
  const initialSafeBalance = await provider.getBalance(safeAddress)

  // Set the balance of the Gnosis Safe. This ensures that it has enough funds to submit the
  // transactions.
  await fundAccount(safeAddress, provider)

  const ownerThreshold = Number(await safe.getThreshold())

  // Remove the auto-generated wallets as owners of the Gnosis Safe. The logic for this is a little
  // bizarre because Gnosis Safe uses a linked list to store the owner addresses.
  for (let i = 0; i < ownerThreshold - 1; i++) {
    await safe.removeOwner(
      sphinxWallets[i + 1].address,
      sphinxWallets[i].address,
      ownerThreshold,
      await getGasPriceOverrides(provider, safeSigner)
    )
  }
  await safe.removeOwner(
    '0x' + '00'.repeat(19) + '01', // This is `address(1)`. i.e. Gnosis Safe's `SENTINEL_OWNERS`.
    sphinxWallets[ownerThreshold - 1].address,
    ownerThreshold,
    await getGasPriceOverrides(provider, safeSigner)
  )

  // Restore the initial balance of the Gnosis Safe.
  await setBalance(safeAddress, ethers.toBeHex(initialSafeBalance), provider)

  // Stop impersonating the Gnosis Safe. This RPC method works for Anvil too because it's an alias
  // for 'anvil_stopImpersonatingAccount'.
  await provider.send('hardhat_stopImpersonatingAccount', [safeAddress])
}

export const getApproveLeaf = (
  merkleTree: SphinxMerkleTree,
  chainId: bigint
): SphinxLeaf => {
  const leafWithProof = merkleTree.leavesWithProofs.find(
    ({ leaf }) => leaf.chainId === chainId
  )
  if (!leafWithProof) {
    throw new Error(`Could not find 'APPROVE' leaf for chain ID: ${chainId}`)
  }
  return leafWithProof.leaf
}

export const getExecuteLeaves = (
  merkleTree: SphinxMerkleTree,
  chainId: bigint
): Array<SphinxLeaf> => {
  return merkleTree.leavesWithProofs
    .filter(({ leaf }) => leaf.chainId === chainId)
    .map((leafWithProof) => leafWithProof.leaf)
}

export const findLeafWithProof = (
  merkleTree: SphinxMerkleTree,
  leafType: SphinxLeafType,
  chainId: bigint
): SphinxLeafWithProof => {
  const leafWithProof = merkleTree.leavesWithProofs.find(
    ({ leaf }) => leaf.chainId === chainId && leaf.leafType === leafType
  )
  if (!leafWithProof) {
    throw new Error(
      `Could not find Merkle leaf with type ${stringifyLeafType(
        leafType
      )} on chain ID: ${chainId}`
    )
  }
  return leafWithProof
}

export const stringifyLeafType = (leafType: SphinxLeafType): string => {
  if (leafType === SphinxLeafType.APPROVE) {
    return 'APPROVE'
  } else if (leafType === SphinxLeafType.EXECUTE) {
    return 'EXECUTE'
  } else if (leafType === SphinxLeafType.CANCEL) {
    return 'CANCEL'
  } else {
    throw new Error(`Unknown leaf type: ${leafType}`)
  }
}

export const stringifyMerkleRootStatus = (status: bigint): string => {
  switch (status) {
    case MerkleRootStatus.EMPTY:
      return 'EMPTY'
    case MerkleRootStatus.APPROVED:
      return 'APPROVED'
    case MerkleRootStatus.COMPLETED:
      return 'COMPLETED'
    case MerkleRootStatus.CANCELED:
      return 'CANCELED'
    case MerkleRootStatus.FAILED:
      return 'FAILED'
    default:
      throw new Error(`Unknown Merkle root status: ${status}`)
  }
}

export const findStorageSlotKey = (
  storageLayout: SolidityStorageLayout | undefined,
  varName: string
): string => {
  if (!storageLayout) {
    throw new Error(`Storage layout is undefined.`)
  }

  const storageObj = storageLayout.storage.find((s) => s.label === varName)

  if (!storageObj) {
    throw new Error(`Could not find storage slot key.`)
  }

  return storageObj.slot
}

/**
 * Throws an error if the input project name contains invalid characters, which would prevent Sphinx
 * from using it as a file name when writing the deployment artifacts. This function is in
 * TypeScript instead of Solidity because it's impractical to implement regular expressions in
 * Solidity.
 */
export const assertValidProjectName = (input: string): void => {
  const forbiddenChars = /[\/:*?"<>|]/

  // Check for forbidden characters
  if (forbiddenChars.test(input)) {
    throw new Error('Project name contains forbidden characters: \\/:*?"<>|')
  }

  // Check for length restrictions (common maximum length is 255)
  if (input.length === 0 || input.length > 255) {
    throw new Error('Project name length must be between 1 and 255 characters.')
  }

  // Reserved names (commonly reserved in Windows)
  const reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
  if (reservedNames.test(input)) {
    throw new Error('Project name uses a reserved name in Windows.')
  }

  // Check for empty names
  if (input.length === 0) {
    throw new Error('Project name cannot be empty.')
  }

  // Check for names that contain whitespace
  if (input.includes(' ')) {
    throw new Error(`Project name cannot contain whitespace.`)
  }
}

export const getCurrentGitCommitHash = (): string | null => {
  let commitHash: string
  try {
    commitHash = execSync('git rev-parse HEAD').toString().trim()
  } catch {
    return null
  }

  if (commitHash.length !== 40) {
    throw new Error(`Git commit hash is an unexpected length: ${commitHash}`)
  }

  return commitHash
}

export const isSphinxTransaction = (obj: any): obj is SphinxTransaction => {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.to === 'string' &&
    typeof obj.value === 'string' &&
    typeof obj.txData === 'string' &&
    typeof obj.gas === 'string' &&
    obj.operation in Operation &&
    typeof obj.requireSuccess === 'boolean'
  )
}

export const signMerkleRoot = async (
  merkleRoot: string,
  wallet: ethers.Signer
) => {
  const domain = {
    name: 'Sphinx',
    version: '1.0.0',
  }

  const types = { MerkleRoot: [{ name: 'root', type: 'bytes32' }] }

  const value = { root: merkleRoot }

  const signature = await wallet.signTypedData(domain, types, value)
  return signature
}

export const fundAccount = async (
  address: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
) => {
  await setBalance(address, ethers.toBeHex(ethers.parseEther('100')), provider)
}

export const setBalance = async (
  address: string,
  balance: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
) => {
  await provider.send('hardhat_setBalance', [
    address,
    // Strip the leading zero if it exists. This is necessary because hex quantities with leading
    // zeros are not valid at the JSON-RPC layer. Stripping the leading zero doesn't change the
    // amount.
    balance.replace('0x0', '0x'),
  ])
}

export const getMappingValueSlotKey = (
  mappingSlotKey: string,
  key: string
): string => {
  const padded = ethers.zeroPadValue(ethers.toBeHex(mappingSlotKey), 32)

  return ethers.keccak256(
    ethers.solidityPacked(['bytes32', 'bytes32'], [key, padded])
  )
}

export const setManagedServiceRelayer = async (
  address: string,
  provider: HardhatEthersProvider | SphinxJsonRpcProvider
) => {
  const managedServiceAddress = getManagedServiceAddress()

  const accessControlRoleSlotKey = findStorageSlotKey(
    ManagedServiceArtifact.storageLayout,
    '_roles'
  )
  const roleSlotKey = getMappingValueSlotKey(
    accessControlRoleSlotKey,
    RELAYER_ROLE
  )
  const memberSlotKey = getMappingValueSlotKey(
    roleSlotKey,
    ethers.zeroPadValue(ethers.toBeHex(address), 32)
  )

  await provider.send('hardhat_setStorageAt', [
    managedServiceAddress,
    memberSlotKey,
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  ])
}

export const getReadableActions = (
  actionInputs: ActionInput[]
): HumanReadableAction[] => {
  return actionInputs.map((action) => {
    const { referenceName, functionName, variables, address } =
      action.decodedAction
    const actionStr = prettyFunctionCall(
      referenceName,
      address,
      functionName,
      variables,
      5,
      3
    )
    return {
      reason: actionStr,
      actionIndex: action.index,
    }
  })
}

export const getCreate3Address = (deployer: string, salt: string): string => {
  // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the `CREATE3.sol`
  // library for details.
  const proxyBytecode = '0x67363d3d37363d34f03d5260086018f3'

  const proxyAddress = ethers.getCreate2Address(
    deployer,
    salt,
    ethers.keccak256(proxyBytecode)
  )

  const addressHash = ethers.keccak256(
    ethers.concat(['0xd694', proxyAddress, '0x01'])
  )

  // Return the last 20 bytes of the address hash
  const last20Bytes = ethers.dataSlice(addressHash, 12)

  // Return the checksum address
  return ethers.getAddress(last20Bytes)
}

/**
 * Converts the `chainId` and `index` fields of the `SphinxLeaf` from strings to BigInts. This is
 * useful when the `SphinxLeafWithProof` array is created from `JSON.parse`, which sets all BigInt
 * values to strings.
 *
 * @param input A `SphinxLeafWithProof` array where the `chainId` and `index` fields are strings
 * instead of BigInts.
 */
export const toSphinxLeafWithProofArray = (
  input: Array<{
    leaf: {
      chainId: string
      index: string
      leafType: SphinxLeafType
      data: string
    }
    proof: string[]
  }>
): Array<SphinxLeafWithProof> => {
  return input.map((item) => ({
    leaf: {
      ...item.leaf,
      chainId: BigInt(item.leaf.chainId),
      index: BigInt(item.leaf.index),
    },
    proof: item.proof,
  }))
}

export const getCreate3Salt = (
  referenceName: string,
  userSalt: string
): string => {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'bytes32'],
      [referenceName, userSalt]
    )
  )
}

/**
 * Get the maximum gas limit for a single transaction. This is mainly useful to determine the number
 * of `EXECUTE` actions to fit into a single transaction. Approaching the maximum block gas limit can
 * cause transactions to be executed slowly as a result of the algorithms that miners use to select
 * which transactions to include. As a result, we restrict our total gas usage to a fraction of the
 * block gas limit.
 */
export const getMaxGasLimit = (blockGasLimit: bigint): bigint => {
  return blockGasLimit / BigInt(2)
}

/**
 * Format the solcLongVersion to be in the format '0.8.23+commit.f704f362'. The unparsed string may
 * be in the format '0.8.23+commit.f704f362.Darwin.appleclang' (note the appended info). We format
 * the string because the unparsed type cannot be verified on Etherscan.
 */
export const formatSolcLongVersion = (solcLongVersion: string) => {
  // Match the version and commit hash, ignoring any additional parts
  const match = solcLongVersion.match(/(\d+\.\d+\.\d+\+commit\.[a-f0-9]+)/)
  return match ? match[0] : solcLongVersion
}
