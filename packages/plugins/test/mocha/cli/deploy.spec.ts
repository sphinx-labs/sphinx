import { join } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  Create2ActionInput,
  ParsedConfig,
  SUPPORTED_NETWORKS,
  SphinxJsonRpcProvider,
  SphinxPreview,
  getCreate3Address,
  spawnAsync,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as FallbackArtifact from '../../../out/artifacts/Fallback.sol/Fallback.json'
import * as RevertDuringSimulation from '../../../out/artifacts/RevertDuringSimulation.s.sol/RevertDuringSimulation.json'
import * as ConflictingNameContractArtifact from '../../../out/artifacts/First.sol/ConflictingNameContract.json'
import * as ConstructorDeploysContractParentArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/ConstructorDeploysContract.json'
import * as ConstructorDeploysContractChildArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/DeployedInConstructor.json'
import { deploy } from '../../../src/cli/deploy'
import { getFoundryToml } from '../../../src/foundry/options'
import { getSphinxModuleAddressFromScript } from '../../../src/foundry/utils'
import { killAnvilNodes, startAnvilNodes } from '../common'

// TODO(end): .only

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

const allChainIds = [SUPPORTED_NETWORKS['sepolia']]

describe('Deploy CLI command', () => {
  let deploymentArtifactFilePath: string
  before(async () => {
    const { deploymentFolder } = await getFoundryToml()
    deploymentArtifactFilePath = join(
      deploymentFolder,
      'sepolia-local',
      'MyContract2.json'
    )
  })

  beforeEach(async () => {
    // Make sure that the Anvil node isn't running.
    await killAnvilNodes(allChainIds)
    // Start the Anvil nodes.
    await startAnvilNodes(allChainIds)

    if (existsSync(deploymentArtifactFilePath)) {
      unlinkSync(deploymentArtifactFilePath)
    }
  })

  afterEach(async () => {
    await killAnvilNodes(allChainIds)
  })

  describe('With preview', () => {
    // TODO(end): .only
    it.only('Executes deployment', async () => {
      // We run `forge clean` to ensure that a deployment can occur even if we're running
      // a fresh compilation process.
      // await execAsync(`forge clean`) // TODO(end): undo

      expect(await provider.getCode(expectedMyContract2Address)).to.equal('0x')

      // Check that the deployment artifact hasn't been created yet
      expect(existsSync(deploymentArtifactFilePath)).to.be.false

      const targetContract = 'Simple1'
      const { parsedConfig: deployedParsedConfig, preview } = await deploy(
        forgeScriptPath,
        'sepolia',
        false, // Run preview
        true, // Silent
        targetContract,
        undefined, // Don't verify on Etherscan.
        false,
        mockPrompt
      )

      // Check that the ParsedConfig is defined. We do this instead of using
      // `expect(...).to.be.defined` because throwing an error narrows the TypeScript type.
      if (!deployedParsedConfig) {
        throw new Error(`ParsedConfig object is undefined.`)
      }

      expect(
        (deployedParsedConfig.actionInputs[0] as Create2ActionInput)
          .create2Address
      ).to.equal(expectedMyContract2Address)
      const contract = new ethers.Contract(
        expectedMyContract2Address,
        MyContract2Artifact.abi,
        provider
      )
      expect(await provider.getCode(expectedMyContract2Address)).to.not.equal(
        '0x'
      )
      expect(await contract.number()).to.equal(BigInt(2))

      expect(preview).to.deep.equal({
        networks: [
          {
            networkTags: ['sepolia (local)'],
            executing: [
              {
                address: deployedParsedConfig.safeAddress,
                referenceName: 'GnosisSafe',
                functionName: 'deploy',
                variables: [],
              },
              {
                address: deployedParsedConfig.moduleAddress,
                referenceName: 'SphinxModule',
                functionName: 'deploy',
                variables: [],
              },
              {
                address: expectedMyContract2Address,
                referenceName: 'MyContract2',
                functionName: 'deploy',
                variables: [],
              },
              {
                address: expectedMyContract2Address,
                referenceName: 'MyContract2',
                functionName: 'incrementMyContract2',
                variables: ['2'],
              },
            ],
            skipping: [],
          },
        ],
        unlabeledAddresses: new Set([]),
      })

      // TODO(artifacts): rm
      // Check that the deployment artifact was created
      // expect(existsSync(deploymentArtifactFilePath)).to.be.true
    })

    // We exit early even if the Gnosis Safe and Sphinx Module haven't been deployed yet. In other
    // words, we don't allow the user to use the `deploy` CLI command to just deploy a Gnosis Safe
    // and Sphinx Module. This behavior is consistent with the `propose` CLI command.
    it(`Displays preview then exits when there's nothing to execute`, async () => {
      expect(await provider.getCode(expectedMyContract2Address)).to.equal('0x')

      const { preview } = await deploy(
        emptyScriptPath,
        'sepolia',
        false, // Run preview
        true, // Silent
        undefined, // Only one contract in the script file, so there's no target contract to specify.
        undefined, // Don't verify on Etherscan.
        false,
        mockPrompt
      )

      expect(preview).to.be.undefined

      // TODO(artifacts): rm
      // // Check that the deployment artifact wasn't created
      // expect(existsSync(deploymentArtifactFilePath)).to.be.false
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

      // We invoke the proposal with `spawn` because the Node process will terminate with an exit
      // code (via `process.exit(1)`), which can't be caught by Chai.
      const { code, stdout } = await spawnAsync('npx', [
        // We don't use the `sphinx` binary because the CI process isn't able to detect it. This
        // is functionally equivalent to running the command with the `sphinx` binary.
        'ts-node',
        'src/cli/index.ts',
        'deploy',
        '--network',
        'sepolia',
        scriptPath,
        '--confirm',
        '--target-contract',
        'RevertDuringSimulation_Script',
      ])
      expect(code).equals(1)
      const expectedOutput =
        `Sphinx: failed to execute deployment because the following action reverted: RevertDuringSimulation<${expectedContractAddress}>.deploy(\n` +
        `     "${sphinxModuleAddress}"\n` +
        `   )`
      // If the `stdout` includes this error message, we know that the deployment failed during the
      // simulation. This is because error messages in `Sphinx.sol` aren't thrown when transactions
      // are broadcasted onto a network. These error messages only occur during Foundry's simulation
      // step.
      expect(stdout.includes(expectedOutput)).equals(true)
    })
  })
})

describe('Deployment Cases', () => {
  let preview: SphinxPreview | undefined
  let parsedConfig: ParsedConfig | undefined

  const checkLabeled = (address: string, fullyQualifiedName: string) => {
    const actionContract = parsedConfig?.actionInputs.find(
      (a) => a.contracts[address] !== undefined
    )?.contracts[address]
    expect(actionContract?.fullyQualifiedName).to.eq(fullyQualifiedName)
  }

  const checkNotLabeled = (address: string) => {
    const actionContract = parsedConfig?.actionInputs.find(
      (a) => a.contracts[address] !== undefined
    )?.contracts[address]
    expect(actionContract).to.be.undefined
  }

  before(async () => {
    await killAnvilNodes(allChainIds)
    ;({ parsedConfig, preview } = await deploy(
      deploymentCasesScriptPath,
      'sepolia',
      false, // Skip preview
      true, // Silent
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      undefined, // Don't verify on Etherscan.
      true,
      mockPrompt
    ))

    expect(parsedConfig).to.not.be.undefined
    expect(preview).to.not.be.undefined
  })

  after(async () => {
    await killAnvilNodes(allChainIds)
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

        // expect deployment artifacts to be written for both of them
        // and that the address matches the expected address
        const parentDeploymentArtifactPath =
          './deployments/sepolia-local/ConstructorDeploysContract.json'
        expect(existsSync(join(parentDeploymentArtifactPath))).to.be.true
        const parentArtifact = JSON.parse(
          readFileSync(parentDeploymentArtifactPath).toString()
        )
        expect(parentArtifact.address === constructorDeploysContractAddress)

        const childDeploymentArtifactPath =
          './deployments/sepolia-local/DeployedInConstructor.json'
        expect(existsSync(join(childDeploymentArtifactPath))).to.be.true
        const childArtifactPath = JSON.parse(
          readFileSync(childDeploymentArtifactPath).toString()
        )
        expect(childArtifactPath.address === constructorDeploysContractAddress)
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

        // expect deployment artifacts to be written for both of them
        // and that the address matches the expected address
        const parentDeploymentArtifactPath =
          './deployments/sepolia-local/ConstructorDeploysContract_1.json'
        expect(existsSync(join(parentDeploymentArtifactPath))).to.be.true
        const parentArtifact = JSON.parse(
          readFileSync(parentDeploymentArtifactPath).toString()
        )
        expect(
          parentArtifact.address === constructorDeploysContractAddressCreate3
        )

        const childDeploymentArtifactPath =
          './deployments/sepolia-local/DeployedInConstructor_1.json'
        expect(existsSync(join(childDeploymentArtifactPath))).to.be.true
        const childArtifactPath = JSON.parse(
          readFileSync(childDeploymentArtifactPath).toString()
        )
        expect(
          childArtifactPath.address ===
            constructorDeploysContractChildAddressCreate3
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
          parsedConfig?.unlabeledAddresses.includes(
            unlabeledConstructorDeploysContractChildAddress
          )
        ).to.eq(true)

        // expect that there is a deployment artifact for the parent
        const parentDeploymentArtifactPath =
          './deployments/sepolia-local/ConstructorDeploysContract_2.json'
        expect(existsSync(join(parentDeploymentArtifactPath))).to.be.true
        const parentArtifact = JSON.parse(
          readFileSync(parentDeploymentArtifactPath).toString()
        )
        expect(
          parentArtifact.address === unlabeledConstructorDeploysContractAddress
        )

        // expect there is not a deployment artifact for the child
        const childDeploymentArtifactPath =
          './deployments/sepolia-local/DeployedInConstructor_2.json'
        expect(!existsSync(join(childDeploymentArtifactPath))).to.be.true
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
          parsedConfig?.unlabeledAddresses.includes(
            unlabeledConstructorDeploysContractCreate3Address
          )
        ).to.eq(true)
        expect(
          parsedConfig?.unlabeledAddresses.includes(
            unlabeledConstructorDeploysContractChildCreate3Address
          )
        ).to.eq(true)

        // expect there is not a deployment artifact for either
        expect(
          !existsSync(
            join(
              './deployments/sepolia-local/ConstructorDeploysContract_3.json'
            )
          )
        ).to.be.true
        expect(
          !existsSync(
            join('./deployments/sepolia-local/DeployedInConstructor_2.json')
          )
        ).to.be.true
        expect(
          !existsSync(
            join('./deployments/sepolia-local/DeployedInConstructor_3.json')
          )
        ).to.be.true
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

        // expect deployment artifact to be written
        const parentDeploymentArtifactPath =
          './deployments/sepolia-local/ConflictingNameContract.json'
        expect(existsSync(join(parentDeploymentArtifactPath))).to.be.true
        const parentArtifact = JSON.parse(
          readFileSync(parentDeploymentArtifactPath).toString()
        )
        expect(parentArtifact.address === conflictingNameContractAddress)
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

        // expect deployment artifact to be written
        const parentDeploymentArtifactPath =
          './deployments/sepolia-local/ConflictingNameContract_1.json'
        expect(existsSync(join(parentDeploymentArtifactPath))).to.be.true
        const parentArtifact = JSON.parse(
          readFileSync(parentDeploymentArtifactPath).toString()
        )
        expect(
          parentArtifact.address ===
            conflictingNameContractWithInteractionAddress
        )
      })
    })
  })
})

const getContract = (address: string, artifact: any): ethers.Contract => {
  const contract = new ethers.Contract(address, artifact.abi, provider)
  return contract
}
