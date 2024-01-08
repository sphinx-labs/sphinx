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
  SUPPORTED_NETWORKS,
  SphinxJsonRpcProvider,
  SphinxPreview,
  SphinxTransactionReceipt,
  execAsync,
  getCreate3Address,
  makeDeploymentArtifacts,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  SphinxMerkleTree,
} from '@sphinx-labs/contracts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as FallbackArtifact from '../../../out/artifacts/Fallback.sol/Fallback.json'
import * as RevertDuringSimulation from '../../../out/artifacts/RevertDuringSimulation.s.sol/RevertDuringSimulation.json'
import * as ConflictingNameContractArtifact from '../../../out/artifacts/First.sol/ConflictingNameContract.json'
import * as ConstructorDeploysContractParentArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/ConstructorDeploysContract.json'
import * as ConstructorDeploysContractChildArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/DeployedInConstructor.json'
import { deploy } from '../../../src/cli/deploy'
import { checkArtifacts, killAnvilNodes, startAnvilNodes } from '../common'
import {
  getSphinxModuleAddressFromScript,
  makeMockSphinxContext,
} from '../utils'

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
const unlabeledConstructorDeploysContractAddress = ethers.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  '0x' + '00'.repeat(31) + '02',
  ethers.keccak256(
    ethers.concat([
      ConstructorDeploysContractParentArtifact.bytecode.object,
      coder.encode(['uint'], [3]),
    ])
  )
)
const unlabeledConstructorDeploysContractChildAddress = ethers.getCreateAddress(
  {
    from: unlabeledConstructorDeploysContractAddress,
    nonce: 1,
  }
)
const unlabeledConstructorDeploysContractCreate3Address = getCreate3Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  '0x' + '00'.repeat(31) + '02'
)
const unlabeledConstructorDeploysContractChildCreate3Address =
  ethers.getCreateAddress({
    from: unlabeledConstructorDeploysContractCreate3Address,
    nonce: 1,
  })
const conflictingNameContractAddress = ethers.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.ZeroHash,
  ethers.keccak256(
    ethers.concat([
      ConflictingNameContractArtifact.bytecode.object,
      coder.encode(['uint'], [1]),
    ])
  )
)
const unlabeledConflictingNameContract = ethers.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  '0x' + '00'.repeat(31) + '01',
  ethers.keccak256(
    ethers.concat([
      ConflictingNameContractArtifact.bytecode.object,
      coder.encode(['uint'], [2]),
    ])
  )
)
const conflictingNameContractWithInteractionAddress = ethers.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  '0x' + '00'.repeat(31) + '02',
  ethers.keccak256(
    ethers.concat([
      ConflictingNameContractArtifact.bytecode.object,
      coder.encode(['uint'], [3]),
    ])
  )
)

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

const allChainIds = [SUPPORTED_NETWORKS['sepolia']]
const deploymentArtifactDirPath = 'deployments'

describe('Deploy CLI command', () => {
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
      await execAsync(`forge clean`)

      const executionMode = ExecutionMode.LocalNetworkCLI

      expect(await provider.getCode(expectedMyContract2Address)).to.equal('0x')

      // Check that the deployment artifacts have't been created yet
      expect(existsSync(deploymentArtifactDirPath)).to.be.false

      const targetContract = 'Simple1'
      const { compilerConfig, preview, merkleTree, receipts, configArtifacts } =
        await deploy({
          scriptPath: forgeScriptPath,
          network: 'sepolia',
          skipPreview: false,
          silent: true,
          sphinxContext: makeMockSphinxContext([
            'contracts/test/MyContracts.sol:MyContract2',
          ]),
          verify: false,
          targetContract,
          forceRecompile: false,
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

      // Check that the deployment artifact hasn't been created yet
      expect(existsSync(deploymentArtifactDirPath)).to.be.false

      const sphinxContext = makeMockSphinxContext([
        'contracts/test/MyContracts.sol:MyContract2',
      ])
      const executionMode = ExecutionMode.LiveNetworkCLI

      // Override the `isLiveNetwork` function to always return `true`.
      sphinxContext.isLiveNetwork = async (
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
          sphinxContext,
          verify: false,
          targetContract,
          forceRecompile: false,
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

      const { preview } = await deploy({
        scriptPath: emptyScriptPath,
        network: 'sepolia',
        skipPreview: false,
        silent: true,
        sphinxContext: makeMockSphinxContext([]),
        verify: false,
        forceRecompile: false,
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

      let errorThrown = false
      try {
        await deploy({
          scriptPath,
          network: 'sepolia',
          skipPreview: false,
          silent: true,
          sphinxContext: makeMockSphinxContext([
            `${scriptPath}:RevertDuringSimulation`,
          ]),
          verify: false,
          targetContract: 'RevertDuringSimulation_Script',
          forceRecompile: false,
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
    let fullyQualifiedName: string | undefined
    for (const actionInput of compilerConfig!.actionInputs) {
      for (const contract of actionInput.contracts) {
        if (contract.address === address) {
          fullyQualifiedName = contract.fullyQualifiedName
        }
      }
    }
    expect(fullyQualifiedName).to.be.undefined
  }

  before(async () => {
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
        sphinxContext: makeMockSphinxContext([
          'contracts/test/ConstructorDeploysContract.sol:ConstructorDeploysContract',
          'contracts/test/ConstructorDeploysContract.sol:DeployedInConstructor',
          'contracts/test/Fallback.sol:Fallback',
          'contracts/test/conflictingNameContracts/First.sol:ConflictingNameContract',
        ]),
        verify: false,
        forceRecompile: false,
      }))

    expect(compilerConfig).to.not.be.undefined
    expect(preview).to.not.be.undefined
  })

  after(async () => {
    await killAnvilNodes(allChainIds)

    await rm(deploymentArtifactDirPath, { recursive: true, force: true })
  })

  it('Can call fallback function on contract', async () => {
    expect(await provider.getCode(fallbackCreate2Address)).to.not.eq('0x')

    const contract = getContract(fallbackCreate2Address, FallbackArtifact)

    expect(await contract.myString()).to.equal('did fallback')
  })

  it('Can deploy with Create3 and label via interaction', async () => {
    expect(await provider.getCode(fallbackCreate3Address)).to.not.eq('0x')

    checkLabeled(fallbackCreate3Address, 'contracts/test/Fallback.sol:Fallback')
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
      })
    })

    describe('Without label', async () => {
      it('Create2', async () => {
        // expect both deployed
        expect(
          await provider.getCode(unlabeledConstructorDeploysContractAddress)
        ).to.not.eq('0x')
        expect(
          await provider.getCode(
            unlabeledConstructorDeploysContractChildAddress
          )
        ).to.not.eq('0x')

        // expect child is stored in parent
        const parentContract = getContract(
          unlabeledConstructorDeploysContractAddress,
          ConstructorDeploysContractParentArtifact
        )
        expect(await parentContract.myContract()).to.equal(
          unlabeledConstructorDeploysContractChildAddress
        )

        // expect can interact with child
        const childContract = getContract(
          unlabeledConstructorDeploysContractChildAddress,
          ConstructorDeploysContractChildArtifact
        )
        expect(await childContract.x()).to.eq(BigInt(3))

        // expect child is not labeled
        checkNotLabeled(unlabeledConstructorDeploysContractChildAddress)
        expect(
          compilerConfig?.unlabeledAddresses.includes(
            unlabeledConstructorDeploysContractChildAddress
          )
        ).to.eq(true)
      })

      it('Create3', async () => {
        // expect both deployed
        expect(
          await provider.getCode(
            unlabeledConstructorDeploysContractCreate3Address
          )
        ).to.not.eq('0x')
        expect(
          await provider.getCode(
            unlabeledConstructorDeploysContractChildCreate3Address
          )
        ).to.not.eq('0x')

        // expect child is stored in parent
        const parentContract = getContract(
          unlabeledConstructorDeploysContractCreate3Address,
          ConstructorDeploysContractParentArtifact
        )
        expect(await parentContract.myContract()).to.equal(
          unlabeledConstructorDeploysContractChildCreate3Address
        )

        // expect can interact with child
        const childContract = getContract(
          unlabeledConstructorDeploysContractChildCreate3Address,
          ConstructorDeploysContractChildArtifact
        )
        expect(await childContract.x()).to.eq(BigInt(4))

        // expect both are not labeled
        checkNotLabeled(unlabeledConstructorDeploysContractCreate3Address)
        checkNotLabeled(unlabeledConstructorDeploysContractChildCreate3Address)
        expect(
          compilerConfig?.unlabeledAddresses.includes(
            unlabeledConstructorDeploysContractCreate3Address
          )
        ).to.eq(true)
        expect(
          compilerConfig?.unlabeledAddresses.includes(
            unlabeledConstructorDeploysContractChildCreate3Address
          )
        ).to.eq(true)
      })
    })

    describe('Can deploy ambiguously named contract', async () => {
      it('With label', async () => {
        // expect contract to be deployed
        expect(
          await provider.getCode(conflictingNameContractAddress)
        ).to.not.eq('0x')

        // check can interact with the contract
        const contract = getContract(
          conflictingNameContractAddress,
          ConflictingNameContractArtifact
        )
        expect(await contract.number()).to.eq(BigInt(1))

        // expect contract is labeled
        checkLabeled(
          conflictingNameContractAddress,
          'contracts/test/conflictingNameContracts/First.sol:ConflictingNameContract'
        )
      })

      it('Without label', async () => {
        // expect contract to be deployed
        expect(
          await provider.getCode(unlabeledConflictingNameContract)
        ).to.not.eq('0x')

        // check can interact with the contract
        const contract = getContract(
          unlabeledConflictingNameContract,
          ConflictingNameContractArtifact
        )
        expect(await contract.number()).to.eq(BigInt(2))

        // expect contract is labeled
        checkNotLabeled(unlabeledConflictingNameContract)
      })

      it('With interaction', async () => {
        // expect contract to be deployed
        expect(
          await provider.getCode(conflictingNameContractWithInteractionAddress)
        ).to.not.eq('0x')

        // check can interact with the contract
        const contract = getContract(
          conflictingNameContractWithInteractionAddress,
          ConflictingNameContractArtifact
        )
        expect(await contract.number()).to.eq(BigInt(5))

        // expect contract is labeled
        checkLabeled(
          conflictingNameContractWithInteractionAddress,
          'contracts/test/conflictingNameContracts/First.sol:ConflictingNameContract'
        )
      })
    })
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
        'Fallback.json',
        'Fallback_1.json',
        'DeployedInConstructor.json',
        'ConstructorDeploysContract.json',
        'ConstructorDeploysContract_1.json',
        'DeployedInConstructor_1.json',
        'ConstructorDeploysContract_2.json',
        'ConflictingNameContract.json',
        'ConflictingNameContract_1.json',
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
            referenceName: 'GnosisSafe',
            functionName: 'deploy',
            variables: [],
            address: compilerConfig.safeAddress,
          },
          {
            referenceName: 'SphinxModule',
            functionName: 'deploy',
            variables: [],
            address: compilerConfig.moduleAddress,
          },
          {
            referenceName: 'MyContract2',
            functionName: 'deploy',
            variables: [],
            address: expectedMyContract2Address,
          },
          {
            referenceName: 'MyContract2',
            functionName: 'incrementMyContract2',
            variables: ['2'],
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
