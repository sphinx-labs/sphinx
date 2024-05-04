import { rm } from 'fs/promises'

import {
  DeploymentArtifacts,
  ExecutionMode,
  fetchChainIdForNetwork,
  writeDeploymentArtifacts,
  makeContractDeploymentArtifacts,
  SphinxJsonRpcProvider,
  isContractDeploymentArtifact,
  makeDeploymentArtifacts,
  isExecutionArtifact,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  ParsedAccountAccess,
  getGnosisSafeProxyAddress,
  remove0x,
} from '@sphinx-labs/contracts'
import sinon from 'sinon'
import { expect } from 'chai'

import * as MyContract2Artifact from '../../out/artifacts/MyContracts.sol/MyContract2.json'
import {
  checkArtifacts,
  getAnvilRpcUrl,
  getEmptyDeploymentArtifacts,
  killAnvilNodes,
  makeDeployment,
  makeRevertingDeployment,
  makeStandardDeployment,
  runDeployment,
  startAnvilNodes,
} from './common'
import {
  dummyChainId,
  dummyCompilerInputArtifactFileName,
  dummyBuildInfoId,
  dummyContractArtifactFileName,
  dummyContractName,
  dummyExecutionArtifactFileName,
  dummyMerkleRoot,
  getDummyBuildInfos,
  getDummyContractDeploymentArtifact,
  getDummyDeploymentArtifacts,
  getDummyEthersTransactionResponse,
  getDummyNetworkConfig,
} from './dummy'
import {
  getFakeActionInputWithContract,
  getFakeActionSucceededReceipt,
  getFakeConfigArtifacts,
  getFakeDeploymentConfig,
} from './fake'
import { FoundryToml } from '../../src/foundry/types'
import { getFoundryToml } from '../../src/foundry/options'

const allNetworkNames = ['sepolia', 'optimism_sepolia']
const allChainIds = allNetworkNames.map((network) =>
  fetchChainIdForNetwork(network)
)

const projectName = 'My_Project'
const owners = [
  new ethers.Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  ),
]
const threshold = 1
const networkNames = ['sepolia', 'optimism_sepolia']
const safeAddress = getGnosisSafeProxyAddress(
  owners.map((o) => o.address),
  threshold,
  0
)

// This test suite tests the deployment artifact logic. We deploy a contract with and without
// constructor args to test that the contract deployment artifact logic properly decodes constructor
// args. We deploy three instances of the same contract to test that the contract deployment
// artifact creates file name suffixes properly (e.g. `MyContract_1.json`). We create the
// deployments in TypeScript instead of collecting the transactions from a Forge script because this
// is significantly faster.
describe('Artifacts', () => {
  const mockProvider = new SphinxJsonRpcProvider(``)

  let foundryToml: FoundryToml
  let getCodeStub: sinon.SinonStub
  let getTransactionStub: sinon.SinonStub
  beforeEach(async () => {
    getCodeStub = sinon.stub(mockProvider, 'getCode').resolves('0x11')
    getTransactionStub = sinon
      .stub(mockProvider, 'getTransaction')
      .resolves(getDummyEthersTransactionResponse())

    // Make sure that the Anvil nodes aren't running.
    await killAnvilNodes(allChainIds)
    // Start the Anvil nodes.
    await startAnvilNodes(allChainIds)

    await rm(`deployments`, { recursive: true, force: true })

    foundryToml = await getFoundryToml()
  })

  afterEach(async () => {
    await killAnvilNodes(allChainIds)

    getCodeStub.restore()
    getTransactionStub.restore()
  })

  it('makes artifacts for the first deployment on local networks', async () => {
    await makeThenRunThenCheckDeployment(
      makeStandardDeployment(0, ExecutionMode.LocalNetworkCLI, safeAddress),
      getEmptyDeploymentArtifacts()
    )
  })

  it('makes artifacts for the first deployment on live networks', async () => {
    await makeThenRunThenCheckDeployment(
      makeStandardDeployment(0, ExecutionMode.Platform, safeAddress),
      getEmptyDeploymentArtifacts()
    )
  })

  // We intentionally use the same `contractName` across deployments so that the history array is
  // populated.
  it('makes artifacts for the second deployment on live networks', async () => {
    const firstArtifacts = await makeThenRunThenCheckDeployment(
      makeStandardDeployment(0, ExecutionMode.Platform, safeAddress),
      getEmptyDeploymentArtifacts()
    )
    await makeThenRunThenCheckDeployment(
      makeStandardDeployment(1, ExecutionMode.Platform, safeAddress),
      firstArtifacts
    )
  })

  // The main purpose of this test is to check that the `history` array contains elements in the
  // correct order. We must execute three deployments to test this because the `history` array would
  // only have a single element if we execute just two deployments.
  it('makes artifacts for the third deployment on live networks', async () => {
    const firstArtifacts = await makeThenRunThenCheckDeployment(
      makeStandardDeployment(0, ExecutionMode.Platform, safeAddress),
      getEmptyDeploymentArtifacts()
    )
    const secondArtifacts = await makeThenRunThenCheckDeployment(
      makeStandardDeployment(1, ExecutionMode.Platform, safeAddress),
      firstArtifacts
    )
    await makeThenRunThenCheckDeployment(
      makeStandardDeployment(2, ExecutionMode.Platform, safeAddress),
      secondArtifacts
    )
  })

  it('makes artifacts for partially executed deployment', async () => {
    await makeThenRunThenCheckDeployment(
      makeRevertingDeployment(0, ExecutionMode.Platform, safeAddress),
      getEmptyDeploymentArtifacts()
    )
  })

  it('makes artifacts for remotely compiled deployment', async () => {
    await makeThenRunThenCheckRemoteDeployment(
      makeStandardDeployment(0, ExecutionMode.Platform, safeAddress),
      getEmptyDeploymentArtifacts()
    )
  })

  // Tests a scenario where deployment artifacts are created on a chain when existing deployment
  // artifacts already exist on a different chain. In this scenario, the deployment artifact
  // logic must return the previous deployment artifacts in addition to the new ones.
  it('keeps previous deployment artifacts', async () => {
    const newChainId = '123'
    const newCompilerInputId = 'newCompilerInputId'
    const newContractName = 'MyContract2'
    const newFullyQualifiedName = 'contracts/test/MyContracts.sol:MyContract2'
    const newMerkleRoot = '0x' + '42'.repeat(32)

    const deploymentConfig = await getFakeDeploymentConfig(
      newChainId,
      newFullyQualifiedName,
      MyContract2Artifact.bytecode.object,
      foundryToml.artifactFolder,
      newCompilerInputId,
      newMerkleRoot
    )
    const receipts = [getFakeActionSucceededReceipt(newMerkleRoot)]
    const artifacts = getDummyDeploymentArtifacts()
    const deployment = {
      [newChainId]: {
        deploymentConfig,
        receipts,
        provider: mockProvider,
      },
    }

    await makeDeploymentArtifacts(
      deployment,
      newMerkleRoot,
      deploymentConfig.configArtifacts,
      artifacts
    )

    const previousContractArtifact =
      artifacts.networks[dummyChainId].contractDeploymentArtifacts[
        `${dummyContractName}.json`
      ]
    const newContractArtifact =
      artifacts.networks[newChainId].contractDeploymentArtifacts[
        `${newContractName}.json`
      ]
    expect(isContractDeploymentArtifact(previousContractArtifact)).equals(true)
    expect(previousContractArtifact.chainId).equals(dummyChainId)
    expect(isContractDeploymentArtifact(newContractArtifact)).equals(true)
    expect(newContractArtifact.chainId).equals(newChainId)

    const previousExecutionArtifact =
      artifacts.networks[dummyChainId].executionArtifacts[
        dummyExecutionArtifactFileName
      ]
    const newExecutionArtifact =
      artifacts.networks[newChainId].executionArtifacts[
        `${remove0x(newMerkleRoot)}.json`
      ]
    expect(isExecutionArtifact(previousExecutionArtifact)).equals(true)
    expect(previousExecutionArtifact.merkleRoot).equals(dummyMerkleRoot)
    expect(isExecutionArtifact(newExecutionArtifact)).equals(true)
    expect(newExecutionArtifact.merkleRoot).equals(newMerkleRoot)

    const previousCompilerInput =
      artifacts.compilerInputs[dummyCompilerInputArtifactFileName]
    const newCompilerInput =
      artifacts.compilerInputs[`${newCompilerInputId}.json`]
    expect(previousCompilerInput.id).equals(dummyBuildInfoId)
    expect(newCompilerInput.id).equals(newCompilerInputId)
  })
})

describe('Contract Deployment Artifacts', () => {
  const mockProvider = new SphinxJsonRpcProvider(``)

  let foundryToml: FoundryToml
  let getCodeStub: sinon.SinonStub
  beforeEach(async () => {
    getCodeStub = sinon.stub(mockProvider, 'getCode').resolves('0x11')
    foundryToml = await getFoundryToml()
  })

  afterEach(async () => {
    getCodeStub.restore()
  })

  // Tests a scenario where a contract deployment artifact is created when a contract deployment
  // artifact already exists with a different contract name. In this scenario, we must return the
  // previous contract deployment artifact in addition to the new one.
  it('keeps previous contract deployment artifact', async () => {
    const contractName = 'MyContract2'
    const fullyQualifiedName = 'contracts/test/MyContracts.sol:MyContract2'
    const initCodeWithArgs = MyContract2Artifact.bytecode.object

    const configArtifacts = await getFakeConfigArtifacts(
      [fullyQualifiedName],
      foundryToml.artifactFolder
    )

    const networkConfig = getDummyNetworkConfig()
    networkConfig.actionInputs = [
      getFakeActionInputWithContract(fullyQualifiedName, initCodeWithArgs),
    ]

    const contractArtifacts = {
      [dummyContractArtifactFileName]: getDummyContractDeploymentArtifact(),
    }
    const receipts = [getFakeActionSucceededReceipt(dummyMerkleRoot)]

    await makeContractDeploymentArtifacts(
      dummyMerkleRoot,
      networkConfig,
      getDummyBuildInfos(),
      receipts,
      configArtifacts,
      contractArtifacts,
      mockProvider
    )

    const previousArtifact = contractArtifacts[dummyContractArtifactFileName]
    expect(isContractDeploymentArtifact(previousArtifact)).equals(true)
    expect(previousArtifact.contractName).equals(dummyContractName)

    const newArtifact = contractArtifacts[`${contractName}.json`]
    expect(isContractDeploymentArtifact(newArtifact)).equals(true)
    expect(newArtifact.contractName).equals(contractName)
  })
})

const makeThenRunThenCheckDeployment = async (
  deployment: {
    merkleRootNonce: number
    executionMode: ExecutionMode
    accountAccesses: Array<ParsedAccountAccess>
    expectedContractFileNames: Array<string>
  },
  artifacts: DeploymentArtifacts
): Promise<DeploymentArtifacts> => {
  const {
    merkleRootNonce,
    accountAccesses,
    expectedContractFileNames,
    executionMode,
  } = deployment

  const { deploymentConfig } = await makeDeployment(
    merkleRootNonce,
    networkNames,
    projectName,
    owners,
    threshold,
    executionMode,
    accountAccesses,
    getAnvilRpcUrl
  )

  const previousArtifacts = structuredClone(artifacts)

  await runDeployment(deploymentConfig, artifacts)

  writeDeploymentArtifacts(projectName, executionMode, artifacts)

  checkArtifacts(
    projectName,
    deploymentConfig,
    previousArtifacts,
    artifacts,
    executionMode,
    expectedContractFileNames
  )

  return artifacts
}

const makeThenRunThenCheckRemoteDeployment = async (
  deployment: {
    merkleRootNonce: number
    executionMode: ExecutionMode
    accountAccesses: Array<ParsedAccountAccess>
    expectedContractFileNames: Array<string>
  },
  artifacts: DeploymentArtifacts
): Promise<void> => {
  const {
    merkleRootNonce,
    accountAccesses,
    expectedContractFileNames,
    executionMode,
  } = deployment

  const { deploymentConfig } = await makeDeployment(
    merkleRootNonce,
    networkNames,
    projectName,
    owners,
    threshold,
    executionMode,
    accountAccesses,
    getAnvilRpcUrl
  )

  const previousArtifacts = structuredClone(artifacts)

  await runDeployment(deploymentConfig, artifacts)

  writeDeploymentArtifacts(projectName, executionMode, artifacts)

  checkArtifacts(
    projectName,
    deploymentConfig,
    previousArtifacts,
    artifacts,
    executionMode,
    expectedContractFileNames
  )
}
