import { argv } from 'process'

import { ethers } from 'ethers'

import {
  DeploymentData,
  SphinxTransaction,
  makeSphinxBundle,
} from '../src/module'
import { recursivelyConvertResult } from '../src/utils'
import { abi as sphinxModuleTestABI } from '../out/SphinxModule.t.sol/SphinxModule_Test.json'

const chainId = argv[2]
const nonce = argv[3]
const executor = argv[4]
const safe = argv[5]
const sphinxModule = argv[6]
const deploymentURI = argv[7]
const abiEncodedTxs = argv[8] // TODO

;(async () => {
  const coder = ethers.AbiCoder.defaultAbiCoder()

  const iface = new ethers.Interface(sphinxModuleTestABI)
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
    },
  }

  const { root, leafs } = makeSphinxBundle(deploymentData)

  const abiEncodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    [root, leafs],
  ])

  process.stdout.write(abiEncodedMerkleTree)
})()
