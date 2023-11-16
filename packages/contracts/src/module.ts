import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { AbiCoder } from 'ethers'

// TODO(md): See Solidity docs
export enum LeafType {
  APPROVE,
  EXECUTE,
}

// TODO(md): See Safe docs
export enum Operation {
  Call,
  DelegateCall,
}

// TODO(md): See Solidity docs
export type SphinxLeaf = {
  chainId: bigint
  index: bigint
  leafType: LeafType
  data: string
}

export type LeafWithProof = {
  leaf: SphinxLeaf
  proof: string[]
}

// TODO(md)
export type NetworkDeploymentData = {
  nonce: bigint
  executor: string
  safeProxy: string
  moduleProxy: string
  deploymentURI: string
  arbitraryChain: boolean
  txs: SphinxTransaction[]
}

export type DeploymentData = Record<number, NetworkDeploymentData>

// TODO(md)
export type SphinxTransaction = {
  to: string
  value: string
  txData: string
  gas: string
  operation: Operation
  requireSuccess: boolean
}

// TODO(md)
export interface SphinxBundle {
  root: string
  leafs: LeafWithProof[]
}

// TODO(md)
export const makeSphinxLeafs = (
  deploymentData: Record<number, NetworkDeploymentData>
): Array<SphinxLeaf> => {
  const merkleLeafs: Array<SphinxLeaf> = []

  const coder = AbiCoder.defaultAbiCoder()

  for (const [chainId, data] of Object.entries(deploymentData)) {
    // generate approval leaf data
    const approvalData = coder.encode(
      ['address', 'address', 'uint', 'uint', 'address', 'string', 'bool'],
      [
        data.safeProxy,
        data.moduleProxy,
        data.nonce,
        data.txs.length + 1, // We add one to account for the approval leaf
        data.executor,
        data.deploymentURI,
        data.arbitraryChain,
      ]
    )

    // push approval leaf
    merkleLeafs.push({
      chainId: BigInt(chainId),
      index: BigInt(0),
      leafType: LeafType.APPROVE,
      data: approvalData,
    })

    // push transaction leafs
    let index = BigInt(1)
    for (const tx of data.txs) {
      // generate transaction leaf data
      const transactionLeafData = AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint', 'uint', 'bytes', 'uint', 'bool'],
        [
          tx.to,
          BigInt(tx.value),
          BigInt(tx.gas),
          tx.txData,
          BigInt(tx.operation),
          tx.requireSuccess,
        ]
      )

      merkleLeafs.push({
        chainId: BigInt(chainId),
        index,
        leafType: LeafType.EXECUTE,
        data: transactionLeafData,
      })

      index += BigInt(1)
    }
  }

  return merkleLeafs
}

export const makeSphinxMerkleTree = (
  leafs: Array<SphinxLeaf>
): {
  root: string
  leafsWithProofs: Array<LeafWithProof>
} => {
  const rawLeafArray = leafs.map((leaf) => [Object.values(leaf)])
  const tree = StandardMerkleTree.of(rawLeafArray, [
    'tuple(uint256, uint256, uint8, bytes)',
  ])

  return {
    root: tree.root,
    leafsWithProofs: leafs.map((leaf) => {
      const leafWithProof = {
        leaf,
        proof: tree.getProof([Object.values(leaf)]),
      }
      return leafWithProof
    }),
  }
}

// TODO(md)
export const makeSphinxBundle = (
  deploymentData: DeploymentData
): SphinxBundle => {
  const leafs = makeSphinxLeafs(deploymentData)
  const { root, leafsWithProofs } = makeSphinxMerkleTree(leafs)
  return { root, leafs: leafsWithProofs }
}
