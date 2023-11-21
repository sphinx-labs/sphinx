import { argv } from 'process'

import { ethers } from 'ethers'

import {
  DeploymentData,
  makeSphinxLeaves,
  makeSphinxMerkleTreeFromLeaves,
} from '../src/merkle-tree'
import { abi as testUtilsABI } from '../out/TestUtils.t.sol/TestUtils.json'

const chainId = argv[2]
const nonce = argv[3]
const executor = argv[4]
const safeProxy = argv[5]
const moduleProxy = argv[6]
const uri = argv[7]
const merkleRootToCancel = argv[8]

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

  const deploymentData: DeploymentData = {
    [chainId]: {
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      merkleRootToCancel,
      uri,
    },
  }

  const leaves = makeSphinxLeaves(deploymentData)

  const { root, leavesWithProofs } = makeSphinxMerkleTreeFromLeaves(leaves)

  const abiEncodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    [root, leavesWithProofs],
  ])

  process.stdout.write(abiEncodedMerkleTree)
})()
