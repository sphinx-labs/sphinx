import {
  ActionInput,
  ConfigArtifacts,
  DeploymentInfo,
  FunctionCallActionInput,
  NetworkConfig,
  networkEnumToName,
  assertValidProjectName,
  DecodedAction,
  ParsedVariable,
  getAbiEncodedConstructorArgs,
  decodeCall,
  AccountAccessKind,
  CreateActionInput,
  encodeCreateCall,
  decodeDeterministicDeploymentProxyData,
  Create2ActionInput,
  ActionInputType,
  fetchNameForNetwork,
} from '@sphinx-labs/core'
import { AbiCoder, ConstructorFragment, ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  Operation,
  recursivelyConvertResult,
  getCurrentGitCommitHash,
  getCreateCallAddress,
} from '@sphinx-labs/contracts'

import {
  convertLibraryFormat,
  findFullyQualifiedNameForAddress,
  findFullyQualifiedNameForInitCode,
  findFunctionFragment,
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
      mainnets: parsed.newConfig.mainnets.map(networkEnumToName),
      testnets: parsed.newConfig.testnets.map(networkEnumToName),
      threshold: abiDecodeUint256(parsed.newConfig.threshold),
      saltNonce: abiDecodeUint256(parsed.newConfig.saltNonce),
    },
    arbitraryChain,
    sphinxLibraryVersion: abiDecodeString(sphinxLibraryVersion),
    accountAccesses,
    gasEstimates,
  }

  if (!isDeploymentInfo(deploymentInfo)) {
    throw new Error(`Invalid DeploymentInfo object. Should never happen.`)
  }

  assertValidProjectName(deploymentInfo.newConfig.projectName)

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
  } = deploymentInfo

  // Each Merkle leaf must have a gas amount that's at most 80% of the block gas limit. This ensures
  // that it's possible to execute the transaction on-chain. Specifically, there must be enough gas
  // to execute the Sphinx Module's logic, which isn't included in the gas estimate of the Merkle
  // leaf. The 80% was chosen arbitrarily.
  const maxAllowedGasPerLeaf =
    (BigInt(80) * BigInt(blockGasLimit)) / BigInt(100)

  const parsedActionInputs: Array<ActionInput> = []
  const unlabeledContracts: NetworkConfig['unlabeledContracts'] = []
  for (let i = 0; i < accountAccesses.length; i++) {
    const { root, nested } = accountAccesses[i]
    const gas = gasEstimates[i].toString()

    if (BigInt(gas) > maxAllowedGasPerLeaf) {
      const networkName = fetchNameForNetwork(BigInt(chainId))
      throw new Error(
        `Estimated gas for a transaction is too close to the block gas limit on ${networkName}.`
      )
    }

    const { parsedContracts, unlabeled } = parseNestedContractDeployments(
      nested,
      configArtifacts
    )
    unlabeledContracts.push(...unlabeled)

    // The index of `EXECUTE` Merkle leaves starts at 1 because the `APPROVE` leaf always has an
    // index of 0.
    const executeActionIndex = i + 1

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
        fullyQualifiedName
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
      parsedActionInputs.push(action)
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
        fullyQualifiedName
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
      parsedActionInputs.push(action)
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

      parsedActionInputs.push(callInput)
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
  }

  return networkConfig
}

export const makeContractDecodedAction = (
  contractAddress: string,
  initCodeWithArgs: string,
  configArtifacts: ConfigArtifacts,
  fullyQualifiedName?: string
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
    }
  } else {
    return {
      referenceName: contractAddress,
      functionName: 'deploy',
      variables: [],
      address: contractAddress,
    }
  }
}

export const makeFunctionCallDecodedAction = (
  to: string,
  data: string,
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
