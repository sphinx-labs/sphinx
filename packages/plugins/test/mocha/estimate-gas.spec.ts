import { ethers } from 'ethers'
import {
  ExecutionMode,
  SphinxJsonRpcProvider,
  deploySphinxSystem,
  getApproveLeafWithProof,
  getPackedOwnerSignatures,
  getSphinxWalletsSortedByAddress,
  makeDeploymentData,
} from '@sphinx-labs/core'
import { expect } from 'chai'
import {
  GnosisSafeProxyFactoryArtifact,
  getGnosisSafeProxyFactoryAddress,
  getGnosisSafeSingletonAddress,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'

import {
  getGnosisSafeInitializerData,
  getGnosisSafeProxyAddress,
  getSphinxModuleAddress,
  killAnvilNodes,
  startAnvilNodes,
} from './common'
import { getDummyNetworkConfig } from './dummy'
import * as ApprovalGasEstimatorArtifact from '../../out/artifacts/ApprovalGasEstimator.sol/ApprovalGasEstimator.json'
import { estimateModuleApproveGas } from '../../src/foundry/utils'

describe('Estimate Gas', () => {
  describe('estimateModuleApproveGas', () => {
    const anvilChainId = BigInt(31337)

    const expectCorrectEstimatedApprovalGas = async (
      threshold: number
    ): Promise<void> => {
      const saltNonce = 0
      const estimatorFactory = new ethers.ContractFactory(
        ApprovalGasEstimatorArtifact.abi,
        ApprovalGasEstimatorArtifact.bytecode,
        wallet
      )

      const wallets = getSphinxWalletsSortedByAddress(threshold, provider)
      const ownerAddresses = wallets.map((w) => w.address)

      const safeInitData = getGnosisSafeInitializerData(
        ownerAddresses,
        threshold
      )
      const gnosisSafeProxyFactory = new ethers.Contract(
        getGnosisSafeProxyFactoryAddress(),
        GnosisSafeProxyFactoryArtifact.abi,
        wallet
      )
      await (
        await gnosisSafeProxyFactory.createProxyWithNonce(
          getGnosisSafeSingletonAddress(),
          safeInitData,
          saltNonce
        )
      ).wait()

      const estimator = (await estimatorFactory.deploy()) as ethers.Contract
      await estimator.waitForDeployment()

      const safeAddress = getGnosisSafeProxyAddress(
        ownerAddresses,
        threshold,
        saltNonce
      )
      const moduleAddress = getSphinxModuleAddress(
        ownerAddresses,
        threshold,
        saltNonce
      )
      const networkConfig = getDummyNetworkConfig()
      networkConfig.safeInitData = safeInitData
      networkConfig.newConfig.owners = ownerAddresses
      networkConfig.newConfig.threshold = threshold.toString()
      networkConfig.moduleAddress = moduleAddress
      networkConfig.safeAddress = safeAddress
      networkConfig.chainId = anvilChainId.toString()
      networkConfig.executorAddress = estimator.target.toString()
      const deploymentData = makeDeploymentData([networkConfig])
      const merkleTree = makeSphinxMerkleTree(deploymentData)
      const approveLeaf = getApproveLeafWithProof(merkleTree, anvilChainId)

      const packedSignatures = await getPackedOwnerSignatures(
        merkleTree.root,
        wallets
      )

      await (
        await estimator.estimateApprovalGas(
          moduleAddress,
          merkleTree.root,
          approveLeaf,
          packedSignatures
        )
      ).wait()

      const expectedEstimatedGas: bigint =
        await estimator.estimatedApprovalGas()

      const actualEstimatedGas = estimateModuleApproveGas(threshold.toString())
      expect(expectedEstimatedGas).equals(BigInt(actualEstimatedGas))
    }

    let provider: SphinxJsonRpcProvider
    let wallet: ethers.Wallet
    before(async () => {
      // Make sure that the Anvil node isn't running.
      await killAnvilNodes([anvilChainId])
      // Start the Anvil node.
      await startAnvilNodes([anvilChainId])

      provider = new SphinxJsonRpcProvider(`http://127.0.0.1:8545`)
      wallet = new ethers.Wallet(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        provider
      )

      await deploySphinxSystem(
        provider,
        wallet,
        [],
        ExecutionMode.LocalNetworkCLI,
        false
      )
    })

    after(async () => {
      await killAnvilNodes([anvilChainId])
    })

    it(`estimates gas of the SphinxModule's 'approve' function with one owner`, async () => {
      const threshold = 1
      await expectCorrectEstimatedApprovalGas(threshold)
    })

    it(`estimates gas of the SphinxModule's 'approve' function with ten owners`, async () => {
      const threshold = 10
      await expectCorrectEstimatedApprovalGas(threshold)
    })
  })
})
