import { argv } from 'process'

import { ethers } from 'ethers'

import {
  DeploymentData,
  SphinxTransaction,
  makeSphinxLeafs,
  makeSphinxMerkleTree,
} from '../src/module'
import { recursivelyConvertResult } from '../src/utils'
import { abi as testUtilsABI } from '../out/TestUtils.t.sol/TestUtils.json'

const chainId = argv[2]
const nonce = argv[3]
const executor = argv[4]
const safe = argv[5]
const sphinxModule = argv[6]
const deploymentURI = argv[7]
const abiEncodedTxs = argv[8]
const arbitraryChain = argv[9] === 'true'
const forceNumLeafsValue = argv[10] === 'true'
const overridingNumLeafsValue = argv[11]
const forceApprovalLeafIndexNonZero = argv[12] === 'true'

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
  ) as [Array<SphinxTransaction>]

  const deploymentData: DeploymentData = {
    [chainId]: {
      nonce: BigInt(nonce),
      executor,
      safe,
      module: sphinxModule,
      deploymentURI,
      txs: txArray,
      arbitraryChain,
    },
  }

  const leafs = makeSphinxLeafs(deploymentData)

  if (forceNumLeafsValue) {
    leafs[0].data = coder.encode(
      ['address', 'address', 'uint', 'uint', 'address', 'string', 'bool'],
      [
        safe,
        sphinxModule,
        nonce,
        overridingNumLeafsValue, // Override the `numLeafs`
        executor,
        deploymentURI,
        arbitraryChain,
      ]
    )
  }
  if (forceApprovalLeafIndexNonZero) {
    leafs[0].index = 1n
  }

  const { root, leafsWithProofs } = makeSphinxMerkleTree(leafs)

  const abiEncodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    [root, leafsWithProofs],
  ])

  process.stdout.write(abiEncodedMerkleTree)
})()
