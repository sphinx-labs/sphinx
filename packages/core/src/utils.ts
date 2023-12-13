import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'
import { exec, spawn } from 'child_process'

import yesno from 'yesno'
import axios from 'axios'
import * as semver from 'semver'
import { ethers, AbiCoder, Provider, JsonRpcSigner } from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import chalk from 'chalk'
import { HttpNetworkConfig, NetworkConfig, SolcBuild } from 'hardhat/types'
import { Compiler, NativeCompiler } from 'hardhat/internal/solidity/compiler'
import {
  FoundryContractArtifact,
  GnosisSafeArtifact,
  SphinxLeaf,
  SphinxMerkleTree,
  SphinxTransaction,
  add0x,
  SphinxLeafWithProof,
  SphinxLeafType,
} from '@sphinx-labs/contracts'

import {
  CompilerConfig,
  UserContractKind,
  userContractKinds,
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
  SphinxActionType,
  IPFSCommitResponse,
  ProposalRequest,
  MerkleRootStatus,
} from './actions/types'
import { Integration } from './constants'
import { SphinxJsonRpcProvider } from './provider'
import 'core-js/features/array/at'
import { BuildInfo, CompilerOutput } from './languages/solidity/types'
import { getSolcBuild } from './languages'
import {
  SUPPORTED_LOCAL_NETWORKS,
  SUPPORTED_NETWORKS,
  SupportedChainId,
  SupportedNetworkName,
} from './networks'

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
    // On Gnosis, set the gas limit artificially high (since ethers does not seem to always estimate it proplerly especially for contract deployments)
    case 10200:
      overridden.gasLimit = 15_000_000
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
 * Retrieves an artifact by name from the local file system.
 */
export const readFoundryContractArtifact = (
  contractArtifactPath: string,
  integration: Integration
): FoundryContractArtifact => {
  const artifact: FoundryContractArtifact = JSON.parse(
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
  const solcArray: BuildInfoRemote[] = []
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

      solcArray.push({
        input: sphinxInput.input,
        output: compilerOutput,
        id: sphinxInput.id,
        solcLongVersion: sphinxInput.solcLongVersion,
        solcVersion: sphinxInput.solcVersion,
      })
    }

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
 * @notice Spawns a child process and returns a promise that resolves when the process exits. This
 * function doesn't return the output until the promise resolves. Use this function instead of
 * `execAsync` if the command generates a lot of output, since `execAsync` will run out of memory if
 * the output is too large.
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
  provider: SphinxJsonRpcProvider
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
  provider: SphinxJsonRpcProvider
): Promise<Array<ethers.Wallet>> => {
  // The caller of the transactions on the Gnosis Safe will be the Gnosis Safe itself. This is
  // necessary to prevent the calls from reverting.
  const safe = new ethers.Contract(
    safeAddress,
    GnosisSafeArtifact.abi,
    await getImpersonatedSigner(safeAddress, provider)
  )

  // Get the initial Gnosis Safe balance. We'll restore it at the end of this function.
  const initialSafeBalance = await provider.getBalance(safeAddress)

  // Set the balance of the Gnosis Safe. This ensures that it has enough funds to submit the
  // transactions.
  await provider.send('hardhat_setBalance', [
    safeAddress,
    ethers.toBeHex(ethers.parseEther('100')),
  ])

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
    await safe.addOwnerWithThreshold(wallet.address, ownerThreshold)
  }

  // Restore the initial balance of the Gnosis Safe.
  await provider.send('hardhat_setBalance', [
    safeAddress,
    ethers.toBeHex(initialSafeBalance),
  ])

  // Stop impersonating the Gnosis Safe. This RPC method works for Anvil too because it's an alias
  // for 'anvil_impersonateAccount'.
  await provider.send('hardhat_impersonateAccount', [safeAddress])

  return sphinxWallets
}

/**
 * Remove a set of auto-generated addresses as owners of a Gnosis Safe. Only works on local nodes
 * (i.e. Anvil or Hardhat).
 */
export const removeSphinxWalletsFromGnosisSafeOwners = async (
  sphinxWallets: Array<ethers.Wallet>,
  safeAddress: string,
  provider: SphinxJsonRpcProvider
) => {
  // The caller of the transactions on the Gnosis Safe will be the Gnosis Safe itself. This is
  // necessary to prevent the calls from reverting.
  const safe = new ethers.Contract(
    safeAddress,
    GnosisSafeArtifact.abi,
    await getImpersonatedSigner(safeAddress, provider)
  )

  // Get the initial Gnosis Safe balance. We'll restore it at the end of this function.
  const initialSafeBalance = await provider.getBalance(safeAddress)

  // Set the balance of the Gnosis Safe. This ensures that it has enough funds to submit the
  // transactions.
  await provider.send('hardhat_setBalance', [
    safeAddress,
    ethers.toBeHex(ethers.parseEther('100')),
  ])

  const ownerThreshold = Number(await safe.getThreshold())

  // Remove the auto-generated wallets as owners of the Gnosis Safe. The logic for this is a little
  // bizarre because Gnosis Safe uses a linked list to store the owner addresses.
  for (let i = 0; i < ownerThreshold - 1; i++) {
    await safe.removeOwner(
      sphinxWallets[i + 1].address,
      sphinxWallets[i].address,
      ownerThreshold
    )
  }
  await safe.removeOwner(
    '0x' + '00'.repeat(19) + '01', // This is `address(1)`. i.e. Gnosis Safe's `SENTINEL_OWNERS`.
    sphinxWallets[ownerThreshold - 1].address,
    ownerThreshold
  )

  // Restore the initial balance of the Gnosis Safe.
  await provider.send('hardhat_setBalance', [
    safeAddress,
    ethers.toBeHex(initialSafeBalance),
  ])

  // Stop impersonating the Gnosis Safe. This RPC method works for Anvil too because it's an alias
  // for 'anvil_impersonateAccount'.
  await provider.send('hardhat_impersonateAccount', [safeAddress])
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
