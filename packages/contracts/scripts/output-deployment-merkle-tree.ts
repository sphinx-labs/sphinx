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

const abiEncodedNetworks = argv[2]
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
  const networkArrayType = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find(
      (fragment) =>
        fragment.name === 'networkDeploymentMerkleTreeInputsArrayType'
    )
  if (!merkleTreeFragment || !networkArrayType) {
    throw new Error('Missing type in ABI. Should never happen.')
  }

  const networkArrayResult = coder.decode(
    networkArrayType.outputs,
    abiEncodedNetworks
  )
  const [networkArray] = recursivelyConvertResult(
    networkArrayType.outputs,
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
      txs,
      arbitraryChain,
    }
  }

  const leaves = makeSphinxLeaves(deploymentData)

  if (forceNumLeavesValue) {
    if (networkArray.length !== 1) {
      throw new Error(`TODO(docs). Should never happen.`)
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
