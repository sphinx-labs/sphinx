import {
  isRawCreate2ActionInput,
  isRawFunctionCallActionInput,
  isString,
  ActionInput,
  ConfigArtifacts,
  DeploymentInfo,
  FunctionCallActionInput,
  ParsedConfig,
  RawActionInput,
  RawCreate2ActionInput,
  RawFunctionCallActionInput,
  SphinxActionType,
  networkEnumToName,
  assertValidProjectName,
  ParsedContractDeployment,
  DecodedAction,
  ParsedVariable,
  getAbiEncodedConstructorArgs,
  decodeCall,
  AccountAccessKind,
  CreateActionInput,
  encodeCreateCall,
  decodeDeterministicDeploymentProxyData,
  Create2ActionInput,
} from '@sphinx-labs/core'
import { AbiCoder, ConstructorFragment, ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  Operation,
  recursivelyConvertResult,
  getCurrentGitCommitHash,
  getCreateCallAddress,
} from '@sphinx-labs/contracts'

import { FoundrySingleChainDryRun } from './types'
import {
  assertValidAccountAccesses,
  convertLibraryFormat,
  findFullyQualifiedNameForAddress,
  findFullyQualifiedNameForInitCode,
  findFunctionFragment,
  isCreate2AccountAccess,
  parseNestedContractDeployments,
} from './utils'

export const decodeDeploymentInfo = (
  abiEncodedDeploymentInfo: string,
  sphinxPluginTypesInterface: ethers.Interface
): DeploymentInfo => {
  const deploymentInfoFragment = findFunctionFragment(
    sphinxPluginTypesInterface,
    'getDeploymentInfo'
  )

  const deploymentInfoResult = AbiCoder.defaultAbiCoder().decode(
    deploymentInfoFragment.outputs,
    abiEncodedDeploymentInfo
  )

  const { deploymentInfo: deploymentInfoBigInt } = recursivelyConvertResult(
    deploymentInfoFragment.outputs,
    deploymentInfoResult
  ) as any

  const {
    safeAddress,
    moduleAddress,
    executorAddress,
    nonce,
    chainId,
    blockGasLimit,
    initialState,
    executionMode,
    newConfig,
    requireSuccess,
    safeInitData,
    arbitraryChain,
    sphinxLibraryVersion,
    accountAccesses,
    gasEstimates,
  } = deploymentInfoBigInt

  const deploymentInfo: DeploymentInfo = {
    safeAddress,
    moduleAddress,
    safeInitData,
    executorAddress,
    requireSuccess,
    nonce: nonce.toString(),
    chainId: chainId.toString(),
    blockGasLimit: blockGasLimit.toString(),
    initialState: {
      ...initialState,
    },
    executionMode: Number(executionMode),
    newConfig: {
      ...newConfig,
      testnets: newConfig.testnets.map(networkEnumToName),
      mainnets: newConfig.mainnets.map(networkEnumToName),
      threshold: newConfig.threshold.toString(),
      saltNonce: newConfig.saltNonce.toString(),
    },
    arbitraryChain,
    sphinxLibraryVersion,
    accountAccesses,
    gasEstimates,
  }

  assertValidProjectName(deploymentInfo.newConfig.projectName)
  assertValidAccountAccesses(
    deploymentInfo.accountAccesses,
    deploymentInfo.safeAddress
  )

  return deploymentInfo
}

export const makeParsedConfig = (
  deploymentInfo: DeploymentInfo,
  isSystemDeployed: boolean,
  configArtifacts: ConfigArtifacts,
  libraries: Array<string>,
  dryRunPath: string
): ParsedConfig => {
  const {
    safeAddress,
    moduleAddress,
    nonce,
    chainId,
    blockGasLimit,
    newConfig,
    executionMode,
    initialState,
    safeInitData,
    arbitraryChain,
    requireSuccess,
    accountAccesses,
    gasEstimates,
  } = deploymentInfo

  const parsedActionInputs: Array<ActionInput> = []
  const unlabeledContracts: ParsedConfig['unlabeledContracts'] = []
  // We start with an action index of 1 because the `APPROVE` leaf always has an index of 0, which
  // means the `EXECUTE` leaves start with an index of 1.
  let actionIndex = 1
  for (let i = 0; i < accountAccesses.length; i++) {
    const accountAccess = accountAccesses[i]
    if (accountAccess.accessor !== safeAddress) {
      continue
    }

    const gas = gasEstimates[i].toString()

    const nextAccountAccesses = accountAccesses.slice(i + 1)
    const { parsedContracts, unlabeled } = parseNestedContractDeployments(
      nextAccountAccesses,
      safeAddress,
      configArtifacts
    )
    unlabeledContracts.push(...unlabeled)

    if (accountAccess.kind === AccountAccessKind.Create) {
      const initCodeWithArgs = accountAccess.data
      const address = accountAccess.account
      const fullyQualifiedName = findFullyQualifiedNameForInitCode(
        initCodeWithArgs,
        configArtifacts
      )

      const decodedAction = makeContractDeploymentDecodedAction(
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
        contractAddress: address,
        initCodeWithArgs,
        contracts: parsedContracts,
        index: actionIndex.toString(),
        decodedAction,
        gas,
        requireSuccess,
        value: '0', // TODO(docs): `value` is always unused for `DelegateCall` operations. Instead, value is transferred via `performCreate` below.
        operation: Operation.DelegateCall,
        to: getCreateCallAddress(),
        txData: encodeCreateCall(accountAccess.value, initCodeWithArgs),
      }
      parsedActionInputs.push(action)
    } else if (
      isCreate2AccountAccess(accountAccess, accountAccesses.at(i + 1))
    ) {
      const { create2Address, initCodeWithArgs } =
        decodeDeterministicDeploymentProxyData(accountAccess.data)

      const fullyQualifiedName = findFullyQualifiedNameForInitCode(
        initCodeWithArgs,
        configArtifacts
      )

      const decodedAction = makeContractDeploymentDecodedAction(
        create2Address,
        initCodeWithArgs,
        configArtifacts,
        fullyQualifiedName
      )

      const action: Create2ActionInput = {
        create2Address,
        initCodeWithArgs,
        contracts: parsedContracts,
        index: actionIndex.toString(),
        decodedAction,
        gas,
        requireSuccess,
        value: accountAccess.value.toString(),
        operation: Operation.Call,
        to: DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        txData: accountAccess.data,
      }
      parsedActionInputs.push(action)
    } else if (isRawFunctionCallActionInput(input)) {
      // Find the fully qualified name that corresponds to the `to` address, if such a fully
      // qualified name exists. We'll use the fully qualified name to create the decoded action.
      const fullyQualifiedName = findFullyQualifiedNameForAddress(
        input.to,
        rawInputs,
        configArtifacts
      )

      const decodedAction = makeFunctionCallDecodedAction(
        input.to,
        input.txData,
        configArtifacts,
        dryRunPath,
        fullyQualifiedName
      )

      const callInput: FunctionCallActionInput = {
        contracts: parsedContracts,
        index: actionIndex.toString(),
        decodedAction,
        ...input,
        gas,
      }

      parsedActionInputs.push(callInput)
    } else {
      throw new Error(`Unknown action input type. Should never happen.`)
    }
    actionIndex += 1
  }

  const parsedConfig: ParsedConfig = {
    safeAddress,
    moduleAddress,
    safeInitData,
    nonce,
    chainId,
    blockGasLimit,
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

  return parsedConfig
}

export const makeContractDeploymentDecodedAction = (
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
  dryRunPath: string,
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
      : [
          data.length > 1000
            ? `Very large calldata. View it in Foundry's dry run file: ${dryRunPath}`
            : data,
        ]

    return {
      referenceName: contractName,
      functionName,
      variables,
      address: to,
    }
  } else {
    const variables = [
      data.length > 1000
        ? `Very large calldata. View it in Foundry's dry run file: ${dryRunPath}`
        : data,
    ]
    return {
      referenceName: to,
      functionName: 'call',
      variables,
      address: '',
    }
  }
}

// TODO(end): did you remove contracti? if so, mark ticket as 'in review'.

// TODO(md): do you mention broadcasting anywhere in user docs? if so, change this language.

// TODO(later-later): test: in `makeParsedConfig`, do we handle the situation where there's a call
// at the end of the account access array? specifically, there shouldn't be an array out of bounds
// error when we attempt to get all of the elements after the current element, which could occur
// when we're finding the contract deployments for the current account access.

// TODO(docs): document somewhere why we have actionInput.contracts instead of
// parsedConfig.contracts (i.e. answer "why do we need to know the contracts deployed in each
// action?"). the answer is that we need to know this when we're creating the contract deployment
// artifact, specifically so that we can know which txn receipt corresponds to the contract.

// TODO(later-later): when you're validating the AccountAccess array, make sure that you're only
// validating the actions from the gnosis safe. users should be able to e.g. transfer funds from
// randomContractOne to randomContractTwo as long as it doesn't involve sending ETH from the gnosis
// safe.

// TODO(later-later): somewhere in typescript, you should sanity check that the gasEstimates array's
// length equals the actionInputs array's length. i guess you'll need to do this at the end of
// `makeParsedConfig` or after it finishes.

// TODO(end): make a ticket to change the sample contract to use `create` instead of `create2`,
// which allows us to get rid of the weird create2 salt thing.

// TODO(later): make sure you aren't adding misc AccountAccessKinds in `makeParsedConfig`. e.g.
// `kind.Delegatecall`.

// TODO(later-later): make sure that you run the demo tests in CI. if they're disabled, run them
// locally.
