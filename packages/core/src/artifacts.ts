import { join, resolve } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'

import { ConstructorFragment, ethers } from 'ethers'
import {
  SphinxModuleABI,
  isLinkReferences,
  isNonNullObject,
  remove0x,
} from '@sphinx-labs/contracts'
import axios from 'axios'

import {
  CompilerInput,
  ContractDeploymentArtifact,
  SphinxTransactionReceipt,
  SphinxTransactionResponse,
  ExecutionArtifact,
} from './languages/solidity/types'
import { SphinxJsonRpcProvider } from './provider'
import {
  DeploymentConfig,
  ConfigArtifacts,
  NetworkConfig,
  BuildInfos,
} from './config/types'
import {
  fetchNetworkConfigFromDeploymentConfig,
  fetchSphinxManagedBaseUrl,
  getNetworkNameDirectory,
  isSphinxTransaction,
  toSphinxTransaction,
} from './utils'
import { ExecutionMode } from './constants'

export type NetworkArtifacts = {
  executionArtifacts: {
    [txArtifactFileName: string]: ExecutionArtifact
  }
  contractDeploymentArtifacts: {
    [contractFileName: string]: ContractDeploymentArtifact
  }
}

export type DeploymentArtifacts = {
  networks: {
    [chainId: string]: NetworkArtifacts
  }
  compilerInputs: {
    [fileName: string]: CompilerInput
  }
}

/**
 * Fetch all previous deployment artifacts from the DevOps Platform for a project.
 */
export const fetchDeploymentArtifacts = async (
  apiKey: string,
  orgId: string,
  projectName: string
): Promise<DeploymentArtifacts> => {
  const response = await axios
    .post(`${fetchSphinxManagedBaseUrl()}/api/artifacts`, {
      apiKey,
      orgId,
      projectName,
      viaPresignedUrl: true,
    })
    .catch((err) => {
      if (err.response) {
        if (err.response.status === 400) {
          throw new Error(
            'Malformed request fetching deployment artifacts, please report this to the developers'
          )
        } else if (err.response.status === 401) {
          throw new Error(
            `Unauthorized, please check your API key and Org ID are correct`
          )
        } else if (err.response.status === 404) {
          throw new Error(`No artifacts found for this project`)
        } else {
          throw err
        }
      } else {
        throw err
      }
    })

  const artifact = await axios.get(response.data)
  return artifact.data as DeploymentArtifacts
}

/**
 * Converts an EthersJS TransactionResponse to a Sphinx TransactionResponse. Assumes that the
 * EthersJS response was retrieved after the transaction was accepted on-chain.
 *
 * @param chainId The chain ID. We pass this in explicitly because it may not be populated by
 * EthersJS automatically, in spite of the fact that it's a documented field. For example, the chain
 * ID isn't populated for the following transaction response on Optimism:
 * `provider.getTransaction('0x16bbe6fe0c7ddbf92ca0a98a9b8aa52503666ae5b847fc9be0f8d05ee3f0795f')`
 */
export const convertEthersTransactionResponse = (
  response: ethers.TransactionResponse | null,
  chainId: string
): SphinxTransactionResponse => {
  if (response === null) {
    throw new Error(`Transaction response is null.`)
  }

  if (!response.blockNumber || !response.blockHash || !response.to) {
    // The block number and block hash should always be defined if the response is queried after the
    // transaction is accepted. The 'to' field should always be defined because Sphinx deployments
    // always involve executed transactions on a contract.
    throw new Error(`Invalid field(s) in Ethers transaction response.`)
  }

  const convertedResponse: SphinxTransactionResponse = {
    accessList: response.accessList,
    blockNumber: response.blockNumber,
    blockHash: response.blockHash,
    chainId,
    data: response.data,
    from: response.from,
    gasLimit: response.gasLimit.toString(),
    gasPrice: response.gasPrice.toString(),
    hash: response.hash,
    maxFeePerGas: response.maxFeePerGas?.toString() ?? null,
    maxPriorityFeePerGas: response.maxPriorityFeePerGas?.toString() ?? null,
    nonce: response.nonce,
    signature: {
      networkV: response.signature.networkV?.toString() ?? null,
      r: response.signature.r,
      s: response.signature.s,
      v: response.signature.v,
    },
    to: response.to,
    type: response.type,
    value: response.value.toString(),
  }

  if (!isSphinxTransactionResponse(convertedResponse)) {
    throw new Error(`SphinxTransactionResponse is invalid.`)
  }

  return convertedResponse
}

export const isSphinxTransactionResponse = (
  response: any
): response is SphinxTransactionResponse => {
  // Helper function to validate an access list entry
  const isValidAccessListEntry = (entry: any) =>
    typeof entry.address === 'string' &&
    Array.isArray(entry.storageKeys) &&
    entry.storageKeys.every((key) => typeof key === 'string')

  // Helper function to validate the signature
  const isValidSignature = (signature: any) =>
    (typeof signature.networkV === 'string' || signature.networkV === null) &&
    typeof signature.r === 'string' &&
    typeof signature.s === 'string' &&
    (signature.v === 27 || signature.v === 28)

  return (
    ((Array.isArray(response.accessList) &&
      response.accessList.every(isValidAccessListEntry)) ||
      response.accessList === null) &&
    typeof response.blockNumber === 'number' &&
    typeof response.blockHash === 'string' &&
    typeof response.chainId === 'string' &&
    typeof response.data === 'string' &&
    typeof response.from === 'string' &&
    typeof response.gasLimit === 'string' &&
    typeof response.gasPrice === 'string' &&
    typeof response.hash === 'string' &&
    (typeof response.maxFeePerGas === 'string' ||
      response.maxFeePerGas === null) &&
    (typeof response.maxPriorityFeePerGas === 'string' ||
      response.maxPriorityFeePerGas === null) &&
    typeof response.nonce === 'number' &&
    isValidSignature(response.signature) &&
    typeof response.to === 'string' &&
    typeof response.type === 'number' &&
    typeof response.value === 'string'
  )
}

export const isSphinxTransactionReceipt = (
  receipt: any
): receipt is SphinxTransactionReceipt => {
  // Helper function to validate a log entry
  const isValidLogEntry = (log: any) =>
    typeof log.address === 'string' &&
    typeof log.blockHash === 'string' &&
    typeof log.blockNumber === 'number' &&
    typeof log.data === 'string' &&
    typeof log.index === 'number' &&
    Array.isArray(log.topics) &&
    log.topics.every((topic) => typeof topic === 'string') &&
    typeof log.transactionHash === 'string' &&
    typeof log.transactionIndex === 'number'

  return (
    typeof receipt.blockHash === 'string' &&
    typeof receipt.blockNumber === 'number' &&
    receipt.contractAddress === null &&
    typeof receipt.cumulativeGasUsed === 'string' &&
    typeof receipt.from === 'string' &&
    typeof receipt.gasPrice === 'string' &&
    typeof receipt.gasUsed === 'string' &&
    typeof receipt.hash === 'string' &&
    typeof receipt.index === 'number' &&
    Array.isArray(receipt.logs) &&
    receipt.logs.every(isValidLogEntry) &&
    typeof receipt.logsBloom === 'string' &&
    (typeof receipt.status === 'number' || receipt.status === null) &&
    typeof receipt.to === 'string' &&
    !ethers.isHexString(receipt.cumulativeGasUsed) &&
    !ethers.isHexString(receipt.gasPrice) &&
    !ethers.isHexString(receipt.gasUsed)
  )
}

export const convertEthersTransactionReceipt = (
  receipt: ethers.TransactionReceipt | null
): SphinxTransactionReceipt => {
  if (receipt === null) {
    throw new Error(`Transaction response is null.`)
  }

  if (!receipt.to) {
    // The 'to' field should always be defined for Sphinx deployments because
    // we always call a contract to execute transactions.
    throw new Error(`Ethers transaction receipt is missing 'to' field.`)
  }

  const converted: SphinxTransactionReceipt = {
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    contractAddress: null,
    cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
    from: receipt.from,
    gasPrice: receipt.gasPrice.toString(),
    gasUsed: receipt.gasUsed.toString(),
    hash: receipt.hash,
    index: receipt.index,
    logs: receipt.logs.map((l) => ({
      address: l.address,
      blockHash: l.blockHash,
      blockNumber: l.blockNumber,
      data: l.data,
      index: l.index,
      // We must use the spread operator (`...`) to create a copy of the `topics` array because the
      // original array is a `readonly` type.
      topics: [...l.topics],
      transactionHash: l.transactionHash,
      transactionIndex: l.transactionIndex,
    })),
    logsBloom: receipt.logsBloom,
    status: receipt.status,
    to: receipt.to,
  }

  if (!isSphinxTransactionReceipt(converted)) {
    throw new Error(`SphinxTransactionReceipt is invalid.`)
  }

  return converted
}

/**
 * Makes contract deployment artifacts on a single network for a single deployment. Mutates the
 * input `artifacts` object.
 *
 * @param artifacts An object containing all previous contract deployment artifacts on the network
 * for the project.
 */
export const makeContractDeploymentArtifacts = async (
  merkleRoot: string,
  networkConfig: NetworkConfig,
  buildInfos: BuildInfos,
  receipts: Array<SphinxTransactionReceipt>,
  configArtifacts: ConfigArtifacts,
  artifacts: {
    [fileName: string]: ContractDeploymentArtifact | undefined
  },
  provider: SphinxJsonRpcProvider
): Promise<void> => {
  const isSuffixed = Object.keys(artifacts).every((fileName) =>
    fileName.endsWith('.json')
  )
  if (!isSuffixed) {
    throw new Error(
      `Previous contract deployment artifact file name(s) not suffixed with '.json'`
    )
  }

  const coder = ethers.AbiCoder.defaultAbiCoder()
  const moduleInterface = new ethers.Interface(SphinxModuleABI)

  const { gitCommit, chainId } = networkConfig
  const numDeployments: { [fileName: string]: number | undefined } = {}
  for (const action of networkConfig.actionInputs) {
    for (const contract of action.contracts) {
      const { fullyQualifiedName, initCodeWithArgs, address } = contract
      const { artifact: compilerArtifact, buildInfoId } =
        configArtifacts[fullyQualifiedName]
      const buildInfo = buildInfos[buildInfoId]

      if (!compilerArtifact || !buildInfo) {
        throw new Error(`Could not find artifact for: ${fullyQualifiedName}`)
      }

      const {
        bytecode,
        abi,
        metadata,
        contractName,
        sourceName,
        linkReferences,
        deployedLinkReferences,
      } = compilerArtifact

      const { devdoc, userdoc } = metadata.output

      const iface = new ethers.Interface(abi)

      const deployedBytecode = await provider.getCode(address)
      if (deployedBytecode === '0x') {
        // The deployed bytecode could be empty if the deployment failed midway on-chain.
        continue
      }

      const receipt = receipts.find((rcpt) =>
        rcpt.logs
          .filter((log) => log.address === networkConfig.moduleAddress)
          .some((log) => {
            const parsedLog = moduleInterface.parseLog(log)
            return (
              parsedLog !== null &&
              parsedLog.name === 'SphinxActionSucceeded' &&
              parsedLog.args[0] === merkleRoot &&
              parsedLog.args[1].toString() === action.index
            )
          })
      )
      if (!receipt) {
        throw new Error(`Could not find transaction receipt for: ${address}.`)
      }

      // Get the ABI encoded constructor arguments. We use the length of the `artifact.bytecode` to
      // determine where the contract's creation code ends and the constructor arguments begin. This
      // method works even if the `artifact.bytecode` contains externally linked library placeholders
      // or immutable variable placeholders, which are always the same length as the real values.
      const encodedConstructorArgs = ethers.dataSlice(
        initCodeWithArgs,
        ethers.dataLength(bytecode)
      )

      const constructorFragment = iface.fragments.find(
        ConstructorFragment.isFragment
      )
      const constructorArgValues = constructorFragment
        ? coder
            .decode(constructorFragment.inputs, encodedConstructorArgs)
            .toArray()
        : []

      const artifact: ContractDeploymentArtifact = {
        _format: 'sphinx-sol-ct-artifact-1',
        merkleRoot,
        contractName,
        address,
        abi,
        solcInputHash: buildInfo.id,
        receipt,
        metadata: JSON.stringify(metadata),
        args: constructorArgValues,
        bytecode,
        deployedBytecode,
        devdoc,
        userdoc,
        gitCommit,
        sourceName,
        chainId,
        linkReferences,
        deployedLinkReferences,
        history: [],
      }

      const previousNumDeployments = numDeployments[contractName] ?? 0
      const fileName =
        previousNumDeployments > 0
          ? `${contractName}_${previousNumDeployments}.json`
          : `${contractName}.json`

      const previousArtifact = artifacts[fileName]
      if (previousArtifact) {
        // Separate the previous artifact into two components: its `history` array and the other
        // fields.
        const { history: previousHistory, ...previousArtifactWithoutHistory } =
          previousArtifact

        // The new `history` array is the previous history array concatenated with the previous
        // artifact with its `history` array removed.
        artifact.history = previousHistory.concat(
          previousArtifactWithoutHistory
        )
      }

      if (!isContractDeploymentArtifact(artifact)) {
        throw new Error(`Contract deployment artifact is invalid.`)
      }

      artifacts[fileName] = artifact

      numDeployments[contractName] = previousNumDeployments + 1
    }
  }
}

export const writeDeploymentArtifacts = (
  projectName: string,
  executionMode: ExecutionMode,
  deploymentArtifacts: DeploymentArtifacts
): void => {
  const rootArtifactDirPath = resolve('deployments')
  const projectDirPath = join(rootArtifactDirPath, projectName)
  const compilerInputDirPath = join(
    rootArtifactDirPath,
    getCompilerInputDirName(executionMode)
  )

  if (!existsSync(projectDirPath)) {
    mkdirSync(projectDirPath, { recursive: true })
  }
  if (!existsSync(compilerInputDirPath)) {
    // Create the directory for the compiler inputs. We don't need to specify `recursive: true`
    // because we know that the `deployments` dir has already been created.
    mkdirSync(compilerInputDirPath)
  }

  for (const chainId of Object.keys(deploymentArtifacts.networks)) {
    const { executionArtifacts, contractDeploymentArtifacts } =
      deploymentArtifacts.networks[chainId]

    const networkDirPath = join(
      projectDirPath,
      getNetworkNameDirectory(chainId, executionMode)
    )
    const executionDirPath = join(networkDirPath, 'execution')

    if (!existsSync(executionDirPath)) {
      mkdirSync(executionDirPath, { recursive: true })
    }

    for (const [fileName, executionArtifact] of Object.entries(
      executionArtifacts
    )) {
      const transactionFilePath = join(executionDirPath, fileName)
      writeFileSync(
        transactionFilePath,
        JSON.stringify(executionArtifact, null, '\t')
      )
    }

    for (const [fileName, contractArtifact] of Object.entries(
      contractDeploymentArtifacts
    )) {
      const contractArtifactFilePath = join(networkDirPath, fileName)
      writeFileSync(
        contractArtifactFilePath,
        JSON.stringify(contractArtifact, null, '\t')
      )
    }
  }

  for (const [fileName, compilerInput] of Object.entries(
    deploymentArtifacts.compilerInputs
  )) {
    const filePath = join(compilerInputDirPath, fileName)
    if (!existsSync(filePath)) {
      writeFileSync(filePath, JSON.stringify(compilerInput, null, '\t'))
    }
  }
}

export const isContractDeploymentArtifactExceptHistory = (
  item: any
): item is ContractDeploymentArtifact => {
  return (
    item !== null &&
    typeof item === 'object' &&
    item._format === 'sphinx-sol-ct-artifact-1' &&
    typeof item.merkleRoot === 'string' &&
    typeof item.address === 'string' &&
    typeof item.sourceName === 'string' &&
    typeof item.contractName === 'string' &&
    typeof item.chainId === 'string' &&
    isSphinxTransactionReceipt(item.receipt) &&
    Array.isArray(item.args) &&
    typeof item.solcInputHash === 'string' &&
    Array.isArray(item.abi) &&
    typeof item.bytecode === 'string' &&
    typeof item.deployedBytecode === 'string' &&
    isLinkReferences(item.linkReferences) &&
    isLinkReferences(item.deployedLinkReferences) &&
    typeof item.metadata === 'string' &&
    (typeof item.gitCommit === 'string' || item.gitCommit === null) &&
    (typeof item.devdoc === 'object' || item.devdoc === undefined) &&
    (typeof item.userdoc === 'object' || item.userdoc === undefined)
  )
}

export const isContractDeploymentArtifact = (
  obj: any
): obj is ContractDeploymentArtifact => {
  return (
    isContractDeploymentArtifactExceptHistory(obj) &&
    Array.isArray(obj.history) &&
    obj.history.every(
      (hist) =>
        isContractDeploymentArtifactExceptHistory(hist) &&
        hist.history === undefined
    )
  )
}

/**
 * Make deployment artifacts for the most recent deployment in a project. Mutates the input
 * `artifacts` object.
 *
 * @param deployments An object containing deployment information for each network where the most
 * recent deployment was executed.
 *
 * @returns {DeploymentArtifacts} The artifacts for the most recent deployment.
 */
export const makeDeploymentArtifacts = async (
  deployments: {
    [chainId: string]: {
      deploymentConfig: DeploymentConfig
      receipts: Array<SphinxTransactionReceipt>
      provider: SphinxJsonRpcProvider
    }
  },
  merkleRoot: string,
  configArtifacts: ConfigArtifacts,
  artifacts: DeploymentArtifacts
): Promise<void> => {
  // We'll mutate these variables to update the existing artifacts.
  const {
    networks: allNetworkArtifacts,
    compilerInputs: compilerInputArtifacts,
  } = artifacts

  for (const chainId of Object.keys(deployments)) {
    const { provider, deploymentConfig, receipts } = deployments[chainId]

    // Define the network artifacts if it doesn't exist. Otherwise, we'll attempt to operate on an
    // object that doesn't exist, leading to an error.
    if (allNetworkArtifacts[chainId] === undefined) {
      allNetworkArtifacts[chainId] = {
        contractDeploymentArtifacts: {},
        executionArtifacts: {},
      }
    }

    const networkConfig = fetchNetworkConfigFromDeploymentConfig(
      BigInt(chainId),
      deploymentConfig
    )

    // Make the contract artifacts.
    await makeContractDeploymentArtifacts(
      merkleRoot,
      networkConfig,
      deploymentConfig.buildInfos,
      receipts,
      configArtifacts,
      allNetworkArtifacts[chainId].contractDeploymentArtifacts,
      provider
    )

    // Make the execution artifact.
    const executionArtifact = await makeExecutionArtifact(
      receipts,
      deploymentConfig,
      networkConfig,
      merkleRoot,
      provider
    )
    allNetworkArtifacts[chainId].executionArtifacts[
      `${remove0x(merkleRoot)}.json`
    ] = executionArtifact

    // Make the compiler input artifacts.
    for (const compilerInput of deploymentConfig.inputs) {
      compilerInputArtifacts[`${compilerInput.id}.json`] = compilerInput
    }
  }
}

const makeExecutionArtifact = async (
  receipts: Array<SphinxTransactionReceipt>,
  deploymentConfig: DeploymentConfig,
  networkConfig: NetworkConfig,
  merkleRoot: string,
  provider: SphinxJsonRpcProvider
): Promise<ExecutionArtifact> => {
  const ethersResponses: (ethers.TransactionResponse | null)[] = []
  for (const rcpt of receipts) {
    ethersResponses.push(await provider.getTransaction(rcpt.hash))
  }

  const responses = ethersResponses.map((ethersResponse) =>
    convertEthersTransactionResponse(ethersResponse, networkConfig.chainId)
  )

  const transactions = responses.map((response, i) => {
    return { receipt: receipts[i], response }
  })
  // Sort the transactions in ascending order chronologically. This mutates the array.
  transactions.sort((a, b) => {
    if (isReceiptEarlier(a.receipt, b.receipt)) {
      return -1
    } else if (isReceiptEarlier(b.receipt, a.receipt)) {
      return 1
    }
    return 0
  })

  const solcInputHashes = deploymentConfig.inputs.map((input) => input.id)

  const {
    safeAddress,
    moduleAddress,
    executorAddress,
    nonce,
    chainId,
    actionInputs,
    executionMode,
    unlabeledContracts,
    arbitraryChain,
    libraries,
    gitCommit,
  } = networkConfig
  const {
    owners,
    threshold,
    saltNonce,
    projectName,
    orgId,
    mainnets,
    testnets,
  } = networkConfig.newConfig
  const { isExecuting, isModuleDeployed, isSafeDeployed } =
    networkConfig.initialState

  const actions = actionInputs.map(toSphinxTransaction)

  const safeInitData = networkConfig.initialState.isSafeDeployed
    ? null
    : networkConfig.safeInitData

  const executionArtifact: ExecutionArtifact = {
    _format: 'sphinx-sol-execution-artifact-1',
    transactions,
    merkleRoot,
    solcInputHashes,
    safeAddress,
    moduleAddress,
    executorAddress,
    nonce,
    chainId,
    actions,
    sphinxConfig: {
      projectName,
      orgId,
      owners,
      mainnets,
      testnets,
      threshold,
      saltNonce,
    },
    executionMode,
    initialState: {
      isSafeDeployed,
      isModuleDeployed,
      isExecuting,
    },
    unlabeledContracts,
    arbitraryChain,
    libraries,
    gitCommit,
    safeInitData,
  }

  if (!isExecutionArtifact(executionArtifact)) {
    throw new Error(`Execution artifact is invalid.`)
  }

  return executionArtifact
}

const isLibraryArray = (ary: any): boolean => {
  if (!Array.isArray(ary)) {
    return false
  }

  return ary.every((item) => {
    if (typeof item !== 'string') {
      return false
    }

    // Splitting the string by ':' and '='
    const parts = item.split(/[:=]/)
    if (parts.length !== 3) {
      return false
    }

    // Extracting the address part
    const address = parts[2]

    return ethers.isAddress(address)
  })
}

const isUnlabeledContracts = (ary: any): boolean => {
  return (
    Array.isArray(ary) &&
    ary.every(
      ({ address, initCodeWithArgs }) =>
        ethers.isAddress(address) && typeof initCodeWithArgs === 'string'
    )
  )
}

export const isExecutionArtifact = (obj: any): obj is ExecutionArtifact => {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    obj._format === 'sphinx-sol-execution-artifact-1' &&
    Array.isArray(obj.transactions) &&
    obj.transactions.every(
      (tx) =>
        isNonNullObject(tx) &&
        isSphinxTransactionResponse(tx.response) &&
        isSphinxTransactionReceipt(tx.receipt)
    ) &&
    typeof obj.merkleRoot === 'string' &&
    Array.isArray(obj.solcInputHashes) &&
    obj.solcInputHashes.every((hash) => typeof hash === 'string') &&
    typeof obj.safeAddress === 'string' &&
    typeof obj.moduleAddress === 'string' &&
    typeof obj.executorAddress === 'string' &&
    typeof obj.nonce === 'string' &&
    typeof obj.chainId === 'string' &&
    obj.actions.every(isSphinxTransaction) &&
    typeof obj.sphinxConfig === 'object' &&
    obj.sphinxConfig !== null &&
    typeof obj.sphinxConfig.projectName === 'string' &&
    typeof obj.sphinxConfig.orgId === 'string' &&
    Array.isArray(obj.sphinxConfig.owners) &&
    obj.sphinxConfig.owners.every((owner) => typeof owner === 'string') &&
    Array.isArray(obj.sphinxConfig.mainnets) &&
    obj.sphinxConfig.mainnets.every((net) => typeof net === 'string') &&
    Array.isArray(obj.sphinxConfig.testnets) &&
    obj.sphinxConfig.testnets.every((net) => typeof net === 'string') &&
    typeof obj.sphinxConfig.threshold === 'string' &&
    typeof obj.sphinxConfig.saltNonce === 'string' &&
    typeof obj.executionMode === 'number' &&
    typeof obj.initialState === 'object' &&
    obj.initialState !== null &&
    typeof obj.initialState.isSafeDeployed === 'boolean' &&
    typeof obj.initialState.isModuleDeployed === 'boolean' &&
    typeof obj.initialState.isExecuting === 'boolean' &&
    isUnlabeledContracts(obj.unlabeledContracts) &&
    typeof obj.arbitraryChain === 'boolean' &&
    isLibraryArray(obj.libraries) &&
    (typeof obj.gitCommit === 'string' || obj.gitCommit === null) &&
    (typeof obj.safeInitData === 'string' || obj.safeInitData === null)
  )
}

export const isReceiptEarlier = (
  receipt1: SphinxTransactionReceipt,
  receipt2: SphinxTransactionReceipt
): boolean => {
  if (receipt1.blockNumber < receipt2.blockNumber) {
    return true
  } else if (
    receipt1.blockNumber === receipt2.blockNumber &&
    receipt1.index < receipt2.index
  ) {
    return true
  }
  return false
}

export const getCompilerInputDirName = (
  executionMode: ExecutionMode
): string => {
  if (executionMode === ExecutionMode.LocalNetworkCLI) {
    return 'compiler-inputs-local'
  } else if (
    executionMode === ExecutionMode.LiveNetworkCLI ||
    executionMode === ExecutionMode.Platform
  ) {
    return 'compiler-inputs'
  } else {
    throw new Error(`Unknown execution mode.`)
  }
}
