import { argv } from 'process'

import { ethers } from 'ethers'

import {
  DeploymentData,
  makeSphinxLeaves,
  makeSphinxMerkleTreeFromLeaves,
} from '../src/merkle-tree'
import { abi as testUtilsABI } from '../out/TestUtils.t.sol/TestUtils.json'

const abiEncodedChainIds = argv[2]
const abiEncodedNonces = argv[3]
const executor = argv[4]
const safeProxy = argv[5]
const moduleProxy = argv[6]
const uri = argv[7]
const abiEncodedMerkleRootsToCancel = argv[8]
const forceCancellationLeafIndexNonZero = argv[9] === 'true'

;(async () => {
  const coder = ethers.AbiCoder.defaultAbiCoder()

  const iface = new ethers.Interface(testUtilsABI)
  const merkleTreeFragment = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxMerkleTreeType')
  const sphinxTransactionArrayType = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxTransactionArrayType')
  if (!merkleTreeFragment || !sphinxTransactionArrayType) {
    throw new Error('Missing type in ABI. Should never happen.')
  }

  const merkleRootArray = coder
    .decode(['bytes32[]'], abiEncodedMerkleRootsToCancel)
    .map((e) => e.toString()) as Array<string>

  const chainIdArray = coder
    .decode(['uint[]'], abiEncodedChainIds)
    .map((e) => e.toString()) as Array<string>

  const nonceArray = coder
    .decode(['uint[]'], abiEncodedNonces)
    .map((e) => e.toString()) as Array<string>

  const deploymentData: DeploymentData = {}
  let chainIndex = 0
  for (const chainId of chainIdArray) {
    deploymentData[chainId] = {
      type: 'cancellation',
      nonce: nonceArray[chainIndex],
      executor,
      safeProxy,
      moduleProxy,
      uri,
      merkleRootToCancel: merkleRootArray[chainIndex],
    }
    chainIndex += 1
  }

  const leaves = makeSphinxLeaves(deploymentData)

  if (forceCancellationLeafIndexNonZero) {
    leaves[0].index = 1n
  }

  const { root, leavesWithProofs } = makeSphinxMerkleTreeFromLeaves(leaves)

  const abiEncodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    [root, leavesWithProofs],
  ])

  process.stdout.write(abiEncodedMerkleTree)
})()
