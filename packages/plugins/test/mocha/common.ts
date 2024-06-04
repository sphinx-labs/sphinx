import { exec } from 'child_process'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

import {
  execAsync,
  sleep,
  DeploymentConfig,
  ConfigArtifacts,
  DeploymentInfo,
  ExecutionMode,
  SphinxJsonRpcProvider,
  makeDeploymentData,
  DeploymentArtifacts,
  SphinxTransactionReceipt,
  getSphinxWalletPrivateKey,
  makeDeploymentArtifacts,
  isReceiptEarlier,
  isContractDeploymentArtifact,
  isContractDeploymentArtifactExceptHistory,
  isExecutionArtifact,
  getCompilerInputDirName,
  getNetworkNameDirectory,
  fetchURLForNetwork,
  spawnAsync,
  fetchChainIdForNetwork,
  checkSystemDeployed,
  ensureSphinxAndGnosisSafeDeployed,
  attemptDeployment,
  signMerkleRoot,
  Deployment,
  fetchNameForNetwork,
  DeploymentContext,
  executeTransactionViaSigner,
  injectRoles,
  removeRoles,
  makeDeploymentConfig,
  getMaxGasLimit,
  Create2ActionInput,
  ActionInput,
  ActionInputType,
  FunctionCallActionInput,
  CreateActionInput,
  encodeCreateCall,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  getSphinxModuleImplAddress,
  getSphinxModuleProxyFactoryAddress,
  Operation,
  SphinxMerkleTree,
  makeSphinxMerkleTree,
  parseFoundryContractArtifact,
  ContractArtifact,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  isNonNullObject,
  CONTRACTS_LIBRARY_VERSION,
  AccountAccess,
  AccountAccessKind,
  ParsedAccountAccess,
  getCreateCallAddress,
  getGnosisSafeProxyAddress,
  getGnosisSafeInitializerData,
  getPermissionlessRelayAddress,
} from '@sphinx-labs/contracts'
import { expect } from 'chai'

import * as Reverter from '../../out/artifacts/Reverter.sol/Reverter.json'
import * as MyContract1Artifact from '../../out/artifacts/MyContracts.sol/MyContract1.json'
import * as MyContract2Artifact from '../../out/artifacts/MyContracts.sol/MyContract2.json'
import { getFoundryToml } from '../../src/foundry/options'
import { callForgeScriptFunction, makeGetConfigArtifacts } from '../../dist'
import {
  makeContractDecodedAction,
  makeFunctionCallDecodedAction,
  makeNetworkConfig,
} from '../../src/foundry/decode'
import { FoundrySingleChainBroadcast } from '../../src/foundry/types'
import {
  getInitCodeWithArgsArray,
  readFoundrySingleChainBroadcast,
} from '../../src/foundry/utils'

const blankAccountAccess: AccountAccess = {
  chainInfo: {
    forkId: '0',
    chainId: '0',
  },
  kind: AccountAccessKind.Call,
  account: ethers.ZeroAddress,
  accessor: ethers.ZeroAddress,
  initialized: false,
  oldBalance: '0',
  newBalance: '0',
  deployedCode: '0x',
  value: '0',
  data: '0x',
  reverted: false,
  storageAccesses: [],
}

export const getAnvilRpcUrl = (chainId: bigint): string => {
  return `http://127.0.0.1:${getAnvilPort(chainId)}`
}

const getAnvilPort = (chainId: bigint): bigint => {
  if (chainId === BigInt(31337)) {
    return BigInt(8545)
  } else {
    return BigInt(42000) + (chainId % BigInt(1000))
  }
}

export const startAnvilNodes = async (chainIds: Array<bigint>) => {
  for (const chainId of chainIds) {
    // Start an Anvil node with a fresh state. We must use `exec` instead of `execAsync`
    // because the latter will hang indefinitely.
    exec(`anvil --chain-id ${chainId} --port ${getAnvilPort(chainId)} &`)
  }

  await sleep(1000)
}

export const startForkedAnvilNodes = async (chainIds: Array<bigint>) => {
  for (const chainId of chainIds) {
    const forkUrl = fetchURLForNetwork(BigInt(chainId))
    // We must use `exec` instead of `execAsync` because the latter will hang indefinitely.
    exec(`anvil --fork-url ${forkUrl} --port ${getAnvilPort(chainId)} &`)
  }

  await sleep(10000)
}

export const killAnvilNodes = async (chainIds: Array<bigint>) => {
  for (const chainId of chainIds) {
    const port = getAnvilPort(chainId)

    if (await isPortOpen(port)) {
      await execAsync(`kill $(lsof -t -i:${port})`)
    }
  }
}

const isPortOpen = async (port: bigint): Promise<boolean> => {
  try {
    const { stdout } = await execAsync(`lsof -t -i:${port}`)
    return stdout.trim() !== ''
  } catch (error) {
    // If an error is thrown, it means the port is not in use
    return false
  }
}

export const getEIP1167CloneAddress = (
  implementation: string,
  salt: string,
  deployer: string
): string => {
  // EIP-1167 Clone Contract Initialization Code
  const initCode = ethers.concat([
    '0x3d602d80600a3d3981f3363d3d373d3d3d363d73',
    implementation,
    '0x5af43d82803e903d91602b57fd5bf3',
  ])

  const initCodeHash = ethers.keccak256(initCode)

  const saltPadded = ethers.zeroPadValue(ethers.toBeHex(salt), 32)

  return ethers.getCreate2Address(deployer, saltPadded, initCodeHash)
}

export const getSphinxModuleAddress = (
  owners: Array<string>,
  threshold: number,
  saltNonce: number
): string => {
  const safeProxyAddress = getGnosisSafeProxyAddress(
    owners,
    threshold,
    saltNonce
  )
  const salt = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256'],
      [
        safeProxyAddress,
        safeProxyAddress,
        // We always set the `saltNonce` of the Sphinx Module to `0` because the
        // `sphinxConfig.saltNonce` field is only used when deploying the Gnosis Safe. It's not
        // necessary to include the `saltNonce` here because a new Sphinx Module will be deployed if
        // the user sets the `sphinxConfig.saltNonce` to a new value and then deploys a new Gnosis
        // Safe using Sphinx's standard deployment method. A new Sphinx Module is deployed in this
        // scenario because its address is determined by the address of the Gnosis Safe. It'd only
        // be necessary to include a `saltNonce` for the Sphinx Module if a single Gnosis Safe wants
        // to enable multiple Sphinx Modules, which isn't a feature that we currently support.
        0,
      ]
    )
  )

  const moduleImplAddress = getSphinxModuleImplAddress()
  const moduleProxyFactoryAddress = getSphinxModuleProxyFactoryAddress()
  const cloneAddress = getEIP1167CloneAddress(
    moduleImplAddress,
    salt,
    moduleProxyFactoryAddress
  )

  return cloneAddress
}

export const makeAddress = (uint: number): string => {
  return ethers.zeroPadValue(ethers.toBeHex(uint), 20)
}

export const makeDeployment = async (
  merkleRootNonce: number,
  networkNames: Array<string>,
  projectName: string,
  owners: Array<ethers.Wallet>,
  threshold: number,
  executionMode: ExecutionMode,
  accountAccesses: Array<ParsedAccountAccess>,
  getRpcUrl: (chainId: bigint) => string
): Promise<{
  merkleTree: SphinxMerkleTree
  deploymentConfig: DeploymentConfig
  configArtifacts: ConfigArtifacts
}> => {
  const saltNonce = 0

  let executorAddress: string
  if (executionMode === ExecutionMode.LiveNetworkCLI) {
    if (owners.length !== 1) {
      throw new Error(`Only one owner is allowed on a live network`)
    }
    executorAddress = owners[0].address
  } else {
    executorAddress = getPermissionlessRelayAddress()
  }

  const ownerAddresses = owners.map((owner) => owner.address)

  const collectedPromises = networkNames.map(async (networkName) => {
    try {
      const chainId = fetchChainIdForNetwork(networkName)
      const provider = new SphinxJsonRpcProvider(getRpcUrl(chainId))
      const safeAddress = getGnosisSafeProxyAddress(
        ownerAddresses,
        threshold,
        saltNonce
      )
      const moduleAddress = getSphinxModuleAddress(
        ownerAddresses,
        threshold,
        saltNonce
      )

      if (!(await checkSystemDeployed(provider))) {
        const wallet = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)
        await ensureSphinxAndGnosisSafeDeployed(
          provider,
          wallet,
          executionMode,
          true
        )
      }

      const block = await provider.getBlock('latest')
      if (!block) {
        throw new Error(`Could not find block for ${chainId}`)
      }

      const numActionInputs = accountAccesses.length

      // We set the Merkle leaf gas fields to a high value based on the max batch size we allow on the network
      // to ensure that a very large contract deployment can fit in a batch. This is important to check on
      // networks like Scroll and Rootstock which have low block gas limits. (Scroll's block gas limit is 10
      // million, Rootstocks is 6.8 million). For example, A Merkle leaf gas field of 75% of the match batch size
      // on Scroll is 6 million gas and corresponds to a contract at the max size limit with a couple dozen SSTORES
      // in its constructor.
      const maxGasLimit = getMaxGasLimit(block.gasLimit)
      const gasEstimateSize = (maxGasLimit * BigInt(75)) / BigInt(100)

      const deploymentInfo: DeploymentInfo = {
        safeAddress,
        moduleAddress,
        safeInitData: getGnosisSafeInitializerData(ownerAddresses, threshold),
        executorAddress,
        requireSuccess: true,
        nonce: merkleRootNonce.toString(),
        chainId: chainId.toString(),
        blockGasLimit: block.gasLimit.toString(),
        blockNumber: block.number.toString(),
        initialState: {
          isSafeDeployed: (await provider.getCode(safeAddress)) !== '0x',
          isModuleDeployed: (await provider.getCode(moduleAddress)) !== '0x',
          isExecuting: false,
        },
        executionMode,
        newConfig: {
          projectName,
          owners: ownerAddresses,
          threshold: threshold.toString(),
          orgId: 'test-org-id',
          mainnets: [],
          testnets: [],
          saltNonce: saltNonce.toString(),
        },
        arbitraryChain: false,
        accountAccesses,
        gasEstimates: new Array(numActionInputs).fill(gasEstimateSize),
        sphinxLibraryVersion: CONTRACTS_LIBRARY_VERSION,
        fundsRequestedForSafe: '0',
        safeStartingBalance: '0',
      }

      return deploymentInfo
    } catch (error) {
      throw new Error(`Error in network ${networkName}: ${error}`)
    }
  })

  const deploymentInfoArray = await Promise.all(collectedPromises)

  const foundryToml = await getFoundryToml()
  const getConfigArtifacts = makeGetConfigArtifacts(
    foundryToml.artifactFolder,
    foundryToml.buildInfoFolder,
    process.cwd(),
    foundryToml.cachePath
  )

  const initCodeWithArgsArray = getInitCodeWithArgsArray(
    deploymentInfoArray.flatMap(
      (deploymentInfo) => deploymentInfo.accountAccesses
    )
  )

  const { configArtifacts, buildInfos } = await getConfigArtifacts(
    initCodeWithArgsArray
  )

  const networkConfigArray = deploymentInfoArray.map((deploymentInfo) => {
    return makeNetworkConfig(
      deploymentInfo,
      true, // System contracts were already deployed in `ensureSphinxAndGnosisSafeDeployed` above.
      configArtifacts,
      [] // No libraries
    )
  })

  const deploymentData = makeDeploymentData(networkConfigArray)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  const deploymentConfig = makeDeploymentConfig(
    networkConfigArray,
    configArtifacts,
    buildInfos,
    merkleTree
  )

  return { deploymentConfig, configArtifacts, merkleTree }
}

export const makeRevertingDeployment = (
  merkleRootNonce: number,
  executionMode: ExecutionMode,
  safeAddress: string
): {
  executionMode: ExecutionMode
  merkleRootNonce: number
  accountAccesses: Array<ParsedAccountAccess>
  expectedContractFileNames: Array<string>
} => {
  // We use the Merkle root nonce as the `CREATE2` salt to ensure that we don't attempt to deploy a
  // contract at the same address in successive deployments.
  const salt = merkleRootNonce

  const { accountAccesses } = makeCreate2AccountAccesses(safeAddress, [
    {
      salt,
      artifact: parseFoundryContractArtifact(MyContract2Artifact),
      abiEncodedConstructorArgs: '0x',
    },
    {
      salt,
      artifact: parseFoundryContractArtifact(Reverter),
      abiEncodedConstructorArgs: '0x',
    },
  ])
  const expectedContractFileNames = ['MyContract2.json']

  return {
    executionMode,
    merkleRootNonce,
    accountAccesses,
    expectedContractFileNames,
  }
}

export const runDeployment = async (
  deploymentConfig: DeploymentConfig,
  previousArtifacts: DeploymentArtifacts
): Promise<void> => {
  const artifactInputs: {
    [chainId: string]: {
      deploymentConfig: DeploymentConfig
      receipts: Array<SphinxTransactionReceipt>
      provider: SphinxJsonRpcProvider
    }
  } = {}

  const { merkleTree, configArtifacts } = deploymentConfig

  for (const networkConfig of deploymentConfig.networkConfigs) {
    const { chainId } = networkConfig
    const rpcUrl = getAnvilRpcUrl(BigInt(chainId))
    const provider = new SphinxJsonRpcProvider(rpcUrl)
    const signer = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)

    const treeSigner = {
      signer: await signer.getAddress(),
      signature: await signMerkleRoot(merkleTree.root, signer),
    }
    const deployment: Deployment = {
      id: 'only required on website',
      multichainDeploymentId: 'only required on website',
      projectId: 'only required on website',
      chainId: networkConfig.chainId,
      status: 'approved',
      moduleAddress: networkConfig.moduleAddress,
      safeAddress: networkConfig.safeAddress,
      deploymentConfig,
      networkName: fetchNameForNetwork(BigInt(networkConfig.chainId)),
      treeSigners: [treeSigner],
    }
    const deploymentContext: DeploymentContext = {
      throwError: (message: string) => {
        throw new Error(message)
      },
      handleError: (e) => {
        throw e
      },
      handleAlreadyExecutedDeployment: () => {
        throw new Error(
          'Deployment has already been executed. This is a bug. Please report it to the developers.'
        )
      },
      handleExecutionFailure: async () => {
        return
      },
      handleSuccess: async () => {
        return
      },
      executeTransaction: executeTransactionViaSigner,
      injectRoles,
      removeRoles,
      deployment,
      provider,
      wallet: signer,
    }
    const result = await attemptDeployment(deploymentContext)

    if (!result) {
      throw new Error('deployment failed for an unexpected reason')
    }

    const { receipts: sortedReceipts } = result

    // Flip the order of the first and last receipt so that the receipts aren't in ascending order.
    // Later, we'll test that the artifact generation logic sorts the arrays back into ascending
    // order.
    const receipts = [...sortedReceipts]
    const tempReceipt = receipts[0]
    receipts[0] = receipts[receipts.length - 1]
    receipts[receipts.length - 1] = tempReceipt

    artifactInputs[networkConfig.chainId] = {
      deploymentConfig,
      receipts,
      provider,
    }
  }

  await makeDeploymentArtifacts(
    artifactInputs,
    merkleTree.root,
    configArtifacts,
    previousArtifacts
  )
}

export const isSortedChronologically = (
  receipts: Array<SphinxTransactionReceipt>
): boolean => {
  for (let i = 0; i < receipts.length - 1; i++) {
    if (!isReceiptEarlier(receipts[i], receipts[i + 1])) {
      return false
    }
  }
  return true
}

const makeCreate2AccountAccesses = (
  safeAddress: string,
  inputs: Array<{
    salt: number
    artifact: ContractArtifact
    abiEncodedConstructorArgs: string
  }>
): {
  accountAccesses: Array<ParsedAccountAccess>
} => {
  const accountAccesses: Array<ParsedAccountAccess> = []
  for (const { salt, artifact, abiEncodedConstructorArgs } of inputs) {
    const { bytecode } = artifact

    const saltPadded = ethers.zeroPadValue(ethers.toBeHex(salt), 32)
    const initCodeWithArgs = ethers.concat([
      bytecode,
      abiEncodedConstructorArgs,
    ])
    const data = ethers.concat([saltPadded, initCodeWithArgs])
    const create2Address = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      saltPadded,
      ethers.keccak256(initCodeWithArgs)
    )

    accountAccesses.push({
      root: {
        ...blankAccountAccess,
        account: DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        accessor: safeAddress,
        value: '0',
        data,
        kind: AccountAccessKind.Call,
      },
      nested: [
        {
          ...blankAccountAccess,
          account: create2Address,
          accessor: DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
          value: '0',
          data: initCodeWithArgs,
          kind: AccountAccessKind.Create,
        },
      ],
    })
  }
  return { accountAccesses }
}

export const makeStandardDeployment = (
  merkleRootNonce: number,
  executionMode: ExecutionMode,
  safeAddress: string
): {
  executionMode: ExecutionMode
  merkleRootNonce: number
  accountAccesses: Array<ParsedAccountAccess>
  expectedContractFileNames: Array<string>
} => {
  // The `CREATE2` salt is determined by the Merkle root nonce to ensure that we don't attempt to
  // deploy a contract at the same address in successive deployments. We add a constant number
  // because at least one of these contracts has already been deployed to Sepolia at the `CREATE2`
  // address determined by a salt of `0`.
  const salt = merkleRootNonce + 100

  const coder = ethers.AbiCoder.defaultAbiCoder()

  const { accountAccesses } = makeCreate2AccountAccesses(safeAddress, [
    {
      salt,
      artifact: parseFoundryContractArtifact(MyContract2Artifact),
      abiEncodedConstructorArgs: '0x',
    },
    {
      salt,
      artifact: parseFoundryContractArtifact(MyContract1Artifact),
      abiEncodedConstructorArgs: coder.encode(
        ['int256', 'uint256', 'address', 'address'],
        [3, 3, makeAddress(3), makeAddress(3)]
      ),
    },
    {
      salt,
      artifact: parseFoundryContractArtifact(MyContract1Artifact),
      abiEncodedConstructorArgs: coder.encode(
        ['int256', 'uint256', 'address', 'address'],
        [4, 4, makeAddress(4), makeAddress(4)]
      ),
    },
    {
      salt,
      artifact: parseFoundryContractArtifact(MyContract1Artifact),
      abiEncodedConstructorArgs: coder.encode(
        ['int256', 'uint256', 'address', 'address'],
        [5, 5, makeAddress(5), makeAddress(5)]
      ),
    },
  ])
  const expectedContractFileNames = [
    'MyContract2.json',
    'MyContract1.json',
    'MyContract1_1.json',
    'MyContract1_2.json',
  ]

  return {
    executionMode,
    merkleRootNonce,
    accountAccesses,
    expectedContractFileNames,
  }
}

export const getEmptyDeploymentArtifacts = (): DeploymentArtifacts => {
  return {
    networks: {},
    compilerInputs: {},
  }
}

export const checkArtifacts = (
  projectName: string,
  deploymentConfig: DeploymentConfig,
  previousArtifacts: DeploymentArtifacts,
  artifacts: DeploymentArtifacts,
  executionMode: ExecutionMode,
  expectedContractFileNames: Array<string>
) => {
  for (const chainIdStr of Object.keys(artifacts.networks)) {
    const { executionArtifacts, contractDeploymentArtifacts } =
      artifacts.networks[chainIdStr]

    const networkArtifactsDirPath = join(
      'deployments',
      projectName,
      getNetworkNameDirectory(chainIdStr, executionMode)
    )

    expect(Object.keys(contractDeploymentArtifacts).length).equals(
      expectedContractFileNames.length
    )
    const numPreviousExecutionArtifacts = getNumExecutionArtifacts(
      previousArtifacts,
      chainIdStr
    )
    expect(Object.keys(executionArtifacts).length).equals(
      numPreviousExecutionArtifacts + 1
    )

    const contractArtifactArray = Object.entries(contractDeploymentArtifacts)
    for (let i = 0; i < contractArtifactArray.length; i++) {
      const [contractFileName, contractArtifact] = contractArtifactArray[i]

      expect(contractFileName).equals(expectedContractFileNames[i])

      const contractArtifactFilePath = join(
        networkArtifactsDirPath,
        contractFileName
      )
      expect(existsSync(contractArtifactFilePath)).to.be.true

      const writtenContractArtifact = JSON.parse(
        readFileSync(contractArtifactFilePath, 'utf-8')
      )
      // We JSON.parse then JSON.stringify to convert BigInt values into strings. Particularly,
      // EthersJS may populate the `args` field with BigInt values. We convert these to strings
      // because this allows us to test that the contract artifact equals the artifact written to
      // the filesystem.
      const contractArtifactWithoutBigInt = JSON.parse(
        JSON.stringify(contractArtifact)
      )
      expect(writtenContractArtifact).to.deep.equal(
        contractArtifactWithoutBigInt
      )
      expect(isContractDeploymentArtifact(writtenContractArtifact)).to.be.true

      // Check that the history array is in the correct order.
      expect(
        isSortedChronologically(contractArtifact.history.map((h) => h.receipt))
      ).to.be.true

      // Check that the elements in the history array are valid.
      expect(
        contractArtifact.history.every(
          isContractDeploymentArtifactExceptHistory
        )
      ).to.be.true
    }

    for (const [executionFileName, executionArtifact] of Object.entries(
      executionArtifacts
    )) {
      const executionArtifactFilePath = join(
        networkArtifactsDirPath,
        'execution',
        executionFileName
      )

      expect(existsSync(executionArtifactFilePath)).to.be.true

      const writtenExecutionArtifact = JSON.parse(
        readFileSync(executionArtifactFilePath, 'utf-8')
      )
      expect(writtenExecutionArtifact).to.deep.equal(executionArtifact)
      expect(isExecutionArtifact(writtenExecutionArtifact)).to.be.true

      // Check that the receipts are sorted in chronological order.
      expect(
        isSortedChronologically(
          executionArtifact.transactions.map((txn) => txn.receipt)
        )
      ).to.be.true
    }
  }

  for (const compilerInput of deploymentConfig.inputs) {
    const compilerInputFilePath = join(
      `deployments`,
      getCompilerInputDirName(executionMode),
      `${compilerInput.id}.json`
    )

    expect(existsSync(compilerInputFilePath)).to.be.true

    const writtenArtifact = JSON.parse(
      readFileSync(compilerInputFilePath, 'utf-8')
    )
    // We JSON.parse then JSON.stringify the compiler inputs to remove undefined fields so that we
    // can compare the written artifact to the expected artifact.
    const parsedCompilerInput = JSON.parse(JSON.stringify(compilerInput))
    expect(writtenArtifact).to.deep.equal(parsedCompilerInput)
    expect(typeof compilerInput.id).to.equal('string')
    expect(typeof compilerInput.solcLongVersion).to.equal('string')
    expect(typeof compilerInput.solcVersion).to.equal('string')
    expect(isNonNullObject(compilerInput.input)).to.be.true
  }
}

export const getSphinxModuleAddressFromScript = async (
  scriptPath: string,
  forkUrl: string,
  targetContract?: string
): Promise<string> => {
  const json = await callForgeScriptFunction<{
    0: { value: string }
  }>(scriptPath, 'sphinxModule()', [], forkUrl, targetContract)

  const safeAddress = json.returns[0].value

  return safeAddress
}

export const runForgeScript = async (
  scriptPath: string,
  broadcastFolder: string,
  rpcUrl: string,
  targetContract?: string
): Promise<FoundrySingleChainBroadcast> => {
  const initialTime = new Date()
  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--rpc-url',
    rpcUrl,
    '--broadcast',
  ]
  if (targetContract) {
    forgeScriptArgs.push('--tc')
    forgeScriptArgs.push(targetContract)
  }
  const { code, stdout, stderr } = await spawnAsync(`forge`, forgeScriptArgs)
  if (code !== 0) {
    throw new Error(`${stdout}\n${stderr}`)
  }

  const broadcast = readFoundrySingleChainBroadcast(
    broadcastFolder,
    scriptPath,
    31337,
    'run',
    initialTime
  )
  // Narrow the TypeScript type.
  if (!broadcast) {
    throw new Error('Could not find broadcast file.')
  }
  return broadcast
}

export const getNumExecutionArtifacts = (
  artifacts: DeploymentArtifacts,
  chainId: string
): number => {
  if (artifacts.networks[chainId] === undefined) {
    return 0
  }
  return Object.keys(artifacts.networks[chainId].executionArtifacts).length
}

export const encodeFunctionCalldata = (sig: Array<string>): string => {
  const fragment = ethers.FunctionFragment.from(sig[0])
  const params = sig.slice(1)
  const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    fragment.inputs,
    params
  )
  const calldata = ethers.concat([fragment.selector, encodedParams])
  return calldata
}

export const makeActionInputsWithoutGas = (
  ary: Array<
    | {
        actionType: ActionInputType.CREATE2
        create2Salt: string
        artifact: ContractArtifact
        encodedArgs?: string
      }
    | {
        actionType: ActionInputType.CALL
        to: string
        txData: string
        fullyQualifiedName?: string
      }
    | {
        actionType: ActionInputType.CREATE
        nonce: number
        artifact: ContractArtifact
        from: string
        encodedArgs?: string
      }
  >,
  configArtifacts: ConfigArtifacts
): Array<Omit<ActionInput, 'gas'>> => {
  const actionInputs: Array<Omit<ActionInput, 'gas'>> = []
  for (let index = 1; index <= ary.length; index++) {
    const data = ary[index - 1]
    if (data.actionType === ActionInputType.CREATE2) {
      const { actionType, create2Salt, artifact, encodedArgs } = data
      const { bytecode, sourceName, contractName } = artifact

      const initCodeWithArgs = encodedArgs
        ? ethers.concat([bytecode, encodedArgs])
        : bytecode
      const create2Address = ethers.getCreate2Address(
        DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        create2Salt,
        ethers.keccak256(initCodeWithArgs)
      )

      const fullyQualifiedName = `${sourceName}:${contractName}`
      const decodedAction = makeContractDecodedAction(
        create2Address,
        initCodeWithArgs,
        configArtifacts,
        fullyQualifiedName,
        '0'
      )
      const contracts = [
        {
          address: create2Address,
          initCodeWithArgs,
          fullyQualifiedName,
        },
      ]

      const txData = ethers.concat([create2Salt, initCodeWithArgs])
      const actionInput: Omit<Create2ActionInput, 'gas'> = {
        decodedAction,
        create2Address,
        initCodeWithArgs,
        actionType,
        contracts,
        index: index.toString(),
        to: DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        value: '0',
        txData,
        operation: Operation.Call,
        requireSuccess: true,
      }
      actionInputs.push(actionInput)
    } else if (data.actionType === ActionInputType.CALL) {
      const { actionType, to, txData, fullyQualifiedName } = data
      const decodedAction = makeFunctionCallDecodedAction(
        to,
        txData,
        '0',
        configArtifacts,
        fullyQualifiedName
      )
      const actionInput: Omit<FunctionCallActionInput, 'gas'> = {
        actionType,
        contracts: [],
        index: index.toString(),
        decodedAction,
        requireSuccess: true,
        value: '0',
        operation: Operation.Call,
        to,
        txData,
      }
      actionInputs.push(actionInput)
    } else if (data.actionType === ActionInputType.CREATE) {
      const { actionType, nonce, artifact, encodedArgs, from } = data
      const { bytecode, sourceName, contractName } = artifact

      const initCodeWithArgs = encodedArgs
        ? ethers.concat([bytecode, encodedArgs])
        : bytecode
      const contractAddress = ethers.getCreateAddress({
        from,
        nonce,
      })

      const fullyQualifiedName = `${sourceName}:${contractName}`
      const decodedAction = makeContractDecodedAction(
        contractAddress,
        initCodeWithArgs,
        configArtifacts,
        fullyQualifiedName,
        '0'
      )
      const contracts = [
        {
          address: contractAddress,
          initCodeWithArgs,
          fullyQualifiedName,
        },
      ]

      const txData = encodeCreateCall('0', initCodeWithArgs)
      const actionInput: Omit<CreateActionInput, 'gas'> = {
        decodedAction,
        contractAddress,
        initCodeWithArgs,
        actionType,
        contracts,
        index: index.toString(),
        to: getCreateCallAddress(),
        value: '0',
        txData,
        operation: Operation.DelegateCall,
        requireSuccess: true,
      }
      actionInputs.push(actionInput)
    } else {
      throw new Error(`Action input type is not implemented.`)
    }
  }

  return actionInputs
}

export const sumEvenNumbers = (start: number, numTerms: number): number => {
  let sum = 0
  for (let i = 0; i < numTerms; i++) {
    sum += start + 2 * i
  }
  return sum
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const promiseThatNeverSettles = new Promise(() => {})
