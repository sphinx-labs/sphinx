import { existsSync } from 'fs'
import { rm } from 'fs/promises'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  CompilerConfig,
  ConfigArtifacts,
  Create2ActionInput,
  DeploymentArtifacts,
  ExecutionMode,
  SphinxJsonRpcProvider,
  SphinxPreview,
  SphinxTransactionReceipt,
  fetchChainIdForNetwork,
  getCreate3Address,
  makeDeploymentArtifacts,
  setBalance,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  CREATE3_PROXY_INITCODE,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  SphinxMerkleTree,
} from '@sphinx-labs/contracts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as MyContractWithLibrariesArtifact from '../../../out/artifacts/MyContracts.sol/MyContractWithLibraries.json'
import * as MyLibraryOneArtifact from '../../../out/artifacts/MyContracts.sol/MyLibraryOne.json'
import * as MyLibraryTwoArtifact from '../../../out/artifacts/MyContracts.sol/MyLibraryTwo.json'
import * as FallbackArtifact from '../../../out/artifacts/Fallback.sol/Fallback.json'
import * as RevertDuringSimulation from '../../../out/artifacts/RevertDuringSimulation.s.sol/RevertDuringSimulation.json'
import * as ConstructorDeploysContractParentArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/ConstructorDeploysContract.json'
import * as ConstructorDeploysContractChildArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/DeployedInConstructor.json'
import { deploy } from '../../../src/cli/deploy'
import {
  checkArtifacts,
  killAnvilNodes,
  startAnvilNodes,
  getSphinxModuleAddressFromScript,
} from '../common'
import { makeMockSphinxContextForIntegrationTests } from '../mock'

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
const provider = new SphinxJsonRpcProvider(sepoliaRpcUrl)

const forgeScriptPath = 'contracts/test/script/Simple.s.sol'
const emptyScriptPath = 'contracts/test/script/Empty.s.sol'
const deploymentCasesScriptPath = 'contracts/test/script/Cases.s.sol'

const expectedMyContract2Address = ethers.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.ZeroHash,
  ethers.keccak256(MyContract2Artifact.bytecode.object)
)

const allChainIds = [fetchChainIdForNetwork('sepolia')]
const deploymentArtifactDirPath = 'deployments'

describe('Deploy CLI command', () => {
  let originalEnv: NodeJS.ProcessEnv

  before(() => {
    // Store the original environment variables. We'll reset them after this test suite is finished.
    originalEnv = { ...process.env }

    process.env['SEPOLIA_RPC_URL'] = sepoliaRpcUrl
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
    const projectName = 'Simple_Project_1'

    it('Executes deployment on local network', async () => {
      // We run `forge clean` to ensure that a deployment can occur even if there are no existing
      // contract artifacts. This is worthwhile to test because we read contract interfaces in the
      // `deploy` function, which will fail if the function hasn't compiled the contracts yet. By
      // running `forge clean` here, we're testing that this compilation occurs in the `deploy`
      // function.
      // await execAsync(`forge clean`) TODO(end): undo

      const executionMode = ExecutionMode.LocalNetworkCLI

      expect(await provider.getCode(expectedMyContract2Address)).to.equal('0x')

      // Check that the deployment artifacts have't been created yet
      expect(existsSync(deploymentArtifactDirPath)).to.be.false

      const { context } = makeMockSphinxContextForIntegrationTests([
        'contracts/test/MyContracts.sol:MyContract2',
      ])

      const targetContract = 'Simple1'
      const { compilerConfig, preview, merkleTree, receipts, configArtifacts } =
        await deploy({
          scriptPath: forgeScriptPath,
          network: 'sepolia',
          skipPreview: false,
          silent: true,
          sphinxContext: context,
          verify: false,
          targetContract,
        })

      // Narrow the TypeScript types.
      if (
        !compilerConfig ||
        !preview ||
        !merkleTree ||
        !receipts ||
        !configArtifacts
      ) {
        throw new Error(`Object(s) undefined.`)
      }

      expect(compilerConfig.executionMode).equals(executionMode)

      const artifacts = await makeDeploymentArtifacts(
        {
          [compilerConfig.chainId]: {
            compilerConfig,
            receipts,
            provider,
            previousContractArtifacts: {},
          },
        },
        merkleTree.root,
        configArtifacts
      )

      await expectValidDeployment(
        compilerConfig,
        preview,
        'sepolia (local)',
        projectName,
        artifacts,
        executionMode,
        1,
        ['MyContract2.json']
      )
    })

    // This tests the logic that deploys on live networks, which uses a signer to call the Sphinx
    // Module. This is separate from the logic that deploys on local network, which uses an
    // auto-generated wallet and executes transactions through the `ManagedService`.
    it('Executes deployment on live network', async () => {
      expect(await provider.getCode(expectedMyContract2Address)).to.equal('0x')

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
        provider
      )

      // Check that the deployment artifact hasn't been created yet
      expect(existsSync(deploymentArtifactDirPath)).to.be.false

      const { context } = makeMockSphinxContextForIntegrationTests([
        'contracts/test/MyContracts.sol:MyContract2',
      ])
      const executionMode = ExecutionMode.LiveNetworkCLI

      // Override the `isLiveNetwork` function to always return `true`.
      context.isLiveNetwork = async (
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        provider_: SphinxJsonRpcProvider | HardhatEthersProvider
      ): Promise<boolean> => {
        return true
      }

      const targetContract = 'Simple1'
      const { compilerConfig, preview, merkleTree, receipts, configArtifacts } =
        await deploy({
          scriptPath: forgeScriptPath,
          network: 'sepolia',
          skipPreview: false,
          silent: true,
          sphinxContext: context,
          verify: false,
          targetContract,
        })

      // Narrow the TypeScript types.
      if (
        !compilerConfig ||
        !preview ||
        !merkleTree ||
        !receipts ||
        !configArtifacts
      ) {
        throw new Error(`Object(s) undefined.`)
      }

      expect(compilerConfig.executionMode).equals(executionMode)

      const artifacts = await makeDeploymentArtifacts(
        {
          [compilerConfig.chainId]: {
            compilerConfig,
            receipts,
            provider,
            previousContractArtifacts: {},
          },
        },
        merkleTree.root,
        configArtifacts
      )

      await expectValidDeployment(
        compilerConfig,
        preview,
        'sepolia',
        projectName,
        artifacts,
        executionMode,
        1,
        ['MyContract2.json']
      )
    })

    // We exit early even if the Gnosis Safe and Sphinx Module haven't been deployed yet. In other
    // words, we don't allow the user to use the `deploy` CLI command to just deploy a Gnosis Safe
    // and Sphinx Module. This behavior is consistent with the `propose` CLI command.
    it(`Displays preview then exits when there's nothing to execute`, async () => {
      expect(await provider.getCode(expectedMyContract2Address)).to.equal('0x')

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

    // This test checks that Foundry's simulation can fail after the transactions have been
    // collected, but before any transactions are broadcasted. This is worthwhile to test because
    // the `SphinxModule` doesn't revert if a user's transactions causes the deployment to be marked
    // as `FAILED`. If the Foundry plugin doesn't revert either, then Foundry will attempt to
    // broadcast the deployment, which is not desirable.
    it('Reverts if the deployment fails during the simulation', async () => {
      const scriptPath = 'contracts/test/script/RevertDuringSimulation.s.sol'
      const sphinxModuleAddress = await getSphinxModuleAddressFromScript(
        scriptPath,
        sepoliaRpcUrl,
        'RevertDuringSimulation_Script'
      )

      const expectedContractAddress = ethers.getCreate2Address(
        DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        ethers.ZeroHash,
        ethers.keccak256(
          ethers.concat([
            RevertDuringSimulation.bytecode.object,
            coder.encode(['address'], [sphinxModuleAddress]),
          ])
        )
      )

      const { context } = makeMockSphinxContextForIntegrationTests([
        `${scriptPath}:RevertDuringSimulation`,
      ])

      let errorThrown = false
      try {
        await deploy({
          scriptPath,
          network: 'sepolia',
          skipPreview: false,
          silent: true,
          sphinxContext: context,
          verify: false,
          targetContract: 'RevertDuringSimulation_Script',
        })
      } catch (e) {
        errorThrown = true
        const expectedOutput = `The following action reverted during the simulation:\nRevertDuringSimulation<${expectedContractAddress}>.revertDuringSimulation()`
        expect(e.message.includes(expectedOutput)).to.be.true
      }

      expect(errorThrown).to.be.true
    })
  })
})

describe('Deployment Cases', () => {
  let preview: SphinxPreview | undefined
  let compilerConfig: CompilerConfig | undefined
  let merkleTree: SphinxMerkleTree | undefined
  let receipts: Array<SphinxTransactionReceipt> | undefined
  let configArtifacts: ConfigArtifacts | undefined
  let contractWithLibraries: ethers.Contract
  let libraryOneAddress: string
  let libraryTwoAddress: string
  let createAddressOne: string
  let createAddressTwo: string
  let originalEnv: NodeJS.ProcessEnv

  const prelinkedLibraryAddress = '0x' + '88'.repeat(20)

  const checkLabeled = (
    address: string,
    expectedFullyQualifiedName: string
  ) => {
    let fullyQualifiedName: string | undefined
    for (const actionInput of compilerConfig!.actionInputs) {
      for (const contract of actionInput.contracts) {
        if (contract.address === address) {
          fullyQualifiedName = contract.fullyQualifiedName
        }
      }
    }
    expect(fullyQualifiedName).to.eq(expectedFullyQualifiedName)
  }

  const checkNotLabeled = (address: string) => {
    const isAddressUnlabeled = compilerConfig!.unlabeledContracts.some(
      (contract) => contract.address === address
    )
    expect(isAddressUnlabeled).to.eq(true)
  }

  before(async () => {
    // Store the original environment variables. We'll reset them after this test suite is finished.
    originalEnv = { ...process.env }

    process.env['SEPOLIA_RPC_URL'] = sepoliaRpcUrl
    // TODO(docs): define a pre-linked library. this library doesn't need to be deployed because...
    process.env[
      'FOUNDRY_LIBRARIES'
    ] = `contracts/test/MyContracts.sol:MyLibraryThree:${prelinkedLibraryAddress}`

    await killAnvilNodes(allChainIds)
    // Start the Anvil nodes.
    await startAnvilNodes(allChainIds)

    if (existsSync(deploymentArtifactDirPath)) {
      await rm(deploymentArtifactDirPath, { recursive: true, force: true })
    }

    ;({ compilerConfig, preview, receipts, merkleTree, configArtifacts } =
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
      }))

    expect(compilerConfig).to.not.be.undefined
    expect(preview).to.not.be.undefined

    contractWithLibraries = new ethers.Contract(
      ethers.getCreate2Address(
        DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        ethers.ZeroHash,
        ethers.keccak256(MyContractWithLibrariesArtifact.bytecode.object)
      ),
      MyContractWithLibrariesArtifact.abi,
      provider
    )

    libraryOneAddress = ethers.getCreateAddress({
      from: compilerConfig!.safeAddress,
      // The nonce is one because contract nonces start at 1, whereas EOA nonces start at
      // 0.
      nonce: 1,
    })
    libraryTwoAddress = ethers.getCreateAddress({
      from: compilerConfig!.safeAddress,
      nonce: 2,
    })
    createAddressOne = ethers.getCreateAddress({
      from: compilerConfig!.safeAddress,
      nonce: 3,
    })
    createAddressTwo = ethers.getCreateAddress({
      from: compilerConfig!.safeAddress,
      nonce: 4,
    })
  })

  after(async () => {
    process.env = originalEnv

    await killAnvilNodes(allChainIds)

    await rm(deploymentArtifactDirPath, { recursive: true, force: true })
  })

  it('Can deploy contract using CREATE', async () => {
    expect(await provider.getCode(createAddressOne)).to.not.eq('0x')

    const contract = new ethers.Contract(
      createAddressOne,
      MyContract2Artifact.abi,
      provider
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
      provider
    )
    expect(await contractOne.number()).to.equal(BigInt(1))

    expect(await provider.getCode(createAddressTwo)).to.not.eq('0x')
    const contract = new ethers.Contract(
      createAddressTwo,
      MyContract2Artifact.abi,
      provider
    )
    expect(await contract.number()).to.equal(BigInt(0))
  })

  it('Can deploy linked libraries', async () => {
    const libraryOne = new ethers.Contract(
      libraryOneAddress,
      MyLibraryOneArtifact.abi,
      provider
    )
    const libraryTwo = new ethers.Contract(
      libraryTwoAddress,
      MyLibraryTwoArtifact.abi,
      provider
    )

    expect(await provider.getCode(libraryOneAddress)).does.not.equal('0x')
    expect(await libraryOne.myFirstLibraryFunction()).equals(42)
    expect(await contractWithLibraries.myLibraryOne()).equals(libraryOneAddress)

    expect(await provider.getCode(libraryTwoAddress)).does.not.equal('0x')
    expect(await libraryTwo.mySecondLibraryFunction()).equals(123)
    expect(await contractWithLibraries.myLibraryTwo()).equals(libraryTwoAddress)
  })

  it('Can inject pre-linked library into contract', async () => {
    expect(await contractWithLibraries.myLibraryThree()).equals(
      prelinkedLibraryAddress
    )
  })

  it('Can call fallback function on contract', async () => {
    expect(await provider.getCode(fallbackCreate2Address)).to.not.eq('0x')

    const contract = getContract(fallbackCreate2Address, FallbackArtifact)

    expect(await contract.myString()).to.equal('did fallback')
  })

  it('Can deploy with Create3 and infer artifact', async () => {
    expect(await provider.getCode(fallbackCreate3Address)).to.not.eq('0x')

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
          await provider.getCode(constructorDeploysContractAddress)
        ).to.not.eq('0x')
        expect(
          await provider.getCode(constructorDeploysContractChildAddress)
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
          await provider.getCode(constructorDeploysContractAddressCreate3)
        ).to.not.eq('0x')
        expect(
          await provider.getCode(constructorDeploysContractChildAddressCreate3)
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

  it('Network config contains correct library addresses', () => {
    const libraryOne = `contracts/test/MyContracts.sol:MyLibraryOne=${libraryOneAddress}`
    const libraryTwo = `contracts/test/MyContracts.sol:MyLibraryTwo=${libraryTwoAddress}`
    const prelinkedLibrary = `contracts/test/MyContracts.sol:MyLibraryThree=${prelinkedLibraryAddress}`
    expect(compilerConfig!.libraries).deep.equals([
      libraryOne,
      libraryTwo,
      prelinkedLibrary,
    ])
  })

  it('Writes deployment artifacts correctly', async () => {
    // Narrow the TypeScript types.
    if (!compilerConfig || !merkleTree || !receipts || !configArtifacts) {
      throw new Error(`Object(s) undefined.`)
    }

    const artifacts = await makeDeploymentArtifacts(
      {
        [compilerConfig.chainId]: {
          compilerConfig,
          receipts,
          provider,
          previousContractArtifacts: {},
        },
      },
      merkleTree.root,
      configArtifacts
    )

    checkArtifacts(
      'Deployment_Cases_Project',
      [compilerConfig],
      artifacts,
      ExecutionMode.LocalNetworkCLI,
      1,
      [
        'MyContract2.json',
        'MyContract2_1.json',
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
  const contract = new ethers.Contract(address, artifact.abi, provider)
  return contract
}

const expectValidDeployment = async (
  compilerConfig: CompilerConfig,
  preview: SphinxPreview,
  expectedNetworkTag: string,
  projectName: string,
  artifacts: DeploymentArtifacts,
  executionMode: ExecutionMode,
  expectedNumExecutionArtifacts: number,
  expectedContractFileNames: Array<string>
) => {
  expect(
    (compilerConfig.actionInputs[0] as Create2ActionInput).create2Address
  ).to.equal(expectedMyContract2Address)
  const contract = new ethers.Contract(
    expectedMyContract2Address,
    MyContract2Artifact.abi,
    provider
  )
  expect(await provider.getCode(expectedMyContract2Address)).to.not.equal('0x')
  expect(await contract.number()).to.equal(BigInt(2))

  expect(preview).to.deep.equal({
    networks: [
      {
        networkTags: [expectedNetworkTag],
        executing: [
          {
            type: 'SystemDeployment',
          },
          {
            referenceName: 'GnosisSafe',
            functionName: 'deploy',
            variables: {},
            address: compilerConfig.safeAddress,
          },
          {
            referenceName: 'SphinxModule',
            functionName: 'deploy',
            variables: {},
            address: compilerConfig.moduleAddress,
          },
          {
            referenceName: 'MyContract2',
            functionName: 'deploy',
            variables: {},
            address: expectedMyContract2Address,
          },
          {
            referenceName: 'MyContract2',
            functionName: 'incrementMyContract2',
            variables: { _num: '2' },
            address: expectedMyContract2Address,
          },
        ],
        skipping: [],
      },
    ],
    unlabeledAddresses: new Set([]),
  })

  checkArtifacts(
    projectName,
    [compilerConfig],
    artifacts,
    executionMode,
    expectedNumExecutionArtifacts,
    expectedContractFileNames
  )
}
