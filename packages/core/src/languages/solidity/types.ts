import {
  CompilerOutputMetadata,
  LinkReferences,
  SphinxTransaction,
} from '@sphinx-labs/contracts'

import { ExecutionMode } from '../../constants'

/**
 * Represents a deployment that was executed on a network. It includes detailed information about
 * the deployment such as transaction receipts, configuration settings, and relevant contract
 * addresses.
 *
 * @property {string} _format The format of the execution artifact.
 * @property {Array<{response: SphinxTransactionResponse, receipt: SphinxTransactionReceipt}>}
 * transactions - This array includes each transaction response with its receipt, sorted in
 * ascending order chronologically. For new Gnosis Safe deployments, the first transaction deploys
 * the Safe, the second approves the deployment, and the rest execute the deployment. For existing
 * Safes, the first transaction approves the deployment, and the rest execute the deployment.
 * @property {string} merkleRoot - The Merkle root of the deployment.
 * @property {Array<string>} solcInputHashes - The full list of Solidity compiler hashes used for
 * the deployment.
 * @property {string} safeAddress - The address of the Gnosis Safe.
 * @property {string} moduleAddress - The address of the Sphinx Module.
 * @property {string} executorAddress - The address of the executor.
 * @property {string} nonce - The nonce.
 * @property {string} chainId - The chain ID.
 * @property {Array<SphinxTransaction>} actions - An array of Sphinx transactions, which are the
 * encoded inputs to the deployment.
 * @property {Object} sphinxConfig - The configuration options in the deployment script along with
 * the configuration options for the Gnosis Safe that executed the deployment.
 * @property {ExecutionMode} executionMode - Whether the deployment was executed on a local network
 * via the CLI, on a live network via the CLI, or via the DevOps Platform.
 * @property {Object} initialState - On-chain state variables that were recorded before the
 * deployment was executed.
 * @property {Array<Object>} unlabeledContracts - An array of contracts Sphinx couldn't find an
 * artifact for. These contracts won't be verified on block explorers, and Sphinx will not create a
 * deployment artifact for them. If a contract does not have a source file, it will be in this
 * array. Common examples are minimal `CREATE3` or `EIP-1167` proxies.
 * @property {boolean} arbitraryChain - Indicates whether the deployment can be executed on an
 * arbitrary chain. Currently always false.
 * @property {Array<string>} libraries - An array of libraries that were used in the deployment.
 * These are in the format that the Solidity compiler expects. For example,
 * `path/to/file.sol:MyLibrary=0x1234567890123456789012345678901234567890`.
 * @property {string} gitCommit - The full git commit hash on the machine that initiated the
 * deployment. If the deployment was executed via the DevOps Platform, this is recorded on the
 * machine that proposed the deployment. If the deployment was executed from the user's local
 * machine instead of the DevOps Platform, this is recorded on the user's machine when they run the
 * `deploy` CLI command. This is null if the repository was not a git repository when the deployment
 * was initiated.
 * @property {string} safeInitData - The raw data that deployed and initialized the Gnosis Safe.
 * This is null for deployments that use a previously deployed Gnosis Safe.
 */
export type ExecutionArtifact = {
  _format: 'sphinx-sol-execution-artifact-1'
  transactions: Array<{
    response: SphinxTransactionResponse
    receipt: SphinxTransactionReceipt
  }>
  merkleRoot: string
  solcInputHashes: Array<string>
  safeAddress: string
  moduleAddress: string
  executorAddress: string
  nonce: string
  chainId: string
  actions: Array<SphinxTransaction>
  sphinxConfig: {
    projectName: string
    orgId: string
    owners: Array<string>
    mainnets: Array<string>
    testnets: Array<string>
    threshold: string
    saltNonce: string
  }
  executionMode: ExecutionMode
  initialState: {
    isSafeDeployed: boolean
    isModuleDeployed: boolean
    isExecuting: boolean
  }
  unlabeledContracts: Array<{
    address: string
    initCodeWithArgs: string
  }>
  arbitraryChain: boolean
  libraries: Array<string>
  gitCommit: string | null
  safeInitData: string | null
}

export type SphinxTransactionResponse = {
  accessList: Array<{ address: string; storageKeys: Array<string> }> | null
  blockNumber: number
  blockHash: string
  chainId: string
  data: string
  from: string
  gasLimit: string
  gasPrice: string
  hash: string
  maxFeePerGas: string | null
  maxPriorityFeePerGas: string | null
  nonce: number
  signature: {
    networkV: string | null
    r: string
    s: string
    v: 27 | 28
  }
  to: string
  type: number
  value: string
}

/**
 * Represents a contract that was deployed on a network. It includes detailed information about the
 * contract such as the transaction receipt of the deployment, ABI, bytecode, and other relevant
 * data. It also includes the artifacts for previous versions of the contract; see the `history`
 * field for more details.
 *
 * @property {string} _format - The format of the contract deployment artifact.
 * @property {string} merkleRoot - The Merkle root of the deployment.
 * @property {string} contractName - The name of the contract.
 * @property {string} address - The address of the contract.
 * @property {Array<any>} abi - The ABI of the contract.
 * @property {string} solcInputHash - The hash of the Solidity compiler input that contains this
 * contract.
 * @property {SphinxTransactionReceipt} receipt - The transaction receipt of the contract
 * deployment.
 * @property {string} metadata - The metadata of the contract as returned by the Solidity compiler.
 * @property {Array<any>} args - The constructor arguments.
 * @property {string} bytecode - The creation bytecode of the contract. This does not include the
 * constructor arguments.
 * @property {string} deployedBytecode - The deployed bytecode. This was fetched on-chain after the
 * contract was deployed.
 * @property {string} gitCommit - The full git commit hash on the machine that initiated the
 * deployment. If the deployment was executed via the DevOps Platform, this is recorded on the
 * machine that proposed the deployment. If the deployment was executed from the user's local
 * machine instead of the DevOps Platform, this is recorded on the user's machine when they run the
 * `deploy` CLI command. This is undefined if the repository was not a git repository when the
 * deployment was initiated.
 * @property {Object} [devdoc] - The developer documentation of the contract as returned by the
 * Solidity compiler (optional).
 * @property {Object} [userdoc] - The user documentation of the contract as returned by the Solidity
 * compiler (optional).
 * @property {SolidityStorageLayout} [storageLayout] - The storage layout of the contract as
 * returned by the Solidity compiler (optional).
 * @property {string} sourceName - The source name of the contract.
 * @property {string} chainId - The chain ID.
 * @property {LinkReferences} linkReferences - The creation bytecode's link references object as
 * returned by the Solidity compiler. If the contract doesn't need to be linked, this value contains
 * an empty object.
 * @property {LinkReferences} deployedLinkReferences - The deployed bytecode's link references
 * object as returned by the Solidity compiler. If the contract doesn't need to be linked, this
 * value contains an empty object.
 * @property {Object} [methodIdentifiers] - The method identifiers of the contract as returned by
 * the Solidity compiler (optional).
 * @property {Array<Omit<ContractDeploymentArtifact, 'history'>>} history - The history of the
 * contract. Each element in the array is a previous contract deployment artifact with the `history`
 * field omitted to avoid nesting. The elements are sorted chronologically from earliest to most
 * recent. Sphinx assigns each contract to a file based on its `contractName`. For example, if a
 * project deploys a contract named "MyContract" in three separate deployments, then the first
 * element in the `history` array will be the first deployment, the second element in the array will
 * be the second deployment, and the top-level artifact will be the most recent deployment.
 */
export type ContractDeploymentArtifact = {
  _format: 'sphinx-sol-ct-artifact-1'
  merkleRoot: string
  address: string
  sourceName: string
  contractName: string
  chainId: string
  receipt: SphinxTransactionReceipt
  args: Array<any>
  solcInputHash: string
  abi: Array<any>
  bytecode: string
  deployedBytecode: string
  linkReferences: LinkReferences
  deployedLinkReferences: LinkReferences
  history: Array<Omit<ContractDeploymentArtifact, 'history'>>
  metadata: string
  gitCommit: string | null
  devdoc?: any
  userdoc?: any
}

/**
 * The receipt of a transaction executed by Sphinx. This is almost identical to transaction receipts
 * generated by tools like EthersJS and Foundry.
 *
 * @property {string} blockHash - The block hash of the block this transaction was included in.
 * @property {number} blockNumber - The block number of the block this transaction was included in.
 * @property {null} contractAddress - The address of the contract if the transaction was directly
 * responsible for deploying one. This is always `null` because Sphinx never deploys contracts
 * directly from an EOA. We include it because it's a standard field included by other tools like
 * EthersJS and Foundry.
 * @property {string} cumulativeGasUsed - The total amount of gas used by all transactions within
 * the block, including this and all transactions with a lower `index`.
 * @property {string} from - The sender of the transaction.
 * @property {string} gasPrice - The actual gas price used during execution.
 * @property {string} gasUsed - The actual amount of gas used by this transaction.
 * @property {string} hash - The unique transaction hash.
 * @property {number} index - The index of this transaction within the block transactions.
 * @property {Array<Object>} logs - An array of log objects generated by the transaction. Each log
 * object includes:
 * - `address`: The address of the log.
 * - `blockHash`: The hash of the block containing the log.
 * - `blockNumber`: The block number of the log.
 * - `data`: The data contained in the log.
 * - `index`: The index of the log within the block.
 * - `topics`: An array of topics associated with the log.
 * - `transactionHash`: The hash of the transaction generating the log.
 * - `transactionIndex`: The index of the transaction within the block.
 * @property {string} logsBloom - The bloom filter bytes representing all logs that occurred within
 * this transaction.
 * @property {number | null} status - The status of this transaction, indicating success (1) or a
 * revert (0).
 * @property {string} to - The address the transaction was sent to.
 */
export type SphinxTransactionReceipt = {
  blockHash: string
  blockNumber: number
  contractAddress: null
  cumulativeGasUsed: string
  from: string
  gasPrice: string
  gasUsed: string
  hash: string
  index: number
  // Unlike EthersJS and Foundry, we don't include a `removed` boolean as a field in the `logs`
  // array because didn't exist on Sepolia using an Alchemy RPC URL.
  logs: Array<{
    address: string
    blockHash: string
    blockNumber: number
    data: string
    index: number
    topics: Array<string>
    transactionHash: string
    transactionIndex: number
  }>
  logsBloom: string
  status: number | null
  to: string
}

/**
 * Represents the inputs used for compiling a set of Solidity smart contracts. It contains details
 * about the compiler version and the specific inputs provided to the compiler.
 *
 * @property {string} id - A unique identifier for the compiler inputs.
 * @property {string} solcVersion - The version of the Solidity compiler used for compiling the
 * contract, represented as a short version string like "0.8.4".
 * @property {string} solcLongVersion - A detailed version string of the Solidity compiler, often
 * including build and commit details to provide exact information about the compiler build used.
 * @property {SolcInput} input - The actual input data provided to the Solidity compiler,
 * including details such as source code, optimization settings, and other configurations necessary
 * for the compilation process.
 */
export type CompilerInput = {
  id: string
  solcVersion: string
  solcLongVersion: string
  input: SolcInput
}

export interface StorageSlotSegment {
  key: string
  offset: number
  val: string
}

export type BuildInfo = {
  id: string
  solcVersion: string
  solcLongVersion: string
  input: SolcInput
  output: CompilerOutput
}

export interface SolcInput {
  language: string
  sources: { [sourceName: string]: { content: string } }
  settings: {
    viaIR?: boolean
    optimizer: {
      runs?: number
      enabled?: boolean
      details?: {
        yulDetails: {
          optimizerSteps: string
        }
      }
    }
    metadata?: {
      useLiteralContent: boolean
      bytecodeHash: string
      appendCBOR: boolean
    }
    outputSelection: {
      [sourceName: string]: {
        [contractName: string]: string[]
      }
    }
    evmVersion?: string
    libraries?: {
      [libraryFileName: string]: {
        [libraryName: string]: string
      }
    }
    remappings?: string[]
  }
}

export interface CompilerOutputContract {
  abi: Array<any>
  evm: {
    bytecode: CompilerOutputBytecode
    deployedBytecode: CompilerOutputBytecode
  }
  metadata: string | CompilerOutputMetadata
}

export interface CompilerOutputContracts {
  [sourceName: string]: {
    [contractName: string]: CompilerOutputContract
  }
}

export interface CompilerOutput {
  contracts: CompilerOutputContracts
}

export interface CompilerOutputBytecode {
  object: string
  linkReferences: {
    [sourceName: string]: {
      [libraryName: string]: Array<{ start: number; length: 20 }>
    }
  }
  immutableReferences?: {
    [key: string]: Array<{ start: number; length: number }>
  }
}

export type SphinxSystemConfig = {
  relayers: string[]
}
