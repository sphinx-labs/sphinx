import {
  ActionInput,
  ConfigArtifacts,
  ParsedDeploymentInfo,
  FunctionCallActionInput,
  ParsedConfig,
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
  Libraries,
  MinimalAccountAccess,
  ParsedAccountAccessHierarchy,
  inferDeployerNonce,
  resolveAllLibraryPlaceholders,
  SphinxJsonRpcProvider,
} from '@sphinx-labs/core'
import { AbiCoder, ConstructorFragment, ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  Operation,
  recursivelyConvertResult,
  getCurrentGitCommitHash,
  getCreateCallAddress,
  add0x,
} from '@sphinx-labs/contracts'

import {
  assertValidAccountAccesses,
  assertValidLinkedLibraries,
  convertLibraries,
  findFullyQualifiedNameForAddress,
  findFullyQualifiedNameForInitCode,
  findFullyQualifiedNames,
  findFunctionFragment,
  isCreate2AccountAccess,
  isParsedDeploymentInfo,
  parseNestedContractDeployments,
  readContractArtifact,
  toParsedAccountAccessHierarchy,
} from './utils'
import { FoundryToml } from './types'

export const decodeDeploymentInfo = (
  serializedDeploymentInfo: string,
  sphinxPluginTypesInterface: ethers.Interface,
  libraries: Libraries,
  libraryAccountAccesses: Array<ParsedAccountAccessHierarchy>,
  libraryGasEstimates: Array<string>
): ParsedDeploymentInfo => {
  const parsed = JSON.parse(serializedDeploymentInfo)

  const rawAccountAccessHierarchyFragment = findFunctionFragment(
    sphinxPluginTypesInterface,
    'rawAccountAccessHierarchyType'
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

  const gasEstimates = libraryGasEstimates.concat(
    abiDecodeUint256Array(parsed.gasEstimates)
  )

  // ABI decode each `RawAccountAccessHierarchy` individually.
  const scriptAccountAccesses = parsed.encodedAccountAccesses
    .map((encoded) => {
      const decodedResult = coder.decode(
        rawAccountAccessHierarchyFragment.outputs,
        encoded
      )
      // Convert the `RawAccountAccessHierarchy` to its proper type.
      const { rawAccountAccessHierarchy } = recursivelyConvertResult(
        rawAccountAccessHierarchyFragment.outputs,
        decodedResult
      ) as any
      return rawAccountAccessHierarchy
    })
    // Parse the account access hierarchies.
    .map(toParsedAccountAccessHierarchy)

  const accountAccesses = libraryAccountAccesses.concat(scriptAccountAccesses)

  const deploymentInfo: ParsedDeploymentInfo = {
    safeAddress,
    moduleAddress,
    safeInitData,
    executorAddress,
    requireSuccess,
    nonce,
    chainId,
    blockGasLimit,
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
    libraries,
  }

  if (!isParsedDeploymentInfo(deploymentInfo)) {
    throw new Error(`Invalid DeploymentInfo object. Should never happen.`)
  }

  assertValidProjectName(deploymentInfo.newConfig.projectName)
  assertValidAccountAccesses(
    deploymentInfo.accountAccesses,
    deploymentInfo.safeAddress
  )

  return deploymentInfo
}

export const makeParsedConfig = (
  deploymentInfo: ParsedDeploymentInfo,
  isSystemDeployed: boolean,
  configArtifacts: ConfigArtifacts
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
    libraries,
  } = deploymentInfo

  // Each Merkle leaf must have a gas amount that's at most 80% of the block gas limit. This ensures
  // that it's possible to execute the transaction on-chain. Specifically, there must be enough gas
  // to execute the Sphinx Module's logic, which isn't included in the gas estimate of the Merkle
  // leaf. The 80% was chosen arbitrarily.
  const maxAllowedGasPerLeaf = (BigInt(8) * BigInt(blockGasLimit)) / BigInt(10)

  const parsedActionInputs: Array<ActionInput> = []
  const unlabeledContracts: ParsedConfig['unlabeledContracts'] = []
  for (let i = 0; i < accountAccesses.length; i++) {
    const { root, nested } = accountAccesses[i]
    const gas = gasEstimates[i].toString()

    if (BigInt(gas) > maxAllowedGasPerLeaf) {
      throw new Error(
        `Estimated gas for a transaction is too close to the block gas limit.`
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
    libraries: convertLibraries(libraries),
    gitCommit: getCurrentGitCommitHash(),
  }

  return parsedConfig
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

export const inferLinkedLibraries = async (
  serializedDeploymentInfo: string,
  scriptPath: string,
  initialGnosisSafeNonce: number,
  foundryToml: FoundryToml,
  projectRoot: string,
  provider: SphinxJsonRpcProvider,
  targetContract?: string
): Promise<{
  libraries: Libraries
  libraryAccountAccesses: Array<ParsedAccountAccessHierarchy>
  libraryGasEstimates: Array<string>
}> => {
  const { scriptDeployedCode, safeAddress } = JSON.parse(
    serializedDeploymentInfo
  )

  const { artifactFolder, cachePath, buildInfoFolder } = foundryToml

  let fullyQualifiedName: string
  if (targetContract) {
    fullyQualifiedName = `${scriptPath}:${targetContract}`
  } else {
    // Find the script's fully qualified name using its source name (i.e. the script path).
    const fullyQualifiedNames = await findFullyQualifiedNames(
      scriptPath,
      cachePath,
      projectRoot,
      buildInfoFolder
    )
    // We can safely assume that there's a single fully qualified name in the array returned by
    // `findFullyQualifiedNames` because the user's Forge script was executed successfully before
    // this function was called, which means there must only be a single contract.
    fullyQualifiedName = fullyQualifiedNames[0]
  }

  const scriptArtifact = await readContractArtifact(
    fullyQualifiedName,
    projectRoot,
    artifactFolder
  )

  const { linkReferences, deployedLinkReferences } = scriptArtifact

  assertValidLinkedLibraries(linkReferences, deployedLinkReferences)

  const libraries: Libraries = {}
  for (const sourceName of Object.keys(deployedLinkReferences)) {
    for (const [libraryName, references] of Object.entries(
      deployedLinkReferences[sourceName]
    )) {
      // TODO(docs): we only use the first element b/c each element corresponds to the same address.
      // there shouldn't be any situation where the array's length is 0, but we check this here just
      // to be safe.
      if (references.length > 0) {
        const ref = references[0]
        const start = 2 + ref.start * 2 // Adjusting for '0x' prefix and hex encoding
        const rawLibraryAddress = scriptDeployedCode.substring(
          start,
          start + ref.length * 2
        )
        const libraryAddress = ethers.getAddress(add0x(rawLibraryAddress))

        libraries[sourceName][libraryName] = libraryAddress
      }
    }
  }

  const numLibraries = Object.values(libraries).reduce(
    (acc, current) => acc + Object.keys(current).length,
    0
  )
  const gnosisSafeNonceAfterLibraries = initialGnosisSafeNonce + numLibraries

  // TODO(docs): we put this in a separate for-loop because we need the entire `libraries` object in
  // order to resolve the libraries' init code. this is b/c the libraries may reference other
  // libraries.

  const accountAccessesWithNonce: Array<{
    accountAccess: ParsedAccountAccessHierarchy
    nonce: number
  }> = []
  for (const sourceName of Object.keys(libraries)) {
    for (const [libraryName, libraryAddress] of Object.entries(
      libraries[sourceName]
    )) {
      const libraryArtifact = await readContractArtifact(
        `${sourceName}:${libraryName}`,
        projectRoot,
        artifactFolder
      )

      const libraryInitCode = resolveAllLibraryPlaceholders(
        libraryArtifact.bytecode,
        libraryArtifact.linkReferences,
        libraries
      )

      const nonce = inferDeployerNonce(
        safeAddress,
        libraryAddress,
        initialGnosisSafeNonce,
        gnosisSafeNonceAfterLibraries
      )

      const rootAccountAccess: MinimalAccountAccess = {
        kind: AccountAccessKind.Create,
        account: libraryAddress,
        accessor: safeAddress,
        value: '0', // TODO(docs)
        data: libraryInitCode,
      }
      accountAccessesWithNonce.push({
        accountAccess: {
          root: rootAccountAccess,
          nested: [],
        },
        nonce,
      })
    }
  }

  const libraryAccountAccesses = accountAccessesWithNonce
    // TODO(docs): sort in ascending order according to the nonce
    .sort((a, b) => a.nonce - b.nonce)
    .map(({ accountAccess }) => accountAccess)

  // TODO(docs): mention that it doesn't matter who the sender is b/c libraries can't have
  // constructors or non-constant state variables.
  const gasEstimatesBigInt = await Promise.all(
    libraryAccountAccesses.map((accountAccess) =>
      provider.estimateGas({
        data: accountAccess.root.data,
      })
    )
  )
  const libraryGasEstimates = gasEstimatesBigInt.map((estimate) =>
    estimate.toString()
  )

  return { libraries, libraryAccountAccesses, libraryGasEstimates }
}

// TODO(later): probably put pre-linked libraries from foundry.toml in the parsedconfig and
// deployment artifacts.

// TODO(later): do we need to bring back `convertLibraryFormat` to support pre-linked
// libraries from foundry.toml?

// TODO(docs): assertValidLinkedLibraries: check that the linkReferences and deployedLinkReferences
// contain the same libraries. it's important to check this b/c we need to deploy every library that
// foundry deploys in order to maintain the correct library addresses. e.g. say LibraryA uses Gnosis
// Safe nonce 1 and is in the artifact init code, and LibraryB uses nonce 2 and is in the deployed
// code. we can't deploy LibB on-chain without also deploying LibA.

// TODO(end): ticket: deploy only the necessary libraries. blocked by foundry's issue b/c we need to
// maintain the same library addresses that foundry uses, otherwise the addresses of everything
// deployed via `CREATE` will be messed up. e.g. say LibraryA uses Gnosis Safe nonce 1 and we remove
// it since it's not used by a prod contract. if LibraryB uses nonce 2 in the script, it'll have a
// different address in the script and on-chain, which will impact the contract that uses LibraryB.

// TODO(end): say this somewhere: to support libraries in the constructor of the script, we need to
// account for the fact that the constructor libraries may not exist inside of the contract `Create`
// actions, in which case this strategy won't work.
