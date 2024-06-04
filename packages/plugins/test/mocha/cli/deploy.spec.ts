import { existsSync } from 'fs'
import { rm } from 'fs/promises'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  DeploymentConfig,
  ConfigArtifacts,
  DeploymentArtifacts,
  ExecutionMode,
  NetworkConfig,
  SphinxJsonRpcProvider,
  SphinxPreview,
  SphinxTransactionReceipt,
  execAsync,
  fetchChainIdForNetwork,
  getCreate3Address,
  makeDeploymentArtifacts,
  setBalance,
  isLiveNetwork,
  InitialChainState,
  getContractAddressesFromNetworkConfig,
  ActionInputType,
  ActionInput,
} from '@sphinx-labs/core'
import { ethers, keccak256, parseEther } from 'ethers'
import {
  CREATE3_PROXY_INITCODE,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  SphinxMerkleTree,
  getGnosisSafeProxyAddress,
  parseFoundryContractArtifact,
} from '@sphinx-labs/contracts'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as FallbackArtifact from '../../../out/artifacts/Fallback.sol/Fallback.json'
import * as ConstructorDeploysContractParentArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/ConstructorDeploysContract.json'
import * as ConstructorDeploysContractChildArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/DeployedInConstructor.json'
import { deploy } from '../../../src/cli/deploy'
import {
  checkArtifacts,
  killAnvilNodes,
  startAnvilNodes,
  getEmptyDeploymentArtifacts,
  makeActionInputsWithoutGas,
  encodeFunctionCalldata,
} from '../common'
import { makeMockSphinxContextForIntegrationTests } from '../mock'
import { getFakeConfigArtifactsFromContractArtifacts } from '../fake'

const coder = new ethers.AbiCoder()

const fallbackCreate2Address = ethers.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.ZeroHash,
  ethers.keccak256(
    ethers.concat([
      FallbackArtifact.bytecode.object,
      coder.encode(['int'], [-1]),
    ])
  )
)
const fallbackCreate3Address = getCreate3Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.ZeroHash
)
const constructorDeploysContractAddress = ethers.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  '0x' + '00'.repeat(31) + '01',
  ethers.keccak256(
    ethers.concat([
      ConstructorDeploysContractParentArtifact.bytecode.object,
      coder.encode(['uint'], [1]),
    ])
  )
)
const constructorDeploysContractChildAddress = ethers.getCreateAddress({
  from: constructorDeploysContractAddress,
  nonce: 1,
})
const constructorDeploysContractAddressCreate3 = getCreate3Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  '0x' + '00'.repeat(31) + '01'
)
const constructorDeploysContractChildAddressCreate3 = ethers.getCreateAddress({
  from: constructorDeploysContractAddressCreate3,
  nonce: 1,
})

chai.use(chaiAsPromised)
const expect = chai.expect

const sepoliaRpcUrl = `http://127.0.0.1:42111`
const optimismRpcUrl = `http://127.0.0.1:42010`
const sepoliaProvider = new SphinxJsonRpcProvider(sepoliaRpcUrl)
const optimismProvider = new SphinxJsonRpcProvider(optimismRpcUrl)

const forgeScriptPath = 'contracts/test/script/Simple.s.sol'
const emptyScriptPath = 'contracts/test/script/Empty.s.sol'
const deploymentCasesScriptPath = 'contracts/test/script/Cases.s.sol'

const allChainIds = [
  fetchChainIdForNetwork('sepolia'),
  fetchChainIdForNetwork('optimism'),
]
const deploymentArtifactDirPath = 'deployments'

describe('Deploy CLI command', () => {
  let originalEnv: NodeJS.ProcessEnv

  before(() => {
    // Store the original environment variables. We'll reset them after this test suite is finished.
    originalEnv = { ...process.env }

    process.env['ETH_SEPOLIA_URL'] = sepoliaRpcUrl
    process.env['OPT_MAINNET_URL'] = optimismRpcUrl
  })

  after(() => {
    process.env = originalEnv
  })

  beforeEach(async () => {
    // Make sure that the Anvil node isn't running.
    await killAnvilNodes(allChainIds)
    // Start the Anvil nodes.
    await startAnvilNodes(allChainIds)

    if (existsSync(deploymentArtifactDirPath)) {
      await rm(deploymentArtifactDirPath, { recursive: true, force: true })
    }
  })

  afterEach(async () => {
    await killAnvilNodes(allChainIds)
  })

  describe('With preview', () => {
    it('Executes deployment on local network twice', async () => {
      const artifact = parseFoundryContractArtifact(MyContract2Artifact)
      const safeAddress = getGnosisSafeProxyAddress(
        ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
        1, // Threshold
        0 // Salt nonce
      )

      const nonce = 1
      const expectedContractAddressOne = ethers.getCreateAddress({
        from: safeAddress,
        nonce,
      })
      const expectedContractFileNames = ['MyContract2.json']
      const configArtifacts = await getFakeConfigArtifactsFromContractArtifacts(
        [artifact]
      )
      const expectedActionInputsOne = makeActionInputsWithoutGas(
        [
          {
            actionType: ActionInputType.CREATE,
            nonce,
            artifact,
            from: safeAddress,
          },
          {
            actionType: ActionInputType.CALL,
            to: expectedContractAddressOne,
            txData: encodeFunctionCalldata([
              'incrementMyContract2(uint256)',
              '2',
            ]),
            fullyQualifiedName: `${artifact.sourceName}:${artifact.contractName}`,
          },
        ],
        configArtifacts
      )

      // We run `forge clean` to ensure that a deployment can occur even if there are no existing
      // contract artifacts. This is worthwhile to test because we read contract interfaces in the
      // `deploy` function, which will fail if the function hasn't compiled the contracts yet. By
      // running `forge clean` here, we're testing that this compilation occurs in the `deploy`
      // function.
      await execAsync(`forge clean`)

      const executionMode = ExecutionMode.LocalNetworkCLI

      expect(
        await sepoliaProvider.getCode(expectedContractAddressOne)
      ).to.equal('0x')

      // Check that the deployment artifacts have't been created yet
      expect(existsSync(deploymentArtifactDirPath)).to.be.false

      const { context } = makeMockSphinxContextForIntegrationTests([
        'contracts/test/MyContracts.sol:MyContract2',
      ])
      // Use the standard `isLiveNetwork` function so that it returns false.
      context.isLiveNetwork = isLiveNetwork

      const targetContract = 'Simple3'
      const firstDeployment = await deploy({
        scriptPath: forgeScriptPath,
        network: 'sepolia',
        skipPreview: false,
        silent: true,
        sphinxContext: context,
        verify: false,
        targetContract,
      })

      await expectValidDeployment({
        deployment: firstDeployment,
        previousArtifacts: getEmptyDeploymentArtifacts(),
        provider: sepoliaProvider,
        expectedExecutionMode: executionMode,
        expectedContractFileNames,
        expectedContractAddress: expectedContractAddressOne,
        expectedInitialState: {
          isSafeDeployed: false,
          isModuleDeployed: false,
          isExecuting: false,
        },
        expectedActionInputs: expectedActionInputsOne,
      })

      const expectedContractAddressTwo = ethers.getCreateAddress({
        from: safeAddress,
        nonce: 2,
      })
      const expectedActionInputsTwo = makeActionInputsWithoutGas(
        [
          {
            actionType: ActionInputType.CREATE,
            nonce: nonce + 1,
            artifact,
            from: safeAddress,
          },
          {
            actionType: ActionInputType.CALL,
            to: expectedContractAddressTwo,
            txData: encodeFunctionCalldata([
              'incrementMyContract2(uint256)',
              '2',
            ]),
            fullyQualifiedName: `${artifact.sourceName}:${artifact.contractName}`,
          },
        ],
        configArtifacts
      )

      expect(
        await sepoliaProvider.getCode(expectedContractAddressTwo)
      ).to.equal('0x')

      const secondDeployment = await deploy({
        scriptPath: forgeScriptPath,
        network: 'sepolia',
        skipPreview: false,
        silent: true,
        sphinxContext: context,
        verify: false,
        targetContract,
      })

      if (!firstDeployment.deploymentArtifacts) {
        throw new Error(`Object(s) undefined.`)
      }

      await expectValidDeployment({
        deployment: secondDeployment, // Use the second deployment
        previousArtifacts: firstDeployment.deploymentArtifacts,
        provider: sepoliaProvider,
        expectedExecutionMode: executionMode,
        expectedContractFileNames,
        expectedContractAddress: expectedContractAddressTwo,
        expectedInitialState: {
          isSafeDeployed: true,
          isModuleDeployed: true,
          isExecuting: false,
        },
        expectedActionInputs: expectedActionInputsTwo,
      })
    })

    // This tests the logic that deploys on live networks, which uses a signer to call the Sphinx
    // Module. This is separate from the logic that deploys on local network, which uses an
    // auto-generated wallet and executes transactions through the `ManagedService`.
    //
    // This test deploys on a network name, optimism_mainnet, which is different from the network
    // name 'optimism' in `SPHINX_NETWORKS`. Changing the network name ensures that the user can
    // deploy with network names that don't match ours.
    it('Executes deployment on live network with non-standard network name', async () => {
      const create2Salt = '0x' + '00'.repeat(31) + '01'
      const artifact = parseFoundryContractArtifact(MyContract2Artifact)
      const expectedContractAddressOptimism = ethers.getCreate2Address(
        DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        create2Salt,
        keccak256(artifact.bytecode)
      )
      const configArtifacts = await getFakeConfigArtifactsFromContractArtifacts(
        [artifact]
      )
      const expectedActionInputs = makeActionInputsWithoutGas(
        [
          {
            actionType: ActionInputType.CREATE2,
            create2Salt,
            artifact,
          },
          {
            actionType: ActionInputType.CALL,
            to: expectedContractAddressOptimism,
            txData: encodeFunctionCalldata([
              'incrementMyContract2(uint256)',
              '2',
            ]),
            fullyQualifiedName: `${artifact.sourceName}:${artifact.contractName}`,
          },
        ],
        configArtifacts
      )

      expect(
        await optimismProvider.getCode(expectedContractAddressOptimism)
      ).to.equal('0x')

      // First private key on Anvil
      const privateKey =
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      process.env['PRIVATE_KEY'] = privateKey

      const wallet = new ethers.Wallet(privateKey)
      // Set the signer's balance to be low in order to emulate a live network scenario. This
      // ensures that the signer can execute a deployment without having a very high balance of ETH.
      await setBalance(
        wallet.address,
        ethers.toBeHex(ethers.parseEther('1.25')),
        optimismProvider
      )

      // Check that the deployment artifact hasn't been created yet
      expect(existsSync(deploymentArtifactDirPath)).to.be.false

      const { context } = makeMockSphinxContextForIntegrationTests([
        'contracts/test/MyContracts.sol:MyContract2',
      ])
      const executionMode = ExecutionMode.LiveNetworkCLI

      const targetContract = 'Simple1'
      const deployment = await deploy({
        scriptPath: forgeScriptPath,
        network: 'optimism_mainnet',
        skipPreview: false,
        silent: true,
        sphinxContext: context,
        verify: false,
        targetContract,
      })
      await expectValidDeployment({
        deployment,
        previousArtifacts: getEmptyDeploymentArtifacts(),
        provider: optimismProvider,
        expectedExecutionMode: executionMode,
        expectedContractFileNames: ['MyContract2.json'],
        expectedContractAddress: expectedContractAddressOptimism,
        expectedInitialState: {
          isSafeDeployed: false,
          isModuleDeployed: false,
          isExecuting: false,
        },
        expectedActionInputs,
      })
    })

    // We exit early even if the Gnosis Safe and Sphinx Module haven't been deployed yet. In other
    // words, we don't allow the user to use the `deploy` CLI command to just deploy a Gnosis Safe
    // and Sphinx Module. This behavior is consistent with the `propose` CLI command.
    it(`Displays preview then exits when there's nothing to execute`, async () => {
      const expectedMyContract2Address = ethers.getCreate2Address(
        DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        ethers.ZeroHash,
        ethers.keccak256(MyContract2Artifact.bytecode.object)
      )

      expect(
        await sepoliaProvider.getCode(expectedMyContract2Address)
      ).to.equal('0x')

      const { context } = makeMockSphinxContextForIntegrationTests([])

      const { preview } = await deploy({
        scriptPath: emptyScriptPath,
        network: 'sepolia',
        skipPreview: false,
        silent: true,
        sphinxContext: context,
        verify: false,
      })

      expect(preview).to.be.undefined

      // Check that the deployment artifacts have't been created.
      expect(existsSync(deploymentArtifactDirPath)).to.be.false
    })
  })
})

describe('Deployment Cases', () => {
  const scriptInputParam = '1234'

  let preview: SphinxPreview | undefined
  let deploymentConfig: DeploymentConfig | undefined
  let networkConfig: NetworkConfig | undefined
  let merkleTree: SphinxMerkleTree | undefined
  let receipts: Array<SphinxTransactionReceipt> | undefined
  let configArtifacts: ConfigArtifacts | undefined
  let createAddressOne: string
  let createAddressTwo: string
  let myContractPayableAddress: string
  let originalEnv: NodeJS.ProcessEnv

  const checkLabeled = (
    address: string,
    expectedFullyQualifiedName: string
  ) => {
    let fullyQualifiedName: string | undefined
    for (const actionInput of networkConfig!.actionInputs) {
      for (const contract of actionInput.contracts) {
        if (contract.address === address) {
          fullyQualifiedName = contract.fullyQualifiedName
        }
      }
    }
    expect(fullyQualifiedName).to.eq(expectedFullyQualifiedName)
  }

  const checkNotLabeled = (address: string) => {
    const isAddressUnlabeled = networkConfig!.unlabeledContracts.some(
      (contract) => contract.address === address
    )
    expect(isAddressUnlabeled).to.eq(true)
  }

  before(async () => {
    // Store the original environment variables. We'll reset them after this test suite is finished.
    originalEnv = { ...process.env }

    process.env['ETH_SEPOLIA_URL'] = sepoliaRpcUrl

    await killAnvilNodes(allChainIds)
    // Start the Anvil nodes.
    await startAnvilNodes(allChainIds)

    const safeAddress = getGnosisSafeProxyAddress(
      ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
      1, // Threshold
      0 // Salt nonce
    )
    // Set the balance of the Safe ahead of time. This tests that transferring to the Safe
    // works even if the Safe already has a balance.
    const provider = new SphinxJsonRpcProvider(sepoliaRpcUrl)
    await setBalance(safeAddress, parseEther('1').toString(), provider)

    if (existsSync(deploymentArtifactDirPath)) {
      await rm(deploymentArtifactDirPath, { recursive: true, force: true })
    }

    ;({ deploymentConfig, preview, receipts, merkleTree, configArtifacts } =
      await deploy({
        scriptPath: deploymentCasesScriptPath,
        network: 'sepolia',
        skipPreview: false,
        silent: true,
        sphinxContext: makeMockSphinxContextForIntegrationTests([
          'contracts/test/ConstructorDeploysContract.sol:ConstructorDeploysContract',
          'contracts/test/ConstructorDeploysContract.sol:DeployedInConstructor',
          'contracts/test/Fallback.sol:Fallback',
          'contracts/test/MyContracts.sol:MyContract2',
        ]).context,
        verify: false,
        sig: ['deploy(uint256)', scriptInputParam],
      }))

    networkConfig = deploymentConfig?.networkConfigs.at(0)

    expect(deploymentConfig).to.not.be.undefined
    expect(preview).to.not.be.undefined

    createAddressOne = ethers.getCreateAddress({
      from: networkConfig!.safeAddress,
      // The nonce is one because contract nonces start at 1, whereas EOA nonces start at
      // 0.
      nonce: 1,
    })
    createAddressTwo = ethers.getCreateAddress({
      from: networkConfig!.safeAddress,
      nonce: 2,
    })
    myContractPayableAddress = ethers.getCreateAddress({
      from: networkConfig!.safeAddress,
      nonce: 3,
    })
  })

  after(async () => {
    process.env = originalEnv

    await killAnvilNodes(allChainIds)

    await rm(deploymentArtifactDirPath, { recursive: true, force: true })
  })

  it('Can deploy contract using CREATE', async () => {
    expect(await sepoliaProvider.getCode(createAddressOne)).to.not.eq('0x')

    const contract = new ethers.Contract(
      createAddressOne,
      MyContract2Artifact.abi,
      sepoliaProvider
    )

    expect(await contract.number()).to.equal(BigInt(1))
  })

  // This test checks that the Gnosis Safe's nonce is incremented as a contract instead of an EOA.
  // We test this by deploying a contract, then calling a function on it, then deploying another
  // contract. This tests that the Gnosis Safe's nonce is incremented as a contract because contract
  // nonces are not incremented for function calls, whereas EOA nonces are.
  it(`Gnosis Safe's nonce is incremented as a contract`, async () => {
    // Check that the
    const contractOne = new ethers.Contract(
      createAddressOne,
      MyContract2Artifact.abi,
      sepoliaProvider
    )
    expect(await contractOne.number()).to.equal(BigInt(1))

    expect(await sepoliaProvider.getCode(createAddressTwo)).to.not.eq('0x')
    const contract = new ethers.Contract(
      createAddressTwo,
      MyContract2Artifact.abi,
      sepoliaProvider
    )
    expect(await contract.number()).to.equal(BigInt(0))
  })

  it('Calls custom script entry point function', async () => {
    const contractAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    const contract = getContract(contractAddress, MyContract2Artifact)

    expect(await contract.number()).equals(BigInt(scriptInputParam))
  })

  it('Can call fallback function on contract', async () => {
    expect(await sepoliaProvider.getCode(fallbackCreate2Address)).to.not.eq(
      '0x'
    )

    const contract = getContract(fallbackCreate2Address, FallbackArtifact)

    expect(await contract.myString()).to.equal('did fallback')
  })

  it('Can deploy with Create3 and infer artifact', async () => {
    expect(await sepoliaProvider.getCode(fallbackCreate3Address)).to.not.eq(
      '0x'
    )

    checkLabeled(fallbackCreate3Address, 'contracts/test/Fallback.sol:Fallback')

    // Check that the `CREATE3` proxy is not labeled.
    const create3ProxyAddress = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(CREATE3_PROXY_INITCODE)
    )
    checkNotLabeled(create3ProxyAddress)
  })

  describe('Can deploy contract that deploys contract in constructor', async () => {
    describe('With label', async () => {
      it('Create2', async () => {
        // expect both deployed
        expect(
          await sepoliaProvider.getCode(constructorDeploysContractAddress)
        ).to.not.eq('0x')
        expect(
          await sepoliaProvider.getCode(constructorDeploysContractChildAddress)
        ).to.not.eq('0x')

        // expect child is stored in parent
        const parentContract = getContract(
          constructorDeploysContractAddress,
          ConstructorDeploysContractParentArtifact
        )
        expect(await parentContract.myContract()).to.equal(
          constructorDeploysContractChildAddress
        )

        const childContract = getContract(
          constructorDeploysContractChildAddress,
          ConstructorDeploysContractChildArtifact
        )
        expect(await childContract.x()).to.eq(BigInt(1))

        // expect both are labeled
        checkLabeled(
          constructorDeploysContractAddress,
          'contracts/test/ConstructorDeploysContract.sol:ConstructorDeploysContract'
        )
        checkLabeled(
          constructorDeploysContractChildAddress,
          'contracts/test/ConstructorDeploysContract.sol:DeployedInConstructor'
        )
      })

      it('Create3', async () => {
        // expect both deployed
        expect(
          await sepoliaProvider.getCode(
            constructorDeploysContractAddressCreate3
          )
        ).to.not.eq('0x')
        expect(
          await sepoliaProvider.getCode(
            constructorDeploysContractChildAddressCreate3
          )
        ).to.not.eq('0x')

        // expect child is stored in parent
        const parentContract = getContract(
          constructorDeploysContractAddressCreate3,
          ConstructorDeploysContractParentArtifact
        )
        expect(await parentContract.myContract()).to.equal(
          constructorDeploysContractChildAddressCreate3
        )

        // expect can interact with child
        const childContract = getContract(
          constructorDeploysContractChildAddressCreate3,
          ConstructorDeploysContractChildArtifact
        )
        expect(await childContract.x()).to.eq(BigInt(2))

        // expect both are labeled
        checkLabeled(
          constructorDeploysContractAddressCreate3,
          'contracts/test/ConstructorDeploysContract.sol:ConstructorDeploysContract'
        )
        checkLabeled(
          constructorDeploysContractChildAddressCreate3,
          'contracts/test/ConstructorDeploysContract.sol:DeployedInConstructor'
        )

        // Check that the `CREATE3` proxy is not labeled.
        const create3ProxyAddress = ethers.getCreate2Address(
          DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
          ethers.zeroPadValue('0x01', 32), // Salt is `bytes32(uint(1))`
          ethers.keccak256(CREATE3_PROXY_INITCODE)
        )
        checkNotLabeled(create3ProxyAddress)
      })
    })
  })

  it('Transfers funds to Safe during deployment', async () => {
    // Narrow the TypeScript types.
    if (!networkConfig) {
      throw new Error(`Object(s) undefined.`)
    }

    // Expect funds to be in the safe
    // 1 eth (the initial value of the safe) + 0.15 eth (the funds airdropped to the safe) - 0.03 eth (the funds transferred away from the safe during the deployment)
    expect(await sepoliaProvider.getBalance(networkConfig.safeAddress)).to.eq(
      BigInt('1120000000000000000')
    )

    // Expect funds to have been transferred to createAddressOne
    expect(await sepoliaProvider.getBalance(createAddressOne)).to.eq(
      BigInt('10000000000000000')
    )

    // Expect funds to have been transferred to createAddressTwo
    expect(await sepoliaProvider.getBalance(myContractPayableAddress)).to.eq(
      BigInt('20000000000000000')
    )
  })

  it('Writes deployment artifacts correctly', async () => {
    // Narrow the TypeScript types.
    if (
      !deploymentConfig ||
      !networkConfig ||
      !merkleTree ||
      !receipts ||
      !configArtifacts
    ) {
      throw new Error(`Object(s) undefined.`)
    }

    const artifacts: DeploymentArtifacts = {
      networks: {},
      compilerInputs: {},
    }
    await makeDeploymentArtifacts(
      {
        [networkConfig.chainId]: {
          deploymentConfig,
          receipts,
          provider: sepoliaProvider,
        },
      },
      merkleTree.root,
      configArtifacts,
      artifacts
    )

    checkArtifacts(
      'Simple_Project',
      deploymentConfig,
      getEmptyDeploymentArtifacts(),
      artifacts,
      ExecutionMode.LiveNetworkCLI,
      [
        'MyContract2.json',
        'MyContract2_1.json',
        'MyContract2_2.json',
        'Fallback.json',
        'Fallback_1.json',
        'ConstructorDeploysContract.json',
        'DeployedInConstructor.json',
        'ConstructorDeploysContract_1.json',
        'DeployedInConstructor_1.json',
      ]
    )
  })
})

const getContract = (address: string, artifact: any): ethers.Contract => {
  const contract = new ethers.Contract(address, artifact.abi, sepoliaProvider)
  return contract
}

const expectValidDeployment = async (input: {
  deployment: Awaited<ReturnType<typeof deploy>>
  previousArtifacts: DeploymentArtifacts
  provider: SphinxJsonRpcProvider
  expectedExecutionMode: ExecutionMode
  expectedContractFileNames: Array<string>
  expectedContractAddress: string
  expectedInitialState: InitialChainState
  expectedActionInputs: Array<Omit<ActionInput, 'gas'>>
}) => {
  const {
    deployment,
    previousArtifacts,
    provider,
    expectedExecutionMode,
    expectedContractFileNames,
    expectedContractAddress,
    expectedInitialState,
    expectedActionInputs,
  } = input

  const {
    deploymentConfig,
    preview,
    merkleTree,
    receipts,
    configArtifacts,
    deploymentArtifacts,
  } = deployment

  const networkConfig = deploymentConfig?.networkConfigs.at(0)

  if (
    !deploymentConfig ||
    !preview ||
    !merkleTree ||
    !receipts ||
    !configArtifacts ||
    !networkConfig ||
    !deploymentArtifacts
  ) {
    throw new Error(`Object(s) undefined.`)
  }

  expect(networkConfig.executionMode).equals(expectedExecutionMode)

  const contractAddresses = getContractAddressesFromNetworkConfig(networkConfig)
  for (const address of contractAddresses) {
    expect(await provider.getCode(address)).does.not.equal('0x')
  }

  const contract = new ethers.Contract(
    expectedContractAddress,
    MyContract2Artifact.abi,
    provider
  )
  expect(await provider.getCode(expectedContractAddress)).to.not.equal('0x')
  expect(await contract.number()).to.equal(BigInt(2))

  expect(networkConfig.initialState).deep.equals(expectedInitialState)

  const actualActionInputsClone = structuredClone(
    networkConfig.actionInputs
  ) as any[]
  actualActionInputsClone.forEach((actionInput) => delete actionInput.gas)
  expect(actualActionInputsClone).deep.equals(expectedActionInputs)

  checkArtifacts(
    networkConfig.newConfig.projectName,
    deploymentConfig,
    previousArtifacts,
    deploymentArtifacts,
    expectedExecutionMode,
    expectedContractFileNames
  )
}
