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
  data: string
  leafType: LeafType
}

export type LeafWithProof = {
  leaf: SphinxLeaf
  proof: string[]
}

// TODO(md)
export type NetworkDeploymentData = {
  nonce: bigint
  executor: string
  safe: string
  module: string
  deploymentURI: string
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
export const makeSphinxMerkleTree = (
  deploymentData: Record<number, NetworkDeploymentData>
): {
  tree: StandardMerkleTree<(string | bigint | LeafType)[][]>
  leafs: Array<SphinxLeaf>
} => {
  const merkleLeafs: Array<SphinxLeaf> = []

  const coder = AbiCoder.defaultAbiCoder()

  for (const [chainId, data] of Object.entries(deploymentData)) {
    // generate approval leaf data
    const approvalData = coder.encode(
      ['address', 'address', 'uint', 'uint', 'address', 'string'],
      [
        data.safe,
        data.module,
        data.nonce,
        data.txs.length + 1, // We add one to account for the approval leaf
        data.executor,
        data.deploymentURI,
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

  const rawLeafArray = merkleLeafs.map((leaf) => [Object.values(leaf)])
  return {
    tree: StandardMerkleTree.of(rawLeafArray, [
      'tuple(uint256, uint256, uint8, bytes)',
    ]),
    leafs: merkleLeafs,
  }
}

// TODO(md)
export const makeSphinxBundle = (
  deploymentData: DeploymentData
): SphinxBundle => {
  const { tree, leafs } = makeSphinxMerkleTree(deploymentData)

  return {
    root: tree.root,
    leafs: leafs.map((leaf) => {
      const leafWithProof = {
        leaf,
        proof: tree.getProof([Object.values(leaf)]),
      }
      return leafWithProof
    }),
  }
}
