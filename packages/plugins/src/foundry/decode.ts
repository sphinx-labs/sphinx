import {
  ActionInput,
  ConfigArtifacts,
  DeploymentInfo,
  FunctionCallActionInput,
  NetworkConfig,
  DecodedAction,
  ParsedVariable,
  getAbiEncodedConstructorArgs,
  decodeCall,
  CreateActionInput,
  encodeCreateCall,
  decodeDeterministicDeploymentProxyData,
  Create2ActionInput,
  ActionInputType,
  fetchNameForNetwork,
  getMaxGasLimit,
  prettyFunctionCall,
  calculateMerkleLeafGas,
} from '@sphinx-labs/core'
import { AbiCoder, ConstructorFragment, ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  Operation,
  recursivelyConvertResult,
  getCreateCallAddress,
  AccountAccessKind,
} from '@sphinx-labs/contracts'

import {
  convertLibraryFormat,
  findFullyQualifiedNameForAddress,
  findFullyQualifiedNameForInitCode,
  findFunctionFragment,
  getCurrentGitCommitHash,
  isCreate2AccountAccess,
  isDeploymentInfo,
  parseNestedContractDeployments,
} from './utils'

export const decodeDeploymentInfo = (
  serializedDeploymentInfo: string,
  sphinxPluginTypesInterface: ethers.Interface,
  blockNumber: number
): DeploymentInfo => {
  const parsed = JSON.parse(serializedDeploymentInfo)

  const parsedAccountAccessFragment = findFunctionFragment(
    sphinxPluginTypesInterface,
    'parsedAccountAccessType'
  )

  const coder = AbiCoder.defaultAbiCoder()

  const {
    safeAddress,
    moduleAddress,
    executorAddress,
    initialState,
    requireSuccess,
    safeInitData,
    arbitraryChain,
    sphinxLibraryVersion,
  } = parsed

  const blockGasLimit = abiDecodeUint256(parsed.blockGasLimit)
  const chainId = abiDecodeUint256(parsed.chainId)
  const executionMode = abiDecodeUint256(parsed.executionMode)
  const nonce = abiDecodeUint256(parsed.nonce)
  const fundsRequestedForSafe = abiDecodeUint256(parsed.fundsRequestedForSafe)
  const safeStartingBalance = abiDecodeUint256(parsed.safeStartingBalance)

  const gasEstimates = abiDecodeUint256Array(parsed.gasEstimates)

  // ABI decode each `ParsedAccountAccess` individually.
  const accountAccesses = parsed.encodedAccountAccesses.map((encoded) => {
    const decodedResult = coder.decode(
      parsedAccountAccessFragment.outputs,
      encoded
    )
    // Convert the `AccountAccess` to its proper type.
    const { parsedAccountAccess } = recursivelyConvertResult(
      parsedAccountAccessFragment.outputs,
      decodedResult
    ) as any
    return parsedAccountAccess
  })

  const deploymentInfo: DeploymentInfo = {
    safeAddress,
    moduleAddress,
    safeInitData,
    executorAddress,
    requireSuccess,
    nonce,
    chainId,
    blockGasLimit,
    blockNumber: blockNumber.toString(),
    initialState: {
      ...initialState,
    },
    executionMode: Number(executionMode),
    newConfig: {
      projectName: abiDecodeString(parsed.newConfig.projectName),
      orgId: abiDecodeString(parsed.newConfig.orgId),
      owners: parsed.newConfig.owners,
      mainnets: parsed.newConfig.mainnets,
      testnets: parsed.newConfig.testnets,
      threshold: abiDecodeUint256(parsed.newConfig.threshold),
      saltNonce: abiDecodeUint256(parsed.newConfig.saltNonce),
    },
    arbitraryChain,
    sphinxLibraryVersion: abiDecodeString(sphinxLibraryVersion),
    accountAccesses,
    gasEstimates,
    fundsRequestedForSafe,
    safeStartingBalance,
  }

  if (!isDeploymentInfo(deploymentInfo)) {
    throw new Error(`Invalid DeploymentInfo object. Should never happen.`)
  }

  return deploymentInfo
}

export const makeNetworkConfig = (
  deploymentInfo: DeploymentInfo,
  isSystemDeployed: boolean,
  configArtifacts: ConfigArtifacts,
  libraries: Array<string>
): NetworkConfig => {
  const {
    safeAddress,
    moduleAddress,
    nonce,
    chainId,
    blockGasLimit,
    blockNumber,
    newConfig,
    executionMode,
    initialState,
    safeInitData,
    arbitraryChain,
    requireSuccess,
    accountAccesses,
    gasEstimates,
    fundsRequestedForSafe,
    safeStartingBalance,
  } = deploymentInfo

  const parsedActionInputs: Array<ActionInput> = []
  const unlabeledContracts: NetworkConfig['unlabeledContracts'] = []
  for (let i = 0; i < accountAccesses.length; i++) {
    const { root, nested } = accountAccesses[i]
    const gas = calculateMerkleLeafGas(
      BigInt(chainId),
      gasEstimates[i].toString()
    )

    const { parsedContracts, unlabeled } = parseNestedContractDeployments(
      nested,
      configArtifacts
    )
    unlabeledContracts.push(...unlabeled)

    // The index of `EXECUTE` Merkle leaves starts at 1 because the `APPROVE` leaf always has an
    // index of 0.
    const executeActionIndex = i + 1

    let actionInput: ActionInput
    if (root.kind === AccountAccessKind.Create) {
      const initCodeWithArgs = root.data
      const address = root.account
      const fullyQualifiedName = findFullyQualifiedNameForInitCode(
        initCodeWithArgs,
        configArtifacts
      )

      const decodedAction = makeContractDecodedAction(
        address,
        initCodeWithArgs,
        configArtifacts,
        fullyQualifiedName,
        root.value
      )

      // If the fully qualified name exists, add the contract deployed to the list of parsed
      // contracts. Otherwise, mark it as unlabeled.
      if (fullyQualifiedName) {
        parsedContracts.push({
          address,
          fullyQualifiedName,
          initCodeWithArgs,
        })
      } else {
        unlabeledContracts.push({
          address,
          initCodeWithArgs,
        })
      }

      const action: CreateActionInput = {
        actionType: ActionInputType.CREATE,
        contractAddress: address,
        initCodeWithArgs,
        contracts: parsedContracts,
        index: executeActionIndex.toString(),
        decodedAction,
        gas,
        requireSuccess,
        // The `value` field is always unused for `DelegateCall` operations. Instead, value is
        // transferred via `performCreate` in the `txData` below.
        value: '0',
        operation: Operation.DelegateCall,
        to: getCreateCallAddress(),
        txData: encodeCreateCall(root.value, initCodeWithArgs),
      }
      actionInput = action
    } else if (isCreate2AccountAccess(root, nested)) {
      const { create2Address, initCodeWithArgs } =
        decodeDeterministicDeploymentProxyData(root.data)

      const fullyQualifiedName = findFullyQualifiedNameForInitCode(
        initCodeWithArgs,
        configArtifacts
      )

      const decodedAction = makeContractDecodedAction(
        create2Address,
        initCodeWithArgs,
        configArtifacts,
        fullyQualifiedName,
        root.value
      )

      const action: Create2ActionInput = {
        actionType: ActionInputType.CREATE2,
        create2Address,
        initCodeWithArgs,
        contracts: parsedContracts,
        index: executeActionIndex.toString(),
        decodedAction,
        gas,
        requireSuccess,
        value: root.value.toString(),
        operation: Operation.Call,
        to: DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        txData: root.data,
      }
      actionInput = action
    } else if (root.kind === AccountAccessKind.Call) {
      const to = root.account

      // Find the fully qualified name that corresponds to the `to` address, if such a fully
      // qualified name exists. We'll use the fully qualified name to create the decoded action.
      const fullyQualifiedName = findFullyQualifiedNameForAddress(
        to,
        accountAccesses,
        configArtifacts
      )

      const decodedAction = makeFunctionCallDecodedAction(
        to,
        root.data,
        root.value.toString(),
        configArtifacts,
        fullyQualifiedName
      )

      const callInput: FunctionCallActionInput = {
        actionType: ActionInputType.CALL,
        contracts: parsedContracts,
        index: executeActionIndex.toString(),
        decodedAction,
        gas,
        requireSuccess,
        value: root.value.toString(),
        operation: Operation.Call,
        to,
        txData: root.data,
      }
      actionInput = callInput
    } else {
      throw new Error(`Invalid action input. Should never happen.`)
    }

    parsedActionInputs.push(actionInput)

    // Check if the estimated gas exceeds the max batch gas limit. It's not necessary to check this
    // here because the simulation will throw an error if it can't find a valid batch size. However,
    // we check this here anyways so that we can display an error to the user earlier in the
    // process. If the estimated gas is less than the max batch gas limit but it can't fit into a
    // batch, the simulation will throw an error.
    const maxGasLimit = getMaxGasLimit(BigInt(blockGasLimit))
    if (BigInt(gas) > maxGasLimit) {
      const networkName = fetchNameForNetwork(BigInt(chainId))
      const { referenceName, address, functionName, variables, value } =
        actionInput.decodedAction
      throw new Error(
        `Estimated gas for the following transaction is too high to be executed by Sphinx on ${networkName}:\n` +
          prettyFunctionCall(
            referenceName,
            address,
            functionName,
            variables,
            chainId,
            value,
            5,
            3
          )
      )
    }
  }

  // Sanity check that the number of gas estimates equals the number of actions.
  if (parsedActionInputs.length !== gasEstimates.length) {
    throw new Error(
      `Parsed action input array length (${parsedActionInputs.length}) does not equal gas\n` +
        `estimates array length (${gasEstimates.length}). Should never happen.`
    )
  }

  const networkConfig: NetworkConfig = {
    safeAddress,
    moduleAddress,
    safeInitData,
    nonce,
    chainId,
    blockGasLimit,
    blockNumber,
    newConfig,
    executionMode,
    initialState,
    isSystemDeployed,
    actionInputs: parsedActionInputs,
    unlabeledContracts,
    arbitraryChain,
    executorAddress: deploymentInfo.executorAddress,
    libraries: convertLibraryFormat(libraries),
    gitCommit: getCurrentGitCommitHash(),
    safeFundingRequest: {
      fundsRequested: fundsRequestedForSafe,
      startingBalance: safeStartingBalance,
    },
  }

  return networkConfig
}

export const makeContractDecodedAction = (
  contractAddress: string,
  initCodeWithArgs: string,
  configArtifacts: ConfigArtifacts,
  fullyQualifiedName: string | undefined,
  value: string
): DecodedAction => {
  if (fullyQualifiedName) {
    const coder = ethers.AbiCoder.defaultAbiCoder()
    const { artifact } = configArtifacts[fullyQualifiedName]
    const contractName = fullyQualifiedName.split(':')[1]
    const iface = new ethers.Interface(artifact.abi)
    const constructorFragment = iface.fragments.find(
      ConstructorFragment.isFragment
    )

    let variables: ParsedVariable = {}
    if (constructorFragment) {
      const encodedConstructorArgs = getAbiEncodedConstructorArgs(
        initCodeWithArgs,
        artifact.bytecode
      )
      const constructorArgsResult = coder.decode(
        constructorFragment.inputs,
        encodedConstructorArgs
      )
      variables = recursivelyConvertResult(
        constructorFragment.inputs,
        constructorArgsResult
      ) as ParsedVariable
    }

    return {
      referenceName: contractName,
      functionName: 'deploy',
      variables,
      address: contractAddress,
      value,
    }
  } else {
    return {
      referenceName: contractAddress,
      functionName: 'deploy',
      variables: [],
      address: contractAddress,
      value,
    }
  }
}

export const makeFunctionCallDecodedAction = (
  to: string,
  data: string,
  value: string,
  configArtifacts: ConfigArtifacts,
  fullyQualifiedName?: string
): DecodedAction => {
  if (fullyQualifiedName) {
    const { artifact } = configArtifacts[fullyQualifiedName]
    const contractName = fullyQualifiedName.split(':')[1]
    const iface = new ethers.Interface(artifact.abi)

    // Attempt to decode the call. This will return `undefined` if the call cannot be decoded, which
    // will happen if the function does not exist on the contract. For example, this will return
    // `undefined` if the contract's `fallback` function was called.
    const decoded = decodeCall(iface, data)
    const functionName = decoded ? decoded.functionName : 'call'
    const variables = decoded
      ? decoded.variables
      : [data.length > 1000 ? `Calldata is too large to display.` : data]

    return {
      referenceName: contractName,
      functionName,
      variables,
      address: to,
      value,
    }
  } else {
    const variables = [
      data.length > 1000 ? `Calldata is too large to display.` : data,
    ]
    return {
      referenceName: to,
      functionName: 'call',
      variables,
      address: '',
      value,
    }
  }
}

const abiDecodeUint256 = (encoded: string): string => {
  const coder = AbiCoder.defaultAbiCoder()
  const result = coder.decode(['uint256'], encoded)
  return result.toString()
}

const abiDecodeUint256Array = (encoded: string): Array<string> => {
  const coder = AbiCoder.defaultAbiCoder()
  const [result] = coder.decode(['uint256[]'], encoded)
  return result.map((r) => r.toString())
}

const abiDecodeString = (encoded: string): string => {
  const coder = AbiCoder.defaultAbiCoder()
  const result = coder.decode(['string'], encoded)
  return result.toString()
}
