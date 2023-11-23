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

const abiEncodedChainIds = argv[2]
const abiEncodedNonces = argv[3]
const executor = argv[4]
const safeProxy = argv[5]
const moduleProxy = argv[6]
const uri = argv[7]
const abiEncodedTxs = argv[8]
const arbitraryChain = argv[9] === 'true'
const forceNumLeavesValue = argv[10] === 'true'
const overridingNumLeavesValue = argv[11]
const forceApprovalLeafIndexNonZero = argv[12] === 'true'
const forceExecutionLeavesChainIdNonZero = argv[13] === 'true'
const forceApprovalLeafChainIdNonZero = argv[14] === 'true'

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

  const txArrayResult = coder.decode(
    sphinxTransactionArrayType.outputs,
    abiEncodedTxs
  )
  const [txArray] = recursivelyConvertResult(
    sphinxTransactionArrayType.outputs,
    txArrayResult
  ) as [Array<Array<SphinxTransaction>>]

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
      type: 'deployment',
      nonce: nonceArray[chainIndex],
      executor,
      safeProxy,
      moduleProxy,
      uri,
      txs: txArray[chainIndex] !== undefined ? txArray[chainIndex] : [],
      arbitraryChain,
    }
    chainIndex += 1
  }

  const leaves = makeSphinxLeaves(deploymentData)

  if (forceNumLeavesValue) {
    leaves[0].data = coder.encode(
      ['address', 'address', 'uint', 'uint', 'address', 'string', 'bool'],
      [
        safeProxy,
        moduleProxy,
        nonceArray[0],
        overridingNumLeavesValue, // Override the `numLeaves`
        executor,
        uri,
        arbitraryChain,
      ]
    )
  }
  if (forceApprovalLeafIndexNonZero) {
    leaves[0].index = 1n
  }
  if (forceApprovalLeafChainIdNonZero) {
    leaves[0].chainId = 31337n
  }
  if (forceExecutionLeavesChainIdNonZero) {
    for (let i = 1; i < leaves.length; i++) {
      leaves[i].chainId = 31337n
    }
  }

  const { root, leavesWithProofs } = makeSphinxMerkleTreeFromLeaves(leaves)

  const abiEncodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    [root, leavesWithProofs],
  ])

  process.stdout.write(abiEncodedMerkleTree)
})()
