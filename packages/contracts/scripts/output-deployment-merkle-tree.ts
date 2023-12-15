import { argv } from 'process'

import { ethers } from 'ethers'

import {
  DeploymentData,
  SphinxTransaction,
  makeSphinxLeaves,
  makeSphinxMerkleTreeFromLeaves,
} from '../src/merkle-tree'
import { recursivelyConvertResult } from '../src/utils'
import { abi as testUtilsABI } from '../out/TestUtils.t.sol/TestUtils.json'

const abiEncodedNetworkInputs = argv[2]
const executor = argv[3]
const safeProxy = argv[4]
const moduleProxy = argv[5]
const uri = argv[6]
const arbitraryChain = argv[7] === 'true'
const forceNumLeavesValue = argv[8] === 'true'
const overridingNumLeavesValue = argv[9]
const forceApprovalLeafIndexNonZero = argv[10] === 'true'
const forceExecutionLeavesChainIdNonZero = argv[11] === 'true'
const forceApprovalLeafChainIdNonZero = argv[12] === 'true'

type NetworkDeploymentMerkleTreeInputs = {
  chainId: bigint
  txs: Array<SphinxTransaction>
  moduleProxyNonce: bigint
}
;(async () => {
  const coder = ethers.AbiCoder.defaultAbiCoder()

  const iface = new ethers.Interface(testUtilsABI)
  const merkleTreeFragment = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxMerkleTreeType')
  const networkInputArrayType = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find(
      (fragment) =>
        fragment.name === 'networkDeploymentMerkleTreeInputsArrayType'
    )
  if (!merkleTreeFragment || !networkInputArrayType) {
    throw new Error('Missing type in ABI. Should never happen.')
  }

  const networkArrayResult = coder.decode(
    networkInputArrayType.outputs,
    abiEncodedNetworkInputs
  )
  const [networkArray] = recursivelyConvertResult(
    networkInputArrayType.outputs,
    networkArrayResult
  ) as [Array<NetworkDeploymentMerkleTreeInputs>]

  const deploymentData: DeploymentData = {}
  for (const { chainId, moduleProxyNonce, txs } of networkArray) {
    deploymentData[chainId.toString()] = {
      type: 'deployment',
      nonce: moduleProxyNonce.toString(),
      executor,
      safeProxy,
      moduleProxy,
      uri,
      txs: txs.map((tx) => {
        return {
          to: tx.to,
          value: tx.value.toString(),
          txData: tx.txData,
          gas: tx.gas.toString(),
          operation: Number(tx.operation),
          requireSuccess: tx.requireSuccess,
        }
      }),
      arbitraryChain,
    }
  }

  const leaves = makeSphinxLeaves(deploymentData)

  if (forceNumLeavesValue) {
    if (networkArray.length !== 1) {
      throw new Error(
        'There must only be a single network if `forceNumLeavesValue` is `true`.'
      )
    }
    leaves[0].data = coder.encode(
      ['address', 'address', 'uint', 'uint', 'address', 'string', 'bool'],
      [
        safeProxy,
        moduleProxy,
        networkArray[0].moduleProxyNonce,
        overridingNumLeavesValue, // Override the `numLeaves`
        executor,
        uri,
        arbitraryChain,
      ]
    )
  }
  if (forceApprovalLeafIndexNonZero) {
    leaves[0].index = BigInt(1)
  }
  if (forceApprovalLeafChainIdNonZero) {
    leaves[0].chainId = BigInt(31337)
  }
  if (forceExecutionLeavesChainIdNonZero) {
    for (let i = 1; i < leaves.length; i++) {
      leaves[i].chainId = BigInt(31337)
    }
  }

  const { root, leavesWithProofs } = makeSphinxMerkleTreeFromLeaves(leaves)

  const abiEncodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    [root, leavesWithProofs],
  ])

  process.stdout.write(abiEncodedMerkleTree)
})()
