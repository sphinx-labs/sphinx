import { exec } from 'child_process'
import { resolve } from 'path'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  SphinxConfig,
  SphinxJsonRpcProvider,
  execAsync,
  spawnAsync,
  getMerkleTreeInfo,
  getReadableActions,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

import { deploy } from '../../../src/cli/deploy'
import { buildParsedConfigArray } from '../../../src/cli/propose'
import {
  FoundryToml,
  getFoundryConfigOptions,
} from '../../../src/foundry/options'
import {
  getSphinxModuleAddressFromScript,
  getSphinxSafeAddressFromScript,
} from '../../../src/foundry/utils'

chai.use(chaiAsPromised)
const expect = chai.expect

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

const scriptPath = 'test/foundry/Proposal.t.sol'
const isTestnet = true

const sphinxConfig: SphinxConfig = {
  projectName: 'Multisig project',
  // Accounts #0-3 on Anvil
  owners: [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  ],
  threshold: '3',
  mainnets: [],
  testnets: ['goerli', 'optimism_goerli'],
  orgId: '1111',
}

describe('Simulate proposal', () => {
  let foundryToml: FoundryToml
  let moduleAddress: string
  let safeAddress: string
  before(async () => {
    await execAsync('yarn test:kill')

    exec('anvil --silent --chain-id 5 --port 42005 &')
    exec('anvil --silent --chain-id 420 --port 42420 &')
    exec('anvil --silent --chain-id 10200 --port 42200 &')
    exec('anvil --silent --chain-id 421613 --port 42613 &')

    safeAddress = await getSphinxSafeAddressFromScript(
      scriptPath,
      'http://localhost:42005',
      'Proposal_Initial_Test'
    )
    moduleAddress = await getSphinxModuleAddressFromScript(
      scriptPath,
      'http://localhost:42005',
      'Proposal_Initial_Test'
    )
    foundryToml = await getFoundryConfigOptions()
  })

  after(async () => {
    await execAsync(`yarn test:kill`)
  })

  it('Simulates proposal for a project that has not been deployed on any network yet', async () => {
    for (const network of sphinxConfig.testnets) {
      const rpcUrl = foundryToml.rpcEndpoints[network.toString()]
      // Narrow the type of `rpcUrl` to string
      if (!rpcUrl) {
        throw new Error(`Could not find RPC. Should never happen.`)
      }
      const provider = new SphinxJsonRpcProvider(rpcUrl)

      expect(await provider.getCode(moduleAddress)).equals('0x')
      expect(await provider.getCode(safeAddress)).equals('0x')
    }

    await testProposalSimulation('Proposal_Initial_Test', foundryToml)
  })

  describe('After deployment is completed on initial networks', async () => {
    before(async () => {
      for (const network of sphinxConfig.testnets) {
        await deploy(
          scriptPath,
          network.toString(),
          true, // Skip preview
          true, // Silent
          'Proposal_Initial_Test',
          false, // Don't verify on Etherscan
          undefined,
          mockPrompt
        )
      }
    })

    it('Simulates proposal for a project that was previously deployed', async () => {
      for (const network of sphinxConfig.testnets) {
        const rpcUrl = foundryToml.rpcEndpoints[network.toString()]
        // Narrow the type of `rpcUrl` to string
        if (!rpcUrl) {
          throw new Error(`Could not find RPC. Should never happen.`)
        }
        const provider = new SphinxJsonRpcProvider(rpcUrl)

        expect(await provider.getCode(moduleAddress)).does.not.equal('0x')
        expect(await provider.getCode(safeAddress)).does.not.equal('0x')
      }

      await testProposalSimulation('Proposal_AddContract_Test', foundryToml)
    })

    // it('Tests a proposal for a project with a previously failed deployment', async () => {
    //   for (const network of sphinxConfig.testnets) {
    //     const rpcUrl = foundryToml.rpcEndpoints[network.toString()]
    //     // Narrow the type of `rpcUrl` to string
    //     if (!rpcUrl) {
    //       throw new Error(`Could not find RPC. Should never happen.`)
    //     }

    //     // Run the test that that cancels a previous deployment. First, we set the storage value of the
    //     // `activeDeploymentId` in the SphinxManager to be non-zero. This replicates what happens when a
    //     // previous deployment is 'stuck' and needs to be canceled.
    //     await execAsync(
    //       `cast rpc --rpc-url ${rpcUrl} anvil_setStorageAt ${managerAddress} 0x0000000000000000000000000000000000000000000000000000000000000099 0x1111111111111111111111111111111111111111111111111111111111111111`
    //     )
    //     // Bump the block number. Necessary to make the previous RPC methods take effect.
    //     await execAsync(`cast rpc --rpc-url ${rpcUrl} anvil_mine`)

    //     const provider = new SphinxJsonRpcProvider(rpcUrl)
    //     const manager = getSphinxManagerReadOnly(managerAddress, provider)
    //     const auth = new ethers.Contract(authAddress, AuthABI, provider)
    //     expect(await manager.isExecuting()).equals(true)
    //     expect(await auth.firstProposalOccurred()).equals(true)
    //   }

    //   await testProposalSimulation(
    //     'Proposal_CancelExistingDeployment_Test',
    //     foundryToml
    //   )
    // })
  })
})

const testProposalSimulation = async (
  testContractName: string,
  foundryToml: FoundryToml,
  envVars?: NodeJS.ProcessEnv
) => {
  const { parsedConfigArray, configArtifacts } = await buildParsedConfigArray(
    scriptPath,
    isTestnet,
    testContractName,
    undefined // No spinner.
  )

  const { root, merkleTreeInfo, configUri } = await getMerkleTreeInfo(
    configArtifacts,
    parsedConfigArray
  )

  const humanReadableActions: Array<
    {
      reason: string
      actionIndex: string
    }[]
  > = []
  for (const config of parsedConfigArray) {
    humanReadableActions.push(getReadableActions(config.actionInputs))
  }

  const sphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${foundryToml.artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi
  const iface = new ethers.Interface(sphinxPluginTypesABI)
  const bundleInfoFragment = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxMerkleTreeType')
  if (!bundleInfoFragment) {
    throw new Error(
      `'sphinxMerkleTreeType' not found in ABI. Should never happen.`
    )
  }

  const humanReadableActionsNestedFragment = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'humanReadableActionsNestedType')
  if (!humanReadableActionsNestedFragment) {
    throw new Error(
      `'humanReadableActionsNestedType' not found in ABI. Should never happen.`
    )
  }

  const coder = ethers.AbiCoder.defaultAbiCoder()
  const encodedBundleInfo = coder.encode(bundleInfoFragment.outputs, [
    merkleTreeInfo.merkleTree,
  ])
  const encodedHumanReadableActionsNested = coder.encode(
    humanReadableActionsNestedFragment.outputs,
    [humanReadableActions]
  )

  const { code, stdout, stderr } = await spawnAsync(
    `forge`,
    ['test', '--match-contract', testContractName, '-vvvvv'],
    {
      ROOT: root,
      MERKLE_TREE: encodedBundleInfo,
      CONFIG_URI: configUri,
      HUMAN_READABLE_ACTIONS: encodedHumanReadableActionsNested,
      ...envVars,
    }
  )
  expect(code).equals(0, `${stderr}\n${stdout}`)
}
