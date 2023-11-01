import { join, resolve } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { exec } from 'child_process'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  ParsedConfig,
  SphinxJsonRpcProvider,
  SphinxPreview,
  execAsync,
  sleep,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

import { deploy } from '../../../src/cli/deploy'
import { getFoundryConfigOptions } from '../../../src/foundry/options'

chai.use(chaiAsPromised)
const expect = chai.expect

const provider = new SphinxJsonRpcProvider(`http://127.0.0.1:42005`)

const forgeScriptPath = 'contracts/test/script/Simple.s.sol'
const emptyScriptPath = 'contracts/test/script/Empty.s.sol'
const deploymentCasesScriptPath = 'contracts/test/script/Cases.s.sol'

const myContract1Address = '0xd5cEBC3C14a60eD76E843a286Eb8d93CBc252Ba1'
const myContract1ArtifactPath =
  './out/artifacts/MyContracts.sol/MyContract1.json'

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

const startGoerli = async () => {
  // Start an Anvil node with a fresh state. We must use `exec` instead of `execAsync`
  // because the latter will hang indefinitely.
  exec(`anvil --chain-id 5 --port 42005 &`)
  await sleep(500)
}

const killGoerli = async () => {
  // Kill the Anvil node
  await execAsync(`kill $(lsof -t -i:42005)`)
}

describe('Deploy CLI command', () => {
  let deploymentArtifactFilePath: string
  before(async () => {
    const { deploymentFolder } = await getFoundryConfigOptions()
    deploymentArtifactFilePath = join(
      deploymentFolder,
      'goerli-local',
      'MyContract1.json'
    )
  })

  beforeEach(async () => {
    await startGoerli()

    if (existsSync(deploymentArtifactFilePath)) {
      unlinkSync(deploymentArtifactFilePath)
    }
  })

  afterEach(async () => {
    await killGoerli()
  })

  describe('With preview', () => {
    it('Executes deployment', async () => {
      // We run `forge clean` to ensure that a proposal can occur even if we're running
      // a fresh compilation process.
      await execAsync(`forge clean`)

      expect((await provider.getCode(myContract1Address)) === '0x')

      // Check that the deployment artifact hasn't been created yet
      expect(existsSync(deploymentArtifactFilePath)).to.be.false

      const { parsedConfig: deployedParsedConfig, preview } = await deploy(
        forgeScriptPath,
        'goerli',
        false, // Run preview
        true, // Silent
        undefined, // Only one contract in the script file, so there's no target contract to specify.
        undefined, // Don't verify on Etherscan.
        false,
        mockPrompt
      )
      expect(deployedParsedConfig).to.not.be.undefined

      const contract = getContract(myContract1Address, myContract1ArtifactPath)
      expect((await provider.getCode(myContract1Address)) !== '0x')
      expect(await contract.uintArg()).to.equal(3n)

      expect(preview).to.deep.equal({
        networks: [
          {
            networkTags: ['goerli (local)'],
            executing: [
              {
                address: '',
                referenceName: 'SphinxManager',
                functionName: 'deploy',
                variables: [],
              },
              {
                address: '',
                referenceName: 'MyContract1',
                functionName: 'deploy',
                variables: [
                  '-1',
                  '2',
                  '0x0000000000000000000000000000000000000001',
                  '0x0000000000000000000000000000000000000002',
                ],
              },
              {
                address: '0xd5cEBC3C14a60eD76E843a286Eb8d93CBc252Ba1',
                referenceName: 'MyContract1',
                functionName: 'incrementUint',
                variables: [],
              },
            ],
            skipping: [],
          },
        ],
        unlabeledAddresses: new Set([]),
      })

      // Check that the deployment artifact was created
      expect(existsSync(deploymentArtifactFilePath)).to.be.true
    })

    it(`Displays preview then exits when there's nothing to deploy`, async () => {
      expect((await provider.getCode(myContract1Address)) === '0x')

      const { preview } = await deploy(
        emptyScriptPath,
        'goerli',
        false, // Run preview
        true, // Silent
        undefined, // Only one contract in the script file, so there's no target contract to specify.
        undefined, // Don't verify on Etherscan.
        false,
        mockPrompt
      )

      expect(preview).to.deep.equal({
        networks: [
          {
            networkTags: ['goerli (local)'],
            executing: [],
            skipping: [],
          },
        ],
        unlabeledAddresses: new Set([]),
      })

      // Check that the deployment artifact wasn't created
      expect(existsSync(deploymentArtifactFilePath)).to.be.false
    })
  })
})

describe('Deployment Cases', () => {
  const fallbackArtifactPath = './out/artifacts/Fallback.sol/Fallback.json'
  const conflictingNameArtifactPath =
    './out/artifacts/First.sol/ConflictingNameContract.json'
  const constructorDeploysContractParentArtifactPath =
    './out/artifacts/ConstructorDeploysContract.sol/ConstructorDeploysContract.json'
  const constructorDeploysContractChildArtifactPath =
    './out/artifacts/ConstructorDeploysContract.sol/DeployedInConstructor.json'
  const fallbackCreate2Address = '0x48cbBcEF47A8841BE8F9b282Cf80d7Cb82F2F709'
  const fallbackCreate3Address = '0x1AA1cC4266F66FdDa4997D573f07C242Af963482'
  const constructorDeploysContractAddress =
    '0x3947A925F91Cc610Bc3d2060563533e04d438999'
  const constructorDeploysContractChildAddress =
    '0xB6b10ce27b6A2eCa12e1613A7AfF69B6b2C42cBc'
  const constructorDeploysContractAddressCreate3 =
    '0xF7376b1b7F8E8120D0ada3bC1d1c5582aB473A2d'
  const constructorDeploysContractChildAddressCreate3 =
    '0x47a229D6C5fB7453D4283f0A696BD042F10f059C'
  const unlabeledConstructorDeploysContractAddress =
    '0x1Ac8802E7E062904194E37dFf3364cF6cC56Ca91'
  const unlabeledConstructorDeploysContractChildAddress =
    '0x78eA270A2e6F7B22c643A95F214280EB97E2F33c'
  const unlabeledConstructorDeploysContractCreate3Address =
    '0xecdA68B43B706458F8aA84C9e6014271A0eA8258'
  const unlabeledConstructorDeploysContractChildCreate3Address =
    '0x7E2f0099833bdFB61BbC67CaF29ccAfCe76c27B1'
  const conflictingNameContractAddress =
    '0x070bea1DD13d0c057CcB88A2E4ecc9d072958927'
  const unlabeledConflictingNameContract =
    '0x0147E1D0133A6C7b170780f49D225DA7509145C7'
  const conflictingNameContractWithInteractionAddress =
    '0x52F92f36B6175E44daF5c60Be28167A3165Cb97d'

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
    await startGoerli()
    ;({ parsedConfig, preview } = await deploy(
      deploymentCasesScriptPath,
      'goerli',
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
    killGoerli()
  })

  it('Can call fallback function on contract', async () => {
    expect(await provider.getCode(fallbackCreate2Address)).to.not.eq('0x')

    const contract = getContract(fallbackCreate2Address, fallbackArtifactPath)

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
          constructorDeploysContractParentArtifactPath
        )
        expect(await parentContract.myContract()).to.equal(
          constructorDeploysContractChildAddress
        )

        const childContract = getContract(
          constructorDeploysContractChildAddress,
          constructorDeploysContractChildArtifactPath
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
          './deployments/goerli-local/ConstructorDeploysContract.json'
        expect(existsSync(join(parentDeploymentArtifactPath))).to.be.true
        const parentArtifact = JSON.parse(
          readFileSync(parentDeploymentArtifactPath).toString()
        )
        expect(parentArtifact.address === constructorDeploysContractAddress)

        const childDeploymentArtifactPath =
          './deployments/goerli-local/DeployedInConstructor.json'
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
          constructorDeploysContractParentArtifactPath
        )
        expect(await parentContract.myContract()).to.equal(
          constructorDeploysContractChildAddressCreate3
        )

        // expect can interact with child
        const childContract = getContract(
          constructorDeploysContractChildAddressCreate3,
          constructorDeploysContractChildArtifactPath
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
          './deployments/goerli-local/ConstructorDeploysContract_1.json'
        expect(existsSync(join(parentDeploymentArtifactPath))).to.be.true
        const parentArtifact = JSON.parse(
          readFileSync(parentDeploymentArtifactPath).toString()
        )
        expect(
          parentArtifact.address === constructorDeploysContractAddressCreate3
        )

        const childDeploymentArtifactPath =
          './deployments/goerli-local/DeployedInConstructor_1.json'
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
          constructorDeploysContractParentArtifactPath
        )
        expect(await parentContract.myContract()).to.equal(
          unlabeledConstructorDeploysContractChildAddress
        )

        // expect can interact with child
        const childContract = getContract(
          unlabeledConstructorDeploysContractChildAddress,
          constructorDeploysContractChildArtifactPath
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
          './deployments/goerli-local/ConstructorDeploysContract_2.json'
        expect(existsSync(join(parentDeploymentArtifactPath))).to.be.true
        const parentArtifact = JSON.parse(
          readFileSync(parentDeploymentArtifactPath).toString()
        )
        expect(
          parentArtifact.address === unlabeledConstructorDeploysContractAddress
        )

        // expect there is not a deployment artifact for the child
        const childDeploymentArtifactPath =
          './deployments/goerli-local/DeployedInConstructor_2.json'
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
          constructorDeploysContractParentArtifactPath
        )
        expect(await parentContract.myContract()).to.equal(
          unlabeledConstructorDeploysContractChildCreate3Address
        )

        // expect can interact with child
        const childContract = getContract(
          unlabeledConstructorDeploysContractChildCreate3Address,
          constructorDeploysContractChildArtifactPath
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
            join('./deployments/goerli-local/ConstructorDeploysContract_3.json')
          )
        ).to.be.true
        expect(
          !existsSync(
            join('./deployments/goerli-local/DeployedInConstructor_2.json')
          )
        ).to.be.true
        expect(
          !existsSync(
            join('./deployments/goerli-local/DeployedInConstructor_3.json')
          )
        ).to.be.true
      })
    })

    describe('Can deploy ambigously named contract', async () => {
      it('With label', async () => {
        // expect contract to be deployed
        expect(
          await provider.getCode(conflictingNameContractAddress)
        ).to.not.eq('0x')

        // check can interact with the contract
        const contract = getContract(
          conflictingNameContractAddress,
          conflictingNameArtifactPath
        )
        expect(await contract.number()).to.eq(1n)

        // expect contract is labeled
        checkLabeled(
          conflictingNameContractAddress,
          'contracts/test/conflictingNameContracts/First.sol:ConflictingNameContract'
        )

        // expect deployment artifact to be written
        const parentDeploymentArtifactPath =
          './deployments/goerli-local/ConflictingNameContract.json'
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
          conflictingNameArtifactPath
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
        const contract = getContract(
          conflictingNameContractWithInteractionAddress,
          conflictingNameArtifactPath
        )
        expect(await contract.number()).to.eq(5n)

        // expect contract is labeled
        checkLabeled(
          conflictingNameContractWithInteractionAddress,
          'contracts/test/conflictingNameContracts/First.sol:ConflictingNameContract'
        )

        // expect deployment artifact to be written
        const parentDeploymentArtifactPath =
          './deployments/goerli-local/ConflictingNameContract_1.json'
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

const getContract = (
  address: string,
  artifactPath: string
): ethers.Contract => {
  const abi =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(artifactPath)).abi

  const contract = new ethers.Contract(address, abi, provider)
  return contract
}
