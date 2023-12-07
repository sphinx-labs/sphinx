import { exec } from 'child_process'
import { join, resolve } from 'path'
import { writeFileSync } from 'fs'

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
import { FoundryToml, getFoundryToml } from '../../../src/foundry/options'
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
  saltNonce: '0',
  mainnets: [],
  testnets: ['sepolia', 'optimism_sepolia'],
  orgId: '1111',
}

describe('Simulate proposal', () => {
  let foundryToml: FoundryToml
  let moduleAddress: string
  let safeAddress: string
  before(async () => {
    await execAsync('yarn kill-nodes')

    exec('anvil --silent --chain-id 11155111 --port 42111 &')
    exec('anvil --silent --chain-id 11155420 --port 42420 &')
    exec('anvil --silent --chain-id 10200 --port 42200 &')
    exec('anvil --silent --chain-id 421614 --port 42614 &')

    safeAddress = await getSphinxSafeAddressFromScript(
      scriptPath,
      'http://localhost:42111',
      'Proposal_Initial_Test'
    )
    moduleAddress = await getSphinxModuleAddressFromScript(
      scriptPath,
      'http://localhost:42111',
      'Proposal_Initial_Test'
    )
    foundryToml = await getFoundryToml()
  })

  after(async () => {
    await execAsync(`yarn kill-nodes`)
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
  })
})

const testProposalSimulation = async (
  testContractName: string,
  foundryToml: FoundryToml,
  envVars?: NodeJS.ProcessEnv
) => {
  const sphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${foundryToml.artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi
  const sphinxPluginTypesInterface = new ethers.Interface(sphinxPluginTypesABI)

  const merkleTreeFilePath = join(
    foundryToml.cachePath,
    'sphinx-merkle-tree.txt'
  )

  const { parsedConfigArray, configArtifacts } = await buildParsedConfigArray(
    scriptPath,
    isTestnet,
    sphinxPluginTypesInterface,
    merkleTreeFilePath,
    testContractName,
    undefined // No spinner.
  )

  const { root, merkleTreeInfo, configUri } = await getMerkleTreeInfo(
    configArtifacts,
    parsedConfigArray
  )

  const humanReadableActions = parsedConfigArray.map((e) =>
    getReadableActions(e.actionInputs)
  )

  const merkleTreeFragment = sphinxPluginTypesInterface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxMerkleTreeType')
  if (!merkleTreeFragment) {
    throw new Error(
      `'sphinxMerkleTreeType' not found in ABI. Should never happen.`
    )
  }

  const humanReadableActionsNestedFragment =
    sphinxPluginTypesInterface.fragments
      .filter(ethers.Fragment.isFunction)
      .find((fragment) => fragment.name === 'humanReadableActionsNestedType')
  if (!humanReadableActionsNestedFragment) {
    throw new Error(
      `'humanReadableActionsNestedType' not found in ABI. Should never happen.`
    )
  }

  const coder = ethers.AbiCoder.defaultAbiCoder()
  const encodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    merkleTreeInfo.merkleTree,
  ])
  const encodedHumanReadableActionsNested = coder.encode(
    humanReadableActionsNestedFragment.outputs,
    [humanReadableActions]
  )

  writeFileSync(merkleTreeFilePath, encodedMerkleTree)

  const { code, stdout, stderr } = await spawnAsync(
    `forge`,
    ['test', '--match-contract', testContractName, '-vvvvv'],
    {
      ROOT: root,
      MERKLE_TREE_FILE_PATH: merkleTreeFilePath,
      CONFIG_URI: configUri,
      HUMAN_READABLE_ACTIONS: encodedHumanReadableActionsNested,
      ...envVars,
    }
  )
  expect(code).equals(0, `${stderr}\n${stdout}`)
}
