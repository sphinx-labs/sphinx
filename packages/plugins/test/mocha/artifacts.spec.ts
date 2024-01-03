import { rm } from 'fs/promises'

import {
  DeploymentArtifacts,
  ExecutionMode,
  RawActionInput,
  SUPPORTED_NETWORKS,
  SupportedNetworkName,
  getConfigArtifactsRemote,
  writeDeploymentArtifacts,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

import {
  checkArtifacts,
  killAnvilNodes,
  makeDeployment,
  makeRevertingDeployment,
  makeStandardDeployment,
  runDeployment,
  startAnvilNodes,
} from './common'

const allNetworkNames = ['sepolia', 'optimism_sepolia']
const allChainIds = allNetworkNames.map(
  (network) => SUPPORTED_NETWORKS[network]
)

const projectName = 'My_Project'
const owners = [
  new ethers.Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  ),
]
const threshold = 1
const networkNames: Array<SupportedNetworkName> = [
  'sepolia',
  'optimism_sepolia',
]

// This test suite tests the deployment artifact logic. We deploy a contract with and without
// constructor args to test that the contract deployment artifact logic properly decodes constructor
// args. We deploy three instances of the same contract to test that the contract deployment
// artifact creates file name suffixes properly (e.g. `MyContract_1.json`). We create the
// deployments in TypeScript instead of collecting the transactions from a Forge script because this
// is significantly faster.
describe('Artifacts', () => {
  beforeEach(async () => {
    // Make sure that the Anvil nodes aren't running.
    await killAnvilNodes(allChainIds)
    // Start the Anvil nodes.
    await startAnvilNodes(allChainIds)

    await rm(`deployments`, { recursive: true, force: true })
  })

  afterEach(async () => {
    await killAnvilNodes(allChainIds)
  })

  it('makes artifacts for the first deployment on local networks', async () => {
    await makeThenRunThenCheckDeployment(
      makeStandardDeployment(0, ExecutionMode.LocalNetworkCLI),
      {}
    )
  })

  it('makes artifacts for the first deployment on live networks', async () => {
    await makeThenRunThenCheckDeployment(
      makeStandardDeployment(0, ExecutionMode.Platform),
      {}
    )
  })

  // We intentionally use the same `contractName` across deployments so that the history array is
  // populated.
  it('makes artifacts for the second deployment on live networks', async () => {
    const firstArtifacts = await makeThenRunThenCheckDeployment(
      makeStandardDeployment(0, ExecutionMode.Platform),
      {}
    )
    await makeThenRunThenCheckDeployment(
      makeStandardDeployment(1, ExecutionMode.Platform),
      firstArtifacts.networks
    )
  })

  // The main purpose of this test is to check that the `history` array contains elements in the
  // correct order. We must execute three deployments to test this because the `history` array would
  // only have a single element if we execute just two deployments.
  it('makes artifacts for the third deployment on live networks', async () => {
    const firstArtifacts = await makeThenRunThenCheckDeployment(
      makeStandardDeployment(0, ExecutionMode.Platform),
      {}
    )
    const secondArtifacts = await makeThenRunThenCheckDeployment(
      makeStandardDeployment(1, ExecutionMode.Platform),
      firstArtifacts.networks
    )
    await makeThenRunThenCheckDeployment(
      makeStandardDeployment(2, ExecutionMode.Platform),
      secondArtifacts.networks
    )
  })

  it('makes artifacts for partially executed deployment', async () => {
    await makeThenRunThenCheckDeployment(
      makeRevertingDeployment(0, ExecutionMode.Platform),
      {}
    )
  })

  it('makes artifacts for remotely compiled deployment', async () => {
    await makeThenRunThenCheckRemoteDeployment(
      makeStandardDeployment(0, ExecutionMode.Platform),
      {}
    )
  })
})

const makeThenRunThenCheckDeployment = async (
  deployment: {
    merkleRootNonce: number
    executionMode: ExecutionMode
    actionInputs: Array<RawActionInput>
    expectedNumExecutionArtifacts: number
    expectedContractFileNames: Array<string>
  },
  previousArtifacts: DeploymentArtifacts['networks']
): Promise<DeploymentArtifacts> => {
  const {
    merkleRootNonce,
    actionInputs,
    expectedNumExecutionArtifacts,
    expectedContractFileNames,
    executionMode,
  } = deployment

  const { configArtifacts, compilerConfigArray, merkleTree } =
    await makeDeployment(
      merkleRootNonce,
      [],
      networkNames,
      true,
      projectName,
      owners,
      threshold,
      executionMode,
      actionInputs
    )

  const artifacts = await runDeployment(
    compilerConfigArray,
    merkleTree,
    configArtifacts,
    previousArtifacts
  )

  writeDeploymentArtifacts(projectName, executionMode, artifacts)

  checkArtifacts(
    projectName,
    compilerConfigArray,
    artifacts,
    executionMode,
    expectedNumExecutionArtifacts,
    expectedContractFileNames
  )

  return artifacts
}

const makeThenRunThenCheckRemoteDeployment = async (
  deployment: {
    merkleRootNonce: number
    executionMode: ExecutionMode
    actionInputs: Array<RawActionInput>
    expectedNumExecutionArtifacts: number
    expectedContractFileNames: Array<string>
  },
  previousArtifacts: DeploymentArtifacts['networks']
): Promise<DeploymentArtifacts> => {
  const {
    merkleRootNonce,
    actionInputs,
    expectedNumExecutionArtifacts,
    expectedContractFileNames,
    executionMode,
  } = deployment

  const { compilerConfigArray, merkleTree } = await makeDeployment(
    merkleRootNonce,
    [],
    networkNames,
    true,
    projectName,
    owners,
    threshold,
    executionMode,
    actionInputs
  )

  const configArtifacts = await getConfigArtifactsRemote(compilerConfigArray)

  const artifacts = await runDeployment(
    compilerConfigArray,
    merkleTree,
    configArtifacts,
    previousArtifacts
  )

  writeDeploymentArtifacts(projectName, executionMode, artifacts)

  checkArtifacts(
    projectName,
    compilerConfigArray,
    artifacts,
    executionMode,
    expectedNumExecutionArtifacts,
    expectedContractFileNames
  )

  return artifacts
}
