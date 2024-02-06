import { exec } from 'child_process'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

import {
  execAsync,
  sleep,
  sortHexStrings,
  CompilerConfig,
  ConfigArtifacts,
  DeploymentInfo,
  ExecutionMode,
  RawActionInput,
  SphinxJsonRpcProvider,
  getParsedConfigWithCompilerInputs,
  makeDeploymentData,
  DeploymentArtifacts,
  SphinxTransactionReceipt,
  ContractDeploymentArtifact,
  getSphinxWalletPrivateKey,
  runEntireDeploymentProcess,
  makeDeploymentArtifacts,
  SphinxActionType,
  isReceiptEarlier,
  isContractDeploymentArtifact,
  isContractDeploymentArtifactExceptHistory,
  isExecutionArtifact,
  getCompilerInputDirName,
  getNetworkNameDirectory,
  fetchURLForNetwork,
  spawnAsync,
  RawCreate2ActionInput,
  fetchChainIdForNetwork,
  checkSystemDeployed,
  ensureSphinxAndGnosisSafeDeployed,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  GnosisSafeArtifact,
  GnosisSafeProxyArtifact,
  MultiSendArtifact,
  SphinxModuleProxyFactoryABI,
  getCompatibilityFallbackHandlerAddress,
  getGnosisSafeProxyFactoryAddress,
  getGnosisSafeSingletonAddress,
  getMultiSendAddress,
  getSphinxModuleImplAddress,
  getSphinxModuleProxyFactoryAddress,
  Operation,
  SphinxMerkleTree,
  getManagedServiceAddress,
  makeSphinxMerkleTree,
  parseFoundryContractArtifact,
  ContractArtifact,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  isNonNullObject,
  CONTRACTS_LIBRARY_VERSION,
} from '@sphinx-labs/contracts'
import { expect } from 'chai'

import * as Reverter from '../../out/artifacts/Reverter.sol/Reverter.json'
import * as MyContract1Artifact from '../../out/artifacts/MyContracts.sol/MyContract1.json'
import * as MyContract2Artifact from '../../out/artifacts/MyContracts.sol/MyContract2.json'
import { getFoundryToml } from '../../src/foundry/options'
import { callForgeScriptFunction, makeGetConfigArtifacts } from '../../dist'
import { makeParsedConfig } from '../../src/foundry/decode'
import { FoundrySingleChainBroadcast } from '../../src/foundry/types'
import {
  getInitCodeWithArgsArray,
  readFoundrySingleChainBroadcast,
} from '../../src/foundry/utils'

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

  await sleep(3000)
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

export const getGnosisSafeInitializerData = (
  owners: Array<string>,
  threshold: number
): string => {
  if (owners.length === 0) {
    throw new Error(
      "Sphinx: You must have at least one owner in your 'sphinxConfig.owners' array."
    )
  }
  if (threshold === 0) {
    throw new Error(
      "Sphinx: You must set your 'sphinxConfig.threshold' to a value greater than 0."
    )
  }

  // Sort the owner addresses
  const sortedOwners = sortHexStrings(owners)

  const sphinxModuleProxyFactoryAddress = getSphinxModuleProxyFactoryAddress()

  const sphinxModuleProxyFactory = new ethers.Contract(
    sphinxModuleProxyFactoryAddress,
    SphinxModuleProxyFactoryABI
  )

  // Encode the data for deploying the Sphinx Module
  const encodedDeployModuleCall =
    sphinxModuleProxyFactory.interface.encodeFunctionData(
      'deploySphinxModuleProxyFromSafe',
      [ethers.ZeroHash]
    )

  // Encode the data in a format for MultiSend
  const deployModuleMultiSendData = ethers.solidityPacked(
    ['uint8', 'address', 'uint', 'uint', 'bytes'],
    [
      Operation.Call,
      sphinxModuleProxyFactoryAddress,
      0,
      ethers.getBytes(encodedDeployModuleCall).length,
      encodedDeployModuleCall,
    ]
  )

  // Similar encoding for enabling the Sphinx Module
  const encodedEnableModuleCall =
    sphinxModuleProxyFactory.interface.encodeFunctionData(
      'enableSphinxModuleProxyFromSafe',
      [ethers.ZeroHash]
    )

  const enableModuleMultiSendData = ethers.solidityPacked(
    ['uint8', 'address', 'uint', 'uint', 'bytes'],
    [
      Operation.DelegateCall,
      sphinxModuleProxyFactoryAddress,
      0,
      ethers.getBytes(encodedEnableModuleCall).length,
      encodedEnableModuleCall,
    ]
  )

  // Encode the entire MultiSend data
  const multiSend = new ethers.Contract(
    getMultiSendAddress(),
    MultiSendArtifact.abi
  )
  const multiSendData = multiSend.interface.encodeFunctionData('multiSend', [
    ethers.concat([deployModuleMultiSendData, enableModuleMultiSendData]),
  ])

  // Encode the call to the Gnosis Safe's `setup` function
  const gnosisSafe = new ethers.Contract(
    getGnosisSafeSingletonAddress(),
    GnosisSafeArtifact.abi
  )
  const safeInitializerData = gnosisSafe.interface.encodeFunctionData('setup', [
    sortedOwners,
    threshold,
    getMultiSendAddress(),
    multiSendData,
    // This is the default fallback handler used by Gnosis Safe during their
    // standard deployments.
    getCompatibilityFallbackHandlerAddress(),
    // The following fields are for specifying an optional payment as part of the
    // deployment. We don't use them.
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ])

  return safeInitializerData
}

export const getGnosisSafeProxyAddress = (
  owners: Array<string>,
  threshold: number,
  saltNonce: number
): string => {
  const sortedOwners = sortHexStrings(owners)
  const safeInitializerData = getGnosisSafeInitializerData(
    sortedOwners,
    threshold
  )

  const salt = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'uint256'],
      [ethers.keccak256(safeInitializerData), saltNonce]
    )
  )

  const deploymentData = ethers.solidityPacked(
    ['bytes', 'uint256'],
    [GnosisSafeProxyArtifact.bytecode, getGnosisSafeSingletonAddress()]
  )

  return ethers.getCreate2Address(
    getGnosisSafeProxyFactoryAddress(),
    salt,
    ethers.keccak256(deploymentData)
  )
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
  mainnets: Array<string>,
  testnets: Array<string>,
  projectName: string,
  owners: Array<ethers.Wallet>,
  threshold: number,
  executionMode: ExecutionMode,
  actions: Array<RawActionInput>,
  getRpcUrl: (chainId: bigint) => string
): Promise<{
  merkleTree: SphinxMerkleTree
  compilerConfigArray: Array<CompilerConfig>
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
    executorAddress = getManagedServiceAddress()
  }

  const ownerAddresses = owners.map((owner) => owner.address)
  const networkNames = mainnets.concat(testnets)

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
        await ensureSphinxAndGnosisSafeDeployed(provider, wallet, executionMode)
      }

      const block = await provider.getBlock('latest')
      if (!block) {
        throw new Error(`Could not find block for ${chainId}`)
      }

      const deploymentInfo: DeploymentInfo = {
        safeAddress,
        moduleAddress,
        safeInitData: getGnosisSafeInitializerData(ownerAddresses, threshold),
        executorAddress,
        requireSuccess: true,
        nonce: merkleRootNonce.toString(),
        chainId: chainId.toString(),
        blockGasLimit: block.gasLimit.toString(),
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
          mainnets,
          testnets,
          saltNonce: saltNonce.toString(),
        },
        arbitraryChain: false,
        sphinxLibraryVersion: CONTRACTS_LIBRARY_VERSION,
      }

      return {
        actionInputs: actions,
        deploymentInfo,
      }
    } catch (error) {
      throw new Error(`Error in network ${networkName}: ${error}`)
    }
  })

  const collected = await Promise.all(collectedPromises)

  const foundryToml = await getFoundryToml()
  const getConfigArtifacts = makeGetConfigArtifacts(
    foundryToml.artifactFolder,
    foundryToml.buildInfoFolder,
    process.cwd(),
    foundryToml.cachePath
  )

  const initCodeWithArgsArray = getInitCodeWithArgsArray(
    collected.flatMap(({ actionInputs }) => actionInputs)
  )

  const configArtifacts = await getConfigArtifacts(initCodeWithArgsArray)

  const parsedConfigArray = collected.map(
    ({ actionInputs, deploymentInfo }) => {
      const gasEstimatesArray = actionInputs.map(() => (2_000_000).toString())
      return makeParsedConfig(
        deploymentInfo,
        actionInputs,
        gasEstimatesArray,
        true, // System contracts were already deployed in `ensureSphinxAndGnosisSafeDeployed` above.
        configArtifacts,
        [] // No libraries
      )
    }
  )

  const deploymentData = makeDeploymentData(parsedConfigArray)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  const compilerConfigArray = getParsedConfigWithCompilerInputs(
    parsedConfigArray,
    configArtifacts
  )

  return { compilerConfigArray, configArtifacts, merkleTree }
}

export const makeRevertingDeployment = (
  merkleRootNonce: number,
  executionMode: ExecutionMode
): {
  executionMode: ExecutionMode
  merkleRootNonce: number
  actionInputs: Array<RawActionInput>
  expectedNumExecutionArtifacts: number
  expectedContractFileNames: Array<string>
} => {
  // We use the Merkle root nonce as the `CREATE2` salt to ensure that we don't attempt to deploy a
  // contract at the same address in successive deployments.
  const salt = merkleRootNonce

  const actionInputs: Array<RawActionInput> = [
    makeRawCreate2Action(
      salt,
      parseFoundryContractArtifact(MyContract2Artifact),
      '0x'
    ),
    makeRawCreate2Action(salt, parseFoundryContractArtifact(Reverter), '0x'),
  ]
  const expectedNumExecutionArtifacts = 1
  const expectedContractFileNames = ['MyContract2.json']

  return {
    executionMode,
    merkleRootNonce,
    actionInputs,
    expectedNumExecutionArtifacts,
    expectedContractFileNames,
  }
}

export const runDeployment = async (
  compilerConfigArray: Array<CompilerConfig>,
  merkleTree: SphinxMerkleTree,
  configArtifacts: ConfigArtifacts,
  previousArtifacts: DeploymentArtifacts['networks']
): Promise<DeploymentArtifacts> => {
  const artifactInputs: {
    [chainId: string]: {
      compilerConfig: CompilerConfig
      receipts: Array<SphinxTransactionReceipt>
      provider: SphinxJsonRpcProvider
      previousContractArtifacts: {
        [fileName: string]: ContractDeploymentArtifact
      }
    }
  } = {}

  for (const compilerConfig of compilerConfigArray) {
    const { chainId } = compilerConfig
    const rpcUrl = getAnvilRpcUrl(BigInt(chainId))
    const provider = new SphinxJsonRpcProvider(rpcUrl)
    const signer = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)

    const { receipts: sortedReceipts } = await runEntireDeploymentProcess(
      compilerConfig,
      merkleTree,
      provider,
      signer
    )

    // Flip the order of the first and last receipt so that the receipts aren't in ascending order.
    // Later, we'll test that the artifact generation logic sorts the arrays back into ascending
    // order.
    const receipts = [...sortedReceipts]
    const tempReceipt = receipts[0]
    receipts[0] = receipts[receipts.length - 1]
    receipts[receipts.length - 1] = tempReceipt

    const previousContractArtifacts =
      previousArtifacts.networks?.[chainId]?.contractDeploymentArtifacts ?? {}

    artifactInputs[compilerConfig.chainId] = {
      compilerConfig,
      receipts,
      provider,
      previousContractArtifacts,
    }
  }

  const artifacts = await makeDeploymentArtifacts(
    artifactInputs,
    merkleTree.root,
    configArtifacts
  )

  return artifacts
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

const makeRawCreate2Action = (
  salt: number,
  artifact: ContractArtifact,
  abiEncodedConstructorArgs: string
): RawCreate2ActionInput => {
  const { bytecode, contractName } = artifact

  const gas = (5_000_000).toString()

  const saltPadded = ethers.zeroPadValue(ethers.toBeHex(salt), 32)
  const initCodeWithArgs = ethers.concat([bytecode, abiEncodedConstructorArgs])
  const create2Address = ethers.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    saltPadded,
    ethers.keccak256(initCodeWithArgs)
  )

  const txData = ethers.concat([saltPadded, initCodeWithArgs])

  return {
    to: DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    create2Address,
    contractName,
    value: '0x0',
    operation: Operation.Call,
    txData,
    initCodeWithArgs,
    actionType: SphinxActionType.CALL.toString(),
    gas,
    additionalContracts: [],
    requireSuccess: true,
    // Unused:
    decodedAction: {
      referenceName: contractName,
      functionName: 'deploy',
      variables: [],
      address: create2Address,
    },
  }
}

export const makeStandardDeployment = (
  merkleRootNonce: number,
  executionMode: ExecutionMode
): {
  executionMode: ExecutionMode
  merkleRootNonce: number
  actionInputs: Array<RawActionInput>
  expectedNumExecutionArtifacts: number
  expectedContractFileNames: Array<string>
} => {
  // The `CREATE2` salt is determined by the Merkle root nonce to ensure that we don't attempt to
  // deploy a contract at the same address in successive deployments. We add a constant number
  // because at least one of these contracts has already been deployed to Sepolia at the `CREATE2`
  // address determined by a salt of `0`.
  const salt = merkleRootNonce + 100

  const coder = ethers.AbiCoder.defaultAbiCoder()

  const actionInputs: Array<RawActionInput> = [
    makeRawCreate2Action(
      salt,
      parseFoundryContractArtifact(MyContract2Artifact),
      '0x'
    ),
    makeRawCreate2Action(
      salt,
      parseFoundryContractArtifact(MyContract1Artifact),
      coder.encode(
        ['int256', 'uint256', 'address', 'address'],
        [3, 3, makeAddress(3), makeAddress(3)]
      )
    ),
    makeRawCreate2Action(
      salt,
      parseFoundryContractArtifact(MyContract1Artifact),
      coder.encode(
        ['int256', 'uint256', 'address', 'address'],
        [4, 4, makeAddress(4), makeAddress(4)]
      )
    ),
    makeRawCreate2Action(
      salt,
      parseFoundryContractArtifact(MyContract1Artifact),
      coder.encode(
        ['int256', 'uint256', 'address', 'address'],
        [5, 5, makeAddress(5), makeAddress(5)]
      )
    ),
  ]
  const expectedNumExecutionArtifacts = 1
  const expectedContractFileNames = [
    'MyContract2.json',
    'MyContract1.json',
    'MyContract1_1.json',
    'MyContract1_2.json',
  ]

  return {
    executionMode,
    merkleRootNonce,
    actionInputs,
    expectedNumExecutionArtifacts,
    expectedContractFileNames,
  }
}

export const checkArtifacts = (
  projectName: string,
  compilerConfigArray: Array<CompilerConfig>,
  artifacts: DeploymentArtifacts,
  executionMode: ExecutionMode,
  expectedNumExecutionArtifacts: number,
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
    expect(Object.keys(executionArtifacts).length).equals(
      expectedNumExecutionArtifacts
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

  const allCompilerInputs = compilerConfigArray.flatMap(({ inputs }) => inputs)
  for (const compilerInput of allCompilerInputs) {
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
  rpcUrl: string
): Promise<FoundrySingleChainBroadcast> => {
  const initialTime = new Date()
  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--rpc-url',
    rpcUrl,
    '--broadcast',
  ]
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
