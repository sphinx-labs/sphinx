import { argv } from 'process'

import { ethers } from 'ethers'

import { DeploymentData, makeSphinxBundle } from '../dist/module'
import { abi as sphinxModuleTestABI } from '../out/SphinxModule.t.sol/SphinxModule_Test.json'

const chainId = argv[2]
const nonce = argv[3]
const executor = argv[4]
const safe = argv[5]
const deploymentURI = argv[6]
const abiEncodedTxs = argv[7] // TODO

;(async () => {
  const coder = ethers.AbiCoder.defaultAbiCoder()

  const deploymentData: DeploymentData = {
    [chainId]: {
      nonce: BigInt(nonce),
      executor,
      safe,
      deploymentURI,
      txs: [], // TODO
    },
  }

  const iface = new ethers.Interface(sphinxModuleTestABI)
  const merkleTreeFragment = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxMerkleTreeType')
  if (!merkleTreeFragment) {
    throw new Error(
      'Missing SphinxModule.sphinxMerkleTreeType. Should never happen.'
    )
  }

  const { root, leafs } = makeSphinxBundle(deploymentData)

  const abiEncodedMerkleTree = coder.encode(merkleTreeFragment.outputs, [
    [root, leafs],
  ])

  process.stdout.write(abiEncodedMerkleTree)
})()
