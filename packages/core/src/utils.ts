import * as fs from 'fs'
import { promisify } from 'util'
import { exec, spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

import yesno from 'yesno'
import axios from 'axios'
import {
  ethers,
  AbiCoder,
  Provider,
  JsonRpcSigner,
  FunctionFragment,
  keccak256,
  formatUnits,
} from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import chalk from 'chalk'
import {
  GnosisSafeArtifact,
  SphinxLeaf,
  SphinxMerkleTree,
  SphinxTransaction,
  SphinxLeafWithProof,
  SphinxLeafType,
  Operation,
  SolidityStorageLayout,
  SPHINX_LOCAL_NETWORKS,
  SPHINX_NETWORKS,
  remove0x,
  LinkReferences,
  recursivelyConvertResult,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CreateCallArtifact,
  MAX_CONTRACT_SIZE_LIMIT,
} from '@sphinx-labs/contracts'

import {
  DeploymentConfig,
  UserContractKind,
  userContractKinds,
  ParsedVariable,
  ActionInput,
  NetworkConfig,
  Create2ActionInput,
  ActionInputType,
  CreateActionInput,
} from './config/types'
import {
  ProposalRequest,
  MerkleRootStatus,
  HumanReadableAction,
} from './actions/types'
import { ExecutionMode } from './constants'
import { SphinxJsonRpcProvider } from './provider'
import { BuildInfo } from './languages/solidity/types'
import {
  COMPILER_CONFIG_VERSION,
  LocalNetworkMetadata,
  fetchNameForDeprecatedNetwork,
  fetchNameForNetwork,
} from './networks'
import { RelayProposal, SphinxLock, StoreDeploymentConfig } from './types'
import {
  NetworkArtifacts,
  isContractDeploymentArtifact,
  isExecutionArtifact,
} from './artifacts'

export const SPHINX_LOCK_PATH = './sphinx.lock'
export const SPHINX_LOCK_FORMAT = 'sphinx-lock-1.0.0'

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
  executionMode: ExecutionMode,
  overridden: ethers.TransactionRequest = {}
): Promise<ethers.TransactionRequest> => {
  const [block, feeData, network] = await Promise.all([
    provider.getBlock('latest'),
    provider.getFeeData(),
    provider.getNetwork(),
  ])

  if (!block) {
    throw new Error(`Unable to retrieve latest block.`)
  }

  if (
    (executionMode === ExecutionMode.LocalNetworkCLI ||
      executionMode === ExecutionMode.Platform) &&
    process.env.SPHINX_INTERNAL__DISABLE_HARDCODED_GAS_LIMIT !== 'true'
  ) {
    // Get the max batch gas limit on the current network.
    const maxGasLimit = getMaxGasLimit(block.gasLimit)
    // Hard-code the gas limit to be midway between the max batch gas limit and the block gas limit.
    // This is an optimization that significantly speeds up deployments because it removes the need
    // for EthersJS to call `eth_estimateGas`, which is a very slow operation for large
    // transactions. We only make this optimization in situations where we can safely assume that
    // the caller has an unlimited amount of ETH. We don't override this on live networks because
    // the signer is the user's wallet, which may have a limited amount of ETH.
    //
    // We set this value higher than the max batch gas limit to ensure that we don't accidentally
    // underfund the transaction. If we set this value equal to the block gas limit, a situation
    // could occur where the block gas limit decreases slightly after we set this value, which would
    // cause an error due to the fact that the transaction's gas limit exceeds the block gas limit.
    // This occurred when simulating a deployment on Polygon.
    overridden.gasLimit = (maxGasLimit + block.gasLimit) / BigInt(2)
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
    // On linea testnet, 10x the gas price because of this bug:
    // https://github.com/ethers-io/ethers.js/issues/4533
    case 59140:
      if (gasPrice !== null) {
        overridden.gasPrice = gasPrice * BigInt(10)
        return overridden
      }
    // On linea, override the gasPrice
    case 59144:
      if (gasPrice !== null) {
        overridden.gasPrice = gasPrice
      }
      return overridden
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
    // On OKC, override nothing b/c it's unnecessary
    case 66:
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

  // Call `clearTimeout` as soon as either of the promises resolve or reject.
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle)
  })
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

/**
 * Returns `true` if the network is a local node (i.e. Hardhat or Anvil) that's forking a live
 * network. Returns `false` if the network is a local node that isn't forking a live network, or if
 * the network is a live network.
 */
export const isFork = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<boolean> => {
  try {
    // The `hardhat_metadata` RPC method doesn't throw an error on Anvil because the `anvil_`
    // namespace is an alias for `hardhat_`. Source:
    // https://book.getfoundry.sh/reference/anvil/#custom-methods
    const metadata: LocalNetworkMetadata = await provider.send(
      `hardhat_metadata`,
      []
    )
    return !!metadata.forkedNetwork
  } catch {
    return false
  }
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
  if (process.env.SPHINX_MANAGED_BASE_URL) {
    return process.env.SPHINX_MANAGED_BASE_URL
  } else {
    throw new Error(
      'You must define a SPHINX_MANAGED_BASE_URL environment variable pointing to your Sphinx instance.'
    )
  }
}

export const readSphinxLock = async (): Promise<SphinxLock> => {
  if (!existsSync(SPHINX_LOCK_PATH)) {
    throw new Error(
      'Missing `sphinx.lock` file, run `npx sphinx sync --org-id <ORG_ID>` to regenerate this file. We recommend committing it to version control.'
    )
  }

  return JSON.parse(fs.readFileSync(SPHINX_LOCK_PATH).toString())
}

export const syncSphinxLock = async (
  orgId: string | undefined,
  apiKey: string
): Promise<SphinxLock | undefined> => {
  if (process.env.SPHINX_INTERNAL__SKIP_SYNC_LOCK === 'true') {
    return
  }

  if (orgId === undefined) {
    const lock = await readSphinxLock()
    orgId = lock.orgId
  }

  const response: {
    status: number
    data: SphinxLock
  } = await axios.post(`${fetchSphinxManagedBaseUrl()}/api/fetchSphinxLock`, {
    apiKey,
    orgId,
    format: SPHINX_LOCK_FORMAT,
  })

  fs.writeFileSync(
    SPHINX_LOCK_PATH,
    JSON.stringify(response.data, undefined, 2)
  )
  return response.data
}

export const relayProposal: RelayProposal = async (
  proposalRequest: ProposalRequest
): Promise<void> => {
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
      throw e
    }
  }
}

export const storeDeploymentConfig: StoreDeploymentConfig = async (
  apiKey: string,
  orgId: string,
  configData: string
): Promise<string> => {
  const response: {
    status: number
    data: {
      configId: string
      uploadUrl: string
    }
  } = await axios
    .post(`${fetchSphinxManagedBaseUrl()}/api/getConfigUploadUrl`, {
      apiKey,
      orgId,
      hash: keccak256(ethers.toUtf8Bytes(configData.toString())),
      version: COMPILER_CONFIG_VERSION,
    })
    .catch((err) => {
      if (err.response) {
        if (err.response.status === 400) {
          throw new Error(
            'Malformed request storing compiler config, please report this to the developers'
          )
        } else if (err.response.status === 401) {
          throw new Error(
            `Unauthorized, please check your API key and Org ID are correct`
          )
        } else {
          throw err
        }
      } else {
        throw err
      }
    })

  await axios.put(response.data.uploadUrl, configData, {
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return response.data.configId
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

/**
 * @notice Returns the name of the directory that stores artifacts for a network. This directory
 * name is the string name of the network. If the network is a local node, the network name will be
 * appended with `-local` (e.g. `ethereum-local`).
 */
export const getNetworkNameDirectory = (
  chainId: string,
  executionMode: ExecutionMode
): string => {
  const deprecatedNetworkName = fetchNameForDeprecatedNetwork(BigInt(chainId))
  const networkName = deprecatedNetworkName
    ? deprecatedNetworkName
    : fetchNameForNetwork(BigInt(chainId))

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
    SPHINX_NETWORKS.some((n) => n.name === networkName) &&
    !SPHINX_LOCAL_NETWORKS.some((n) => n.name === networkName)
  ) {
    return `${networkName} (local)`
  } else {
    return `local (chain ID: ${chainId})`
  }
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

export const isSupportedChainId = (chainId: bigint): boolean => {
  return SPHINX_NETWORKS.some((n) => n.chainId === chainId)
}

export const isSupportedNetworkName = (networkName: string): boolean => {
  return (
    SPHINX_NETWORKS.some((n) => n.name === networkName) ||
    SPHINX_LOCAL_NETWORKS.some((n) => n.name === networkName)
  )
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
  chainId: string,
  value?: string,
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

  const transferValue = value ?? 0
  const valueString =
    BigInt(transferValue) > BigInt(0)
      ? `{ value: ${formatUnits(BigInt(transferValue), 'ether')} ether }`
      : ''
  const target = ethers.isAddress(referenceNameOrAddress)
    ? `(${referenceNameOrAddress})`
    : `${referenceNameOrAddress}${addressTag}`

  return `${target}.${functionName}${valueString}(${addedSpaceToClosingParenthesis})`
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

export const elementsEqual = (ary: Array<ParsedVariable>): boolean => {
  return ary.every((e) => equal(e, ary[0]))
}

export const displayDeploymentTable = (networkConfig: NetworkConfig) => {
  const deployments = {}
  let idx = 0
  for (const input of networkConfig.actionInputs) {
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

export const toSphinxTransaction = (
  actionInput: ActionInput
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
  moduleAddress: string,
  executionMode: ExecutionMode,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<void> => {
  // The caller of the transactions on the Gnosis Safe will be the Sphinx Module. This is necessary
  // to prevent the calls from reverting. An alternative approach is to call the Gnosis Safe from
  // the Gnosis Safe itself. However, this would increment its nonce in the `addOwnerWithThreshold`
  // calls that occur later in this function, which would mess up the addresses of contracts
  // deployed via the Gnosis Safe. We can't reset the Gnosis Safe's nonce via `hardhat_setNonce`
  // because Hardhat throws an error if we attempt to set a contract's nonce lower than its current
  // nonce.
  const moduleSigner = await getImpersonatedSigner(moduleAddress, provider)
  const safe = new ethers.Contract(
    safeAddress,
    GnosisSafeArtifact.abi,
    moduleSigner
  )

  // Get the initial Sphinx Module balance. We'll restore it at the end of this function. It's not
  // strictly necessary to do this, but we do it anyways to ensure there aren't unintended side
  // effects.
  const initialModuleBalance = await provider.getBalance(moduleAddress)

  // Set the balance of the Sphinx Module. This ensures that it has enough funds to submit the
  // transactions.
  await fundAccountMaxBalance(moduleAddress, provider)

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
  const iface = new ethers.Interface(GnosisSafeArtifact.abi)
  for (const wallet of sphinxWallets) {
    // The Gnosis Safe doesn't have an "addOwner" function, which is why we need to use
    // "addOwnerWithThreshold".
    const data = iface.encodeFunctionData('addOwnerWithThreshold', [
      wallet.address,
      ownerThreshold,
    ])

    await safe.execTransactionFromModule(
      safeAddress,
      0,
      data,
      Operation.Call,
      await getGasPriceOverrides(provider, moduleSigner, executionMode)
    )

    // Sanity check that the owner has been added to the Gnosis Safe.
    if (!(await safe.isOwner(wallet.address))) {
      throw new Error(`Address is not owner. Should never happen.`)
    }
  }

  // Restore the initial balance of the Sphinx Module.
  await setBalance(
    moduleAddress,
    ethers.toBeHex(initialModuleBalance),
    provider
  )

  // Stop impersonating the Sphinx Module. This RPC method works for Anvil too because it's an alias
  // for 'anvil_stopImpersonatingAccount'.
  await provider.send('hardhat_stopImpersonatingAccount', [moduleAddress])
}

/**
 * Remove a set of auto-generated addresses as owners of a Gnosis Safe. Only works on local nodes
 * (i.e. Anvil or Hardhat).
 */
export const removeSphinxWalletsFromGnosisSafeOwners = async (
  sphinxWallets: Array<ethers.Wallet>,
  safeAddress: string,
  moduleAddress: string,
  executionMode: ExecutionMode,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
) => {
  // The caller of the transactions on the Gnosis Safe will be the Sphinx Module. This is necessary
  // to prevent the calls from reverting. An alternative approach is to call the Gnosis Safe from
  // the Gnosis Safe itself. However, this would increment its nonce in the `removeOwner` calls that
  // occur later in this function, which would mess up the addresses of contracts deployed via the
  // Gnosis Safe. We can't reset the Gnosis Safe's nonce via `hardhat_setNonce` because Hardhat
  // throws an error if we attempt to set a contract's nonce lower than its current nonce.
  const moduleSigner = await getImpersonatedSigner(moduleAddress, provider)
  const safe = new ethers.Contract(
    safeAddress,
    GnosisSafeArtifact.abi,
    moduleSigner
  )

  // Get the initial Sphinx Module balance. We'll restore it at the end of this function. It's not
  // strictly necessary to do this, but we do it anyways to ensure there aren't unintended side
  // effects.
  const initialModuleBalance = await provider.getBalance(moduleAddress)

  // Set the balance of the Sphinx Module. This ensures that it has enough funds to submit the
  // transactions.
  await fundAccountMaxBalance(moduleAddress, provider)

  const ownerThreshold = Number(await safe.getThreshold())

  // Remove the auto-generated wallets as owners of the Gnosis Safe. The logic for this is a little
  // bizarre because Gnosis Safe uses a linked list to store the owner addresses.
  for (let i = 0; i < ownerThreshold - 1; i++) {
    await removeGnosisSafeOwnerViaSphinxModule(
      sphinxWallets[i + 1].address,
      sphinxWallets[i].address,
      ownerThreshold,
      safe,
      executionMode,
      moduleSigner,
      provider
    )
  }
  await removeGnosisSafeOwnerViaSphinxModule(
    '0x' + '00'.repeat(19) + '01', // This is `address(1)`. i.e. Gnosis Safe's `SENTINEL_OWNERS`.
    sphinxWallets[ownerThreshold - 1].address,
    ownerThreshold,
    safe,
    executionMode,
    moduleSigner,
    provider
  )

  // Restore the initial balance of the Sphinx Module.
  await setBalance(
    moduleAddress,
    ethers.toBeHex(initialModuleBalance),
    provider
  )

  // Stop impersonating the Sphinx Module. This RPC method works for Anvil too because it's an alias
  // for 'anvil_stopImpersonatingAccount'.
  await provider.send('hardhat_stopImpersonatingAccount', [moduleAddress])
}

export const removeGnosisSafeOwnerViaSphinxModule = async (
  prevOwner: string,
  owner: string,
  ownerThreshold: number,
  safe: ethers.Contract,
  executionMode: ExecutionMode,
  moduleSigner: ethers.Signer,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<void> => {
  const iface = new ethers.Interface(GnosisSafeArtifact.abi)

  const data = iface.encodeFunctionData('removeOwner', [
    prevOwner,
    owner,
    ownerThreshold,
  ])

  await safe.execTransactionFromModule(
    safe.target,
    0,
    data,
    Operation.Call,
    await getGasPriceOverrides(provider, moduleSigner, executionMode)
  )

  if (await safe.isOwner(owner)) {
    throw new Error(`Owner was not removed. Should never happen.`)
  }
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
    ({ leaf }) =>
      BigInt(leaf.chainId) === BigInt(chainId) &&
      BigInt(leaf.leafType) === BigInt(leafType)
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

/**
 * This function sets an account's balance to the maximum possible amount on local networks such as
 * Hardhat or Anvil. The main purpose of setting an account's balance to the maximum amount is to
 * prevent the possibility that a relayer runs out of funds when running a simulation of a network
 * like Arbitrum Sepolia, which has an extremely high block gas limit. Running out of funds is a
 * concern when simulating this type of network because we set each transaction's `gasLimit` equal
 * to the block gas limit. This is an optimization that allows us to avoid making `eth_estimateGas`
 * RPC calls, which can be expensive on local networks for large transactions. However, this makes
 * the transactions extremely expensive, which is why we set the account's balance to be extremely
 * high.
 */
export const fundAccountMaxBalance = async (
  address: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
) => {
  await setBalance(address, ethers.toBeHex(ethers.MaxUint256), provider)
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

export const getReadableActions = (
  actionInputs: ActionInput[],
  chainId: string
): HumanReadableAction[] => {
  return actionInputs.map((action) => {
    const { referenceName, functionName, variables, address, value } =
      action.decodedAction
    const actionStr = prettyFunctionCall(
      referenceName,
      address,
      functionName,
      variables,
      chainId,
      value,
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
      chainId: string | bigint
      index: string | bigint
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
 *
 * We calculate the max gas limit based on the block gas limit. For example,
 * Rootstock has an exceptionally low block gas limit (6.8 million), so we need to set the max gas
 * limit very high, or else large contracts won't be deployable with Sphinx.
 */
export const getMaxGasLimit = (blockGasLimit: bigint): bigint => {
  // We use a threshold of 8.5 million so that any network with a block gas limit greater than ~6.5
  // million can execute a large contract deployment, which costs roughly 6 million gas. If we use a
  // threshold of 7 million instead of 8.5 million, then a network with a block gas limit of 7.1
  // million will have a max batch size of 5.68 million (= 80% * 7.1 million), which is too low.
  if (blockGasLimit <= BigInt(8_500_000)) {
    return blockGasLimit
  } else if (blockGasLimit <= BigInt(20_000_000)) {
    return (blockGasLimit * BigInt(8)) / BigInt(10)
  }

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

/**
 * Strip the leading zero from the input hex string if it exists. This is necessary if the hex
 * string is an input to a JSON-RPC method because hex quantities with leading zeros are not valid
 * at the JSON-RPC layer. Stripping the leading zero doesn't change the amount.
 */
export const stripLeadingZero = (hexString: string): string => {
  return hexString.replace('0x0', '0x')
}

/**
 * Returns the length in bytes of the input hex string.
 *
 * The difference between this function and `ethers.dataLength` is that this function does not throw
 * an error if the input hex string contains library placeholders. This function will return the
 * correct length for hex strings with library placeholders because the placeholders are the same
 * length as library addresses. For more info on library placeholders, see:
 * https://docs.soliditylang.org/en/v0.8.23/using-the-compiler.html#library-linking
 *
 * @example
 * // returns 3
 * getBytesLength("0x123456")
 */
export const getBytesLength = (hexString: string): number => {
  return remove0x(hexString).length / 2
}

/**
 * Replace library references in the `bytecode` with zeros. This function uses the `linkReferences`
 * to find the location of the library references.
 *
 * @returns The `bytecode` with zeros instead of library references.
 */
export const zeroOutLibraryReferences = (
  bytecode: string,
  linkReferences: LinkReferences
): string => {
  const replacer = remove0x(ethers.ZeroAddress)

  let modifiedBytecode = bytecode

  for (const references of Object.values(linkReferences)) {
    for (const libraryReferences of Object.values(references)) {
      for (const ref of libraryReferences) {
        const start = 2 + ref.start * 2 // Adjusting for '0x' prefix and hex encoding
        modifiedBytecode =
          modifiedBytecode.substring(0, start) +
          replacer +
          modifiedBytecode.substring(start + ref.length * 2)
      }
    }
  }

  return modifiedBytecode
}

/**
 * Type guard to check if a value is not undefined.
 *
 * @param value The value to check.
 * @returns true if the value is not undefined, false otherwise.
 */
export const isDefined = <T>(value: T | undefined): value is T =>
  value !== undefined

/**
 * Get the ABI encoded constructor arguments from the init code. We use the length of the
 * `artifact.bytecode` to determine where the contract's creation code ends and the constructor
 * arguments begin. This method works even if the `artifact.bytecode` contains externally linked
 * library placeholders or immutable variable placeholders, which are always the same length as the
 * real values.
 */
export const getAbiEncodedConstructorArgs = (
  initCodeWithArgs: string,
  artifactBytecode: string
): string => {
  return ethers.dataSlice(initCodeWithArgs, ethers.dataLength(artifactBytecode))
}

/**
 * Uses the given interface to decode calldata into a function name (e.g. 'myFunction') and
 * variables. Returns `undefined` if the interface cannot be used to decode the calldata, which
 * could happen if the calldata is meant to trigger the contract's `fallback` function.
 */
export const decodeCall = (
  iface: ethers.Interface,
  data: string
): { functionName: string; variables: ParsedVariable } | undefined => {
  // Check if the data is long enough to contain a function selector, which is four bytes. The data
  // may be shorter than four bytes if the transaction is called on a contract's fallback function,
  // for example.
  if (getBytesLength(data) >= 4) {
    const selector = ethers.dataSlice(data, 0, 4)
    const fragment = iface.fragments
      .filter(FunctionFragment.isFragment)
      .find((frag) => frag.selector === selector)
    if (fragment) {
      const variablesResult = iface.decodeFunctionData(fragment, data)
      const variables = recursivelyConvertResult(
        fragment.inputs,
        variablesResult
      ) as ParsedVariable
      return { functionName: fragment.name, variables }
    }
  }
  return undefined
}

/**
 * Encodes the data that will be submitted to Gnosis Safe's `CreateCall` function, which contains
 * functionality for deploying contracts from the Gnosis Safe.
 */
export const encodeCreateCall = (
  value: string,
  initCodeWithArgs: string
): string => {
  const iface = new ethers.Interface(CreateCallArtifact.abi)
  return iface.encodeFunctionData('performCreate', [
    BigInt(value),
    initCodeWithArgs,
  ])
}

/**
 * A helper function that removes the boilerplate code for decoding a `CREATE2` deployment executed
 * via the Deterministic Deployment Proxy
 * (https://github.com/Arachnid/deterministic-deployment-proxy)
 *
 * @param saltAndInitCodeWithArgs The data sent to the Deterministic Deployment Proxy. This data is
 * a 32-byte salt appended with the contract's init code.
 */
export const decodeDeterministicDeploymentProxyData = (
  saltAndInitCodeWithArgs: string
): { salt: string; initCodeWithArgs: string; create2Address: string } => {
  const salt = ethers.dataSlice(saltAndInitCodeWithArgs, 0, 32)
  const initCodeWithArgs = ethers.dataSlice(saltAndInitCodeWithArgs, 32)
  const create2Address = ethers.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    salt,
    ethers.keccak256(initCodeWithArgs)
  )
  return { salt, initCodeWithArgs, create2Address }
}

export const isCreate2ActionInput = (
  action: ActionInput
): action is Create2ActionInput => {
  const create2 = action as Create2ActionInput

  return (
    create2 !== null &&
    typeof create2 === 'object' &&
    create2.actionType === ActionInputType.CREATE2 &&
    typeof create2.create2Address === 'string' &&
    typeof create2.initCodeWithArgs === 'string' &&
    Array.isArray(create2.contracts) &&
    typeof create2.decodedAction === 'object' &&
    typeof create2.index === 'string' &&
    typeof create2.to === 'string' &&
    typeof create2.value === 'string' &&
    typeof create2.txData === 'string' &&
    typeof create2.gas === 'string' &&
    create2.operation === Operation.Call &&
    typeof create2.requireSuccess === 'boolean'
  )
}

export const isCreateActionInput = (
  action: ActionInput
): action is CreateActionInput => {
  const create = action as CreateActionInput

  return (
    create !== null &&
    typeof create === 'object' &&
    create.actionType === ActionInputType.CREATE &&
    typeof create.contractAddress === 'string' &&
    typeof create.initCodeWithArgs === 'string' &&
    Array.isArray(create.contracts) &&
    typeof create.decodedAction === 'object' &&
    typeof create.index === 'string' &&
    typeof create.to === 'string' &&
    typeof create.value === 'string' &&
    typeof create.txData === 'string' &&
    typeof create.gas === 'string' &&
    create.operation === Operation.DelegateCall &&
    typeof create.requireSuccess === 'boolean'
  )
}

export const isFile = (path: string): boolean => {
  return fs.existsSync(path) && fs.statSync(path).isFile()
}

/**
 * Returns `true` if the given address is a hex-prefixed, checksummed address.
 */
export const isNormalizedAddress = (addr: string): boolean => {
  return ethers.getAddress(addr) === addr
}

export const fetchNetworkConfigFromDeploymentConfig = (
  chainId: bigint,
  deploymentConfig: DeploymentConfig
): NetworkConfig => {
  const networkConfig = deploymentConfig.networkConfigs.find(
    (config) => BigInt(config.chainId) === chainId
  )

  if (!networkConfig) {
    throw new Error(
      'Failed to find parsed config for target network. This is a bug, please report it to the developers.'
    )
  }

  return networkConfig
}

const isDirectory = (path: string): boolean =>
  existsSync(path) && fs.statSync(path).isDirectory()

export const readDeploymentArtifactsForNetwork = (
  projectName: string,
  chainId: BigInt,
  executionMode: ExecutionMode
): NetworkArtifacts => {
  const networkArtifacts: NetworkArtifacts = {
    contractDeploymentArtifacts: {},
    executionArtifacts: {},
  }

  const networkArtifactDirPath = join(
    `deployments`,
    projectName,
    getNetworkNameDirectory(chainId.toString(), executionMode)
  )

  if (!isDirectory(networkArtifactDirPath)) {
    return networkArtifacts
  }

  const contractArtifactFileNames = fs
    .readdirSync(networkArtifactDirPath)
    .filter((fileName) => fileName.endsWith('.json'))
  for (const fileName of contractArtifactFileNames) {
    const filePath = join(networkArtifactDirPath, fileName)
    const artifact = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (isContractDeploymentArtifact(artifact)) {
      networkArtifacts.contractDeploymentArtifacts[fileName] = artifact
    }
  }

  const executionArtifactFilePath = join(networkArtifactDirPath, `execution`)

  if (!isDirectory(executionArtifactFilePath)) {
    return networkArtifacts
  }

  const executionArtifactFileNames = fs
    .readdirSync(executionArtifactFilePath)
    .filter((fileName) => fileName.endsWith('.json'))

  for (const fileName of executionArtifactFileNames) {
    const filePath = join(executionArtifactFilePath, fileName)
    const artifact = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (isExecutionArtifact(artifact)) {
      networkArtifacts.executionArtifacts[fileName] = artifact
    }
  }

  return networkArtifacts
}

export const isArrayMixed = <T>(arr: T[]): boolean => new Set(arr).size > 1

export const getContractAddressesFromNetworkConfig = (
  networkConfig: NetworkConfig
): Array<string> => {
  const unlabeledAddresses = networkConfig.unlabeledContracts.map(
    (ct) => ct.address
  )
  const labeledAddresses = networkConfig.actionInputs
    .flatMap((actions) => actions.contracts)
    .map((ct) => ct.address)
  return unlabeledAddresses.concat(labeledAddresses)
}

/**
 * Checks if a string contains an opening then closing parenthesis.
 *
 * @param {string} str - The string to be checked.
 * @returns {boolean} `true` if the string contains opening then closing parentheses,
 * otherwise `false`.
 */
export const hasParentheses = (str: string): boolean => {
  return /\(.*\)/.test(str)
}

/**
 * Removes leading and trailing single or double quotes from a string.
 *
 * @param {string} str - The string to be processed.
 * @returns {string} The string with leading and trailing quotes removed.
 */
export const trimQuotes = (str: string): string => {
  return str.replace(/^['"]+|['"]+$/g, '')
}

/**
 * Checks if a given property of an object is a public asynchronous method.
 *
 * This function iterates over the prototype chain of the object to check if the specified property
 * is an asynchronous function that is not intended to be private (not starting with '_'). We check
 * for a leading underscore to determine whether a function is meant to be private because
 * JavaScript doesn't have a native way to check this. This function stops the search once it
 * reaches the top of the prototype chain or finds a match.
 *
 * @param {any} obj - The object to inspect.
 * @param {string | symbol} prop - The property name or symbol to check.
 * @returns {boolean} - `true` if the property is a public asynchronous method, `false` otherwise.
 */
export const isPublicAsyncMethod = (
  obj: any,
  prop: string | symbol
): boolean => {
  let currentObj = obj

  while (currentObj && currentObj !== Object.prototype) {
    const propValue = currentObj[prop]
    if (
      typeof propValue === 'function' &&
      propValue.constructor.name === 'AsyncFunction' &&
      typeof prop === 'string' &&
      !prop.startsWith('_')
    ) {
      return true
    }
    currentObj = Object.getPrototypeOf(currentObj)
  }

  return false
}

/**
 * Returns true if the given bytecode exceeds the contract size size limit as defined by:
 * https://github.com/ethereum/EIPs/blob/master/EIPS/eip-170.md
 */
export const exceedsContractSizeLimit = (deployedBytecode: string): boolean => {
  const bytesLength = remove0x(deployedBytecode).length / 2
  return bytesLength > MAX_CONTRACT_SIZE_LIMIT
}

export const sphinxCoreUtils = { sleep, callWithTimeout, isPublicAsyncMethod }
