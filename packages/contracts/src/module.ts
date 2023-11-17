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
  leaves: LeafWithProof[]
}

// TODO(md)
export const makeSphinxLeaves = (
  deploymentData: Record<number, NetworkDeploymentData>
): Array<SphinxLeaf> => {
  const merkleLeaves: Array<SphinxLeaf> = []

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
    merkleLeaves.push({
      chainId: BigInt(chainId),
      index: BigInt(0),
      leafType: LeafType.APPROVE,
      data: approvalData,
    })

    // push transaction leaves
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

      merkleLeaves.push({
        chainId: BigInt(chainId),
        index,
        leafType: LeafType.EXECUTE,
        data: transactionLeafData,
      })

      index += BigInt(1)
    }
  }

  return merkleLeaves
}

export const makeSphinxMerkleTree = (
  leaves: Array<SphinxLeaf>
): {
  root: string
  leavesWithProofs: Array<LeafWithProof>
} => {
  const rawLeafArray = leaves.map((leaf) => [Object.values(leaf)])
  const tree = StandardMerkleTree.of(rawLeafArray, [
    'tuple(uint256, uint256, uint8, bytes)',
  ])

  return {
    root: tree.root,
    leavesWithProofs: leaves.map((leaf) => {
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
  const leaves = makeSphinxLeaves(deploymentData)
  const { root, leavesWithProofs } = makeSphinxMerkleTree(leaves)
  return { root, leaves: leavesWithProofs }
}
