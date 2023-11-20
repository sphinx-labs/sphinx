import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { AbiCoder } from 'ethers'

/**
 * @notice TypeScript represention of SphinxLeafType.
 */
export enum SphinxLeafType {
  APPROVE,
  EXECUTE,
}

/**
 * @notice TypeScript representation of SphinxLeaf.
 */
export type SphinxLeaf = {
  chainId: bigint
  index: bigint
  leafType: SphinxLeafType
  data: string
}

/**
 * @notice TypeScript representation of SphinxLeafWithProof.
 */
export type SphinxLeafWithProof = {
  leaf: SphinxLeaf
  proof: string[]
}

/**
 * @notice Object containing all of the necessary info to assemble a SphinxMerkleTree
 *
 * We expect that this input data may be converted to JSON for storage in IPFS, S3, etc. So we chose not to
 * use any BigInt values as they are a new type and not currently natively supported by JSON.stringify()
 * and/or JSON.parse().
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
 *
 * We accept all values that would normally use a BigInt as strings and then convert them to BigInts internally.
 * Any value that falls into this category are labeled with 'bigint string'
 *
 * The keys are canonical chain ids (bigint strings), and the value are `NetworkDeploymentData`
 * objects containing metadata on each network.
 */
export type DeploymentData = Record<string, NetworkDeploymentData>

/**
 * @notice Contains data on each individual network which should be included in the MerkleTree
 *
 * @field nonce          The `currentNonce` in the `SphinxModuleProxy` on this chain, bigint string.
 * @field executor       The address of the account expected to execute this deployment.
 * @field safeProxy      The address of the target GnosisSafeProxy.
 * @field moduleProxy    The address of the target SphinxModuleProxy.
 * @field deploymentURI  The URI where the deployment data is stored.
 * @field arbitraryChain Indicates If this deployment data is for execution on an arbitrary network. See [SphinxDataTypes.sol](TODO(end)) for more information.
 * @field txs            The transactions which should be executed on this network in the order in which they should be executed.
 */
export type NetworkDeploymentData = {
  nonce: string
  executor: string
  safeProxy: string
  moduleProxy: string
  deploymentURI: string
  arbitraryChain: boolean
  txs: SphinxTransaction[]
}

/**
 * @notice TypeScript enum with the values `Call`(0) and `DelegateCall`(1) which correspond to the
 * `Enum.Operation.Call` and `Enum.Operation.DelegateCall` enum values [defined by Safe](https://github.com/safe-global/safe-contracts/blob/main/contracts/common/Enum.sol).
 */
export enum Operation {
  Call,
  DelegateCall,
}

/**
 * @notice Contains all the data on each transaction that should be executed on a given network.
 *
 * @field to              The destination address.
 * @field value           The amount to send from the Safe to the destination address, bigint string.
 * @field txData          Arbitrary calldata to forward to the Safe.
 * @field gas             The amount of gas included in the call from the `SphinxModuleProxy` to the Gnosis Safe for the transaction, bigint string.
 * @field operation       The type of transaction operation.
 * @field requiredSuccess Whether or not to require this transaction to succeed. See [SphinxDataTypes.sol](TODO(end)) for more information.
 */
export type SphinxTransaction = {
  to: string
  value: string
  txData: string
  gas: string
  operation: Operation
  requireSuccess: boolean
}

// TODO(md)
/**
 * @notice The complete SphinxMerkleTree ready to be executed (pending signatures on the root).
 *
 * @field root             The root hash of the MerkleTree.
 * @field leavesWithProofs The individual tree leaves and their proofs.
 */
export interface SphinxMerkleTree {
  root: string
  leavesWithProofs: SphinxLeafWithProof[]
}

/**
 * @notice Generates a set of `SphinxLeaf` objects, ready to be used to generate the Merkle tree.
 *
 * @param deploymentData All of the data required to generate the set of Merkle tree leaves.
 * @returns              An array of `SphinxLeaf` objects.
 */
export const makeSphinxLeaves = (
  deploymentData: DeploymentData
): Array<SphinxLeaf> => {
  const merkleLeaves: Array<SphinxLeaf> = []

  const coder = AbiCoder.defaultAbiCoder()

  for (const [chainIdStr, data] of Object.entries(deploymentData)) {
    const chainId = data.arbitraryChain ? BigInt(0) : BigInt(chainIdStr)

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
      chainId,
      index: BigInt(0),
      leafType: SphinxLeafType.APPROVE,
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
        chainId,
        index,
        leafType: SphinxLeafType.EXECUTE,
        data: transactionLeafData,
      })

      index += BigInt(1)
    }
  }

  return merkleLeaves
}

/**
 * @notice Generates the complete `SphinxMerkleTree` object.
 *
 * @param deploymentData All of the data required to generate the set of Merkle tree leaves.
 * @returns              The `SphinxMerkleTree` object which is ready to be executed, pending signatures.
 */
export const makeSphinxMerkleTree = (
  leaves: SphinxLeaf[]
): SphinxMerkleTree => {
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
