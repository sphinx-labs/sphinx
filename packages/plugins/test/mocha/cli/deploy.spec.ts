import { join } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { exec } from 'child_process'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  Create2ActionInput,
  SphinxJsonRpcProvider,
  execAsync,
  spawnAsync,
  ParsedConfig,
  getCreate3Address,
  sleep,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as MyLibraryArtifact from '../../../out/artifacts/MyContracts.sol/MyLibrary.json'
import * as MyContractWithLibraryArtifact from '../../../out/artifacts/MyContracts.sol/MyContractWithLibrary.json'
import * as MyPreDeployedLibraryArtifact from '../../../out/artifacts/MyContracts.sol/MyPreDeployedLibrary.json'
import * as MyContractWithPreDeployedLibraryArtifact from '../../../out/artifacts/MyContracts.sol/MyContractWithPreDeployedLibrary.json'
import * as FallbackArtifact from '../../../out/artifacts/Fallback.sol/Fallback.json'
import * as RevertDuringSimulation from '../../../out/artifacts/RevertDuringSimulation.s.sol/RevertDuringSimulation.json'
import * as ConflictingNameContractArtifact from '../../../out/artifacts/First.sol/ConflictingNameContract.json'
import * as ConstructorDeploysContractParentArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/ConstructorDeploysContract.json'
import * as ConstructorDeploysContractChildArtifact from '../../../out/artifacts/ConstructorDeploysContract.sol/DeployedInConstructor.json'
import { deploy } from '../../../src/cli/deploy'
import { getFoundryToml } from '../../../src/foundry/options'
import {
  getSphinxModuleAddressFromScript,
  getSphinxSafeAddressFromScript,
} from '../../../src/foundry/utils'

const coder = new ethers.AbiCoder()

chai.use(chaiAsPromised)
const expect = chai.expect

const sepoliaRpcUrl = `http://127.0.0.1:42111`
const provider = new SphinxJsonRpcProvider(sepoliaRpcUrl)

describe('Deploy CLI command', () => {
  const forgeScriptPath = 'contracts/test/script/Simple.s.sol'
  const emptyScriptPath = 'contracts/test/script/Empty.s.sol'

  let deploymentArtifactPath: string
  before(async () => {
    const { deploymentFolder } = await getFoundryToml()
    deploymentArtifactPath = join(
      deploymentFolder,
      'sepolia-local',
      'MyContract2.json'
    )
  })

  beforeEach(async () => {
    await startSepolia()

    if (existsSync(deploymentArtifactPath)) {
      unlinkSync(deploymentArtifactPath)
    }
  })

  afterEach(async () => {
    await killSepolia()
  })

  it('Executes deployment', async () => {
    // We run `forge clean` to ensure that a deployment can occur even if we're running
    // a fresh compilation process.
    await execAsync(`forge clean`)

    const targetContract = 'Simple1'
    const expectedCreate2Address = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(MyContract2Artifact.bytecode.object)
    )

    expect(await provider.getCode(expectedCreate2Address)).to.equal('0x')

    // Check that the deployment artifacts haven't been created yet
    expect(existsSync(deploymentArtifactPath)).to.be.false

    const { parsedConfig: deployedParsedConfig, preview } = await deploy(
      forgeScriptPath,
      'sepolia',
      false, // Run preview
      true, // Silent
      targetContract,
      undefined, // Don't verify on Etherscan.
      undefined, // No pre-linked libraries
      false,
      mockPreviewPrompt
    )

    // Check that the ParsedConfig is defined. We do this instead of using
    // `expect(...).to.be.defined` because throwing an error narrows the TypeScript type.
    if (!deployedParsedConfig) {
      throw new Error(`ParsedConfig object is undefined.`)
    }

    expect(
      (deployedParsedConfig.actionInputs[0] as Create2ActionInput)
        .create2Address
    ).to.equal(expectedCreate2Address)
    const contractOne = new ethers.Contract(
      expectedCreate2Address,
      MyContract2Artifact.abi,
      provider
    )
    expect(await provider.getCode(expectedCreate2Address)).to.not.equal('0x')
    expect(await contractOne.number()).to.equal(2n)

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
              address: expectedCreate2Address,
              referenceName: 'MyContract2',
              functionName: 'deploy',
              variables: [],
            },
            {
              address: expectedCreate2Address,
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

    // Check that the deployment artifacts were created
    expect(existsSync(deploymentArtifactPath)).to.be.true
  })

  // We exit early even if the Gnosis Safe and Sphinx Module haven't been deployed yet. In other
  // words, we don't allow the user to use the `deploy` CLI command to just deploy a Gnosis Safe
  // and Sphinx Module. This behavior is consistent with the `propose` CLI command.
  it(`Exits when there's nothing to execute`, async () => {
    const { preview } = await deploy(
      emptyScriptPath,
      'sepolia',
      false, // Run preview
      true, // Silent
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      undefined, // Don't verify on Etherscan.
      undefined, // No pre-linked libraries.
      false,
      mockPreviewPrompt
    )

    expect(preview).to.be.undefined
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

describe(`Deployment Cases`, () => {
  const deploymentCasesScriptPath = 'contracts/test/script/Cases.s.sol'

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
  const constructorDeploysContractChildAddressCreate3 = ethers.getCreateAddress(
    {
      from: constructorDeploysContractAddressCreate3,
      nonce: 1,
    }
  )
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
  const unlabeledConstructorDeploysContractChildAddress =
    ethers.getCreateAddress({
      from: unlabeledConstructorDeploysContractAddress,
      nonce: 1,
    })
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
  const conflictingNameContractWithInteractionAddress =
    ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      '0x' + '00'.repeat(31) + '02',
      ethers.keccak256(
        ethers.concat([
          ConflictingNameContractArtifact.bytecode.object,
          coder.encode(['uint'], [3]),
        ])
      )
    )

  let parsedConfig: ParsedConfig

  let libraryAddressOne: string
  let libraryAddressTwo: string
  let libraryAddressThree: string
  let createAddressOne: string
  let createAddressTwo: string
  let containsLibraryOne: string
  let preDeployedLibraryAddress: string

  const checkLabeled = (address: string, fullyQualifiedName: string) => {
    const actionContract = parsedConfig?.actionInputs.find(
      (a) => a.contracts[address] !== undefined
    )?.contracts[address]
    expect(actionContract?.fullyQualifiedName).to.eq(fullyQualifiedName)
  }

  const checkNotLabeled = (address: string) => {
    const actionContract = parsedConfig.actionInputs.find(
      (a) => a.contracts[address] !== undefined
    )?.contracts[address]
    expect(actionContract).to.be.undefined
  }

  before(async () => {
    await startSepolia()

    // Deploy a library, which we'll pass into the Forge script as a pre-linked library.
    const wallet = new ethers.Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      provider
    )
    const libraryFactory = new ethers.ContractFactory(
      MyLibraryArtifact.abi,
      MyLibraryArtifact.bytecode,
      wallet
    )
    const preDeployedLibrary = await (
      await libraryFactory.deploy()
    ).waitForDeployment()
    preDeployedLibraryAddress = await preDeployedLibrary.getAddress()
    const preDeployedLibraryPath = `contracts/test/MyContracts.sol:MyPreDeployedLibrary:${preDeployedLibraryAddress}`

    const deployment = await deploy(
      deploymentCasesScriptPath,
      'sepolia',
      false, // Skip preview
      true, // Silent
      undefined, // Only one contract in the script file, so there's no target contract to specify.
      undefined, // Don't verify on Etherscan.
      [preDeployedLibraryPath],
      true,
      mockPreviewPrompt
    )
    if (!deployment.parsedConfig || !deployment.preview) {
      throw new Error(`ParsedConfig or Preview is undefined.`)
    }
    parsedConfig = deployment.parsedConfig

    const safeAddress = await getSphinxSafeAddressFromScript(
      deploymentCasesScriptPath,
      sepoliaRpcUrl
    )

    // Define the addresses of contracts and libraries deployed via `CREATE` in the Forge script.
    // The standard behavior for Forge scripts is that libraries are deployed via `CREATE` before
    // any other transactions in the script occur. This is why the library addresses are generated
    // with lower nonces than the contracts. We start with a nonce of 1 because contract nonces
    // always start at 1. A contract's nonce is only incremented when it deploys another contract,
    // and not when it executes a call on another contract.
    libraryAddressOne = ethers.getCreateAddress({
      from: safeAddress,
      nonce: 1,
    })
    libraryAddressTwo = ethers.getCreateAddress({
      from: safeAddress,
      nonce: 2,
    })
    libraryAddressThree = ethers.getCreateAddress({
      from: safeAddress,
      nonce: 3,
    })
    createAddressOne = ethers.getCreateAddress({
      from: safeAddress,
      nonce: 4,
    })
    createAddressTwo = ethers.getCreateAddress({
      from: safeAddress,
      nonce: 5,
    })
    containsLibraryOne = ethers.getCreateAddress({
      from: safeAddress,
      nonce: 6,
    })
  })

  after(async () => {
    await killSepolia()
  })

  it('Can deploy contract using CREATE', async () => {
    expect(await provider.getCode(createAddressOne)).to.not.eq('0x')

    const contract = new ethers.Contract(
      createAddressOne,
      MyContract2Artifact.abi,
      provider
    )

    expect(await contract.number()).to.equal(3n)
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
    expect(await contractOne.number()).to.equal(3n)

    expect(await provider.getCode(createAddressTwo)).to.not.eq('0x')
    const contract = new ethers.Contract(
      createAddressTwo,
      MyContract2Artifact.abi,
      provider
    )
    expect(await contract.number()).to.equal(0n)
  })

  describe('Can deploy contract with library', async () => {
    it('Create', async () => {
      expect(await provider.getCode(libraryAddressOne)).to.not.eq('0x')
      expect(await provider.getCode(containsLibraryOne)).to.not.eq('0x')

      const library = new ethers.Contract(
        libraryAddressOne,
        MyLibraryArtifact.abi,
        provider
      )
      const contract = new ethers.Contract(
        containsLibraryOne,
        MyContractWithLibraryArtifact.abi,
        provider
      )

      expect(await library.libNumber()).to.equal(42n)
      expect(await contract.number()).to.equal(43n)
    })

    it('Create2', async () => {
      const containsLibraryTwo = ethers.getCreate2Address(
        DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        ethers.ZeroHash,
        ethers.keccak256(
          ethers.concat([
            MyContractWithLibraryArtifact.bytecode.object,
            coder.encode(['uint256'], [2]),
          ])
        )
      )

      expect(await provider.getCode(libraryAddressTwo)).to.not.eq('0x')
      expect(await provider.getCode(containsLibraryTwo)).to.not.eq('0x')

      const library = new ethers.Contract(
        libraryAddressTwo,
        MyLibraryArtifact.abi,
        provider
      )
      const contract = new ethers.Contract(
        containsLibraryTwo,
        MyContractWithLibraryArtifact.abi,
        provider
      )

      expect(await library.libNumber()).to.equal(42n)
      expect(await contract.number()).to.equal(44n)
    })

    it('Create3', async () => {
      const containsLibraryThree = getCreate3Address(
        DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
        '0x' + '00'.repeat(31) + '09'
      )

      expect(await provider.getCode(libraryAddressThree)).to.not.eq('0x')
      expect(await provider.getCode(containsLibraryThree)).to.not.eq('0x')

      const library = new ethers.Contract(
        libraryAddressThree,
        MyLibraryArtifact.abi,
        provider
      )
      const contract = new ethers.Contract(
        containsLibraryThree,
        MyContractWithLibraryArtifact.abi,
        provider
      )

      expect(await library.libNumber()).to.equal(42n)
      expect(await contract.number()).to.equal(45n)
    })
  })

  // A pre-linked library is a library that has been deployed before the Forge script is executed.
  // This is in contrast to libraries that are deployed during a Forge script.
  it('Can deploy contract that uses pre-linked library', async () => {
    const containsPreDeployedLibrary = ethers.getCreate2Address(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      ethers.ZeroHash,
      ethers.keccak256(
        ethers.concat([
          MyContractWithPreDeployedLibraryArtifact.bytecode.object,
          coder.encode(['uint256'], [1111]),
        ])
      )
    )

    expect(await provider.getCode(preDeployedLibraryAddress)).to.not.eq('0x')
    expect(await provider.getCode(containsPreDeployedLibrary)).to.not.eq('0x')

    const library = new ethers.Contract(
      preDeployedLibraryAddress,
      MyPreDeployedLibraryArtifact.abi,
      provider
    )
    const contract = new ethers.Contract(
      containsPreDeployedLibrary,
      MyContractWithPreDeployedLibraryArtifact.abi,
      provider
    )

    expect(await library.preDeployedLibNum()).to.equal(1234n)
    expect(await contract.number()).to.equal(1111n + 1234n)
  })

  it('Can call fallback function on contract', async () => {
    expect(await provider.getCode(fallbackCreate2Address)).to.not.eq('0x')

    const contract = new ethers.Contract(
      fallbackCreate2Address,
      FallbackArtifact.abi,
      provider
    )

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
        const parentContract = new ethers.Contract(
          constructorDeploysContractAddress,
          ConstructorDeploysContractParentArtifact.abi,
          provider
        )
        expect(await parentContract.myContract()).to.equal(
          constructorDeploysContractChildAddress
        )

        const childContract = new ethers.Contract(
          constructorDeploysContractChildAddress,
          ConstructorDeploysContractChildArtifact.abi,
          provider
        )
        expect(await childContract.x()).to.eq(1n)

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
        const parentContract = new ethers.Contract(
          constructorDeploysContractAddressCreate3,
          ConstructorDeploysContractParentArtifact.abi,
          provider
        )
        expect(await parentContract.myContract()).to.equal(
          constructorDeploysContractChildAddressCreate3
        )

        // expect can interact with child
        const childContract = new ethers.Contract(
          constructorDeploysContractChildAddressCreate3,
          ConstructorDeploysContractChildArtifact.abi,
          provider
        )
        expect(await childContract.x()).to.eq(2n)

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
        const parentContract = new ethers.Contract(
          unlabeledConstructorDeploysContractAddress,
          ConstructorDeploysContractParentArtifact.abi,
          provider
        )
        expect(await parentContract.myContract()).to.equal(
          unlabeledConstructorDeploysContractChildAddress
        )

        // expect can interact with child
        const childContract = new ethers.Contract(
          unlabeledConstructorDeploysContractChildAddress,
          ConstructorDeploysContractChildArtifact.abi,
          provider
        )
        expect(await childContract.x()).to.eq(3n)

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
        const parentContract = new ethers.Contract(
          unlabeledConstructorDeploysContractCreate3Address,
          ConstructorDeploysContractParentArtifact.abi,
          provider
        )
        expect(await parentContract.myContract()).to.equal(
          unlabeledConstructorDeploysContractChildCreate3Address
        )

        // expect can interact with child
        const childContract = new ethers.Contract(
          unlabeledConstructorDeploysContractChildCreate3Address,
          ConstructorDeploysContractChildArtifact.abi,
          provider
        )
        expect(await childContract.x()).to.eq(4n)

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
        const contract = new ethers.Contract(
          conflictingNameContractAddress,
          ConflictingNameContractArtifact.abi,
          provider
        )
        expect(await contract.number()).to.eq(1n)

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
        const contract = new ethers.Contract(
          unlabeledConflictingNameContract,
          ConflictingNameContractArtifact.abi,
          provider
        )
        expect(await contract.number()).to.eq(2n)

        // expect contract is labeled
        checkNotLabeled(unlabeledConflictingNameContract)
      })

      it('With interaction', async () => {
        // expect contract to be deployed
        expect(
          await provider.getCode(conflictingNameContractWithInteractionAddress)
        ).to.not.eq('0x')

        // check can interact with the contract
        const contract = new ethers.Contract(
          conflictingNameContractWithInteractionAddress,
          ConflictingNameContractArtifact.abi,
          provider
        )
        expect(await contract.number()).to.eq(5n)

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

const startSepolia = async () => {
  // Start an Anvil node with a fresh state. We must use `exec` instead of `execAsync`
  // because the latter will hang indefinitely.
  exec(`anvil --chain-id 11155111 --port 42111 &`)
  await sleep(1000)
}

const killSepolia = async () => {
  // Kill the Anvil node
  await execAsync(`kill $(lsof -t -i:42111)`)
}

// Automatically confirms the preview. This is useful for running the preview
// logic in tests because otherwise we'd need to manually confirm the preview.
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPreviewPrompt = async (q: string) => {}
