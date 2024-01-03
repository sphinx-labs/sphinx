import { argv } from 'process'

import { ethers } from 'ethers'

import {
  DeploymentData,
  makeSphinxLeaves,
  makeSphinxMerkleTreeFromLeaves,
} from '../src/merkle-tree'
import { abi as testUtilsABI } from '../out/TestUtils.t.sol/TestUtils.json'
import { recursivelyConvertResult } from '../src/utils'

const abiEncodedNetworkInputs = argv[2]
const executor = argv[3]
const safeProxy = argv[4]
const moduleProxy = argv[5]
const uri = argv[6]
const forceCancellationLeafIndexNonZero = argv[7] === 'true'

type NetworkCancellationMerkleTreeInputs = {
  chainId: bigint
  merkleRootToCancel: string
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
        fragment.name === 'networkCancellationMerkleTreeInputsArrayType'
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
  ) as [Array<NetworkCancellationMerkleTreeInputs>]

  const deploymentData: DeploymentData = {}
  for (const {
    chainId,
    merkleRootToCancel,
    moduleProxyNonce,
  } of networkArray) {
    deploymentData[chainId.toString()] = {
      type: 'cancellation',
      nonce: moduleProxyNonce.toString(),
      executor,
      safeProxy,
      moduleProxy,
      uri,
      merkleRootToCancel,
    }
  }

  const leaves = makeSphinxLeaves(deploymentData)

  if (forceCancellationLeafIndexNonZero) {
    leaves[0].index = BigInt(1)
  }

  const { root, leavesWithProofs } = makeSphinxMerkleTreeFromLeaves(leaves)

  const abiEncodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    [root, leavesWithProofs],
  ])

  process.stdout.write(abiEncodedMerkleTree)
})()
