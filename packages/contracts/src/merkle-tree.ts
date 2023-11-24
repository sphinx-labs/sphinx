import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { AbiCoder } from 'ethers'

/**
 * @notice TypeScript representation of SphinxLeafType.
 */
export enum SphinxLeafType {
  APPROVE,
  EXECUTE,
  CANCEL,
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
 * We expect this input data will be converted to JSON for storage in IPFS, S3, etc. So, we chose not to
 * use any BigInt values as they are a new type and not currently natively supported by JSON.stringify()
 * and/or JSON.parse().
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
 *
 * Because of this, we do not accept any BigInts as input to this function. Instead, we use strings to for all
 * values that would typically use BigInts. Any values that fall into this category are labeled with 'bigint string'.
 *
 * The keys are canonical chain IDs (bigint strings), and the values are `NetworkDeploymentData`
 * objects containing metadata on each network.
 */
export type DeploymentData = Record<
  string,
  NetworkDeploymentData | NetworkCancellationData
>

/**
 * @notice Contains the base data on each network, which should be included in the MerkleTree. These
 * fields are shared between the NetworkDeploymentData type and NetworkCancellationData type.
 *
 * @field nonce          The `currentNonce` in the `SphinxModuleProxy` on this chain, bigint string.
 * @field executor       The address of the account expected to execute this deployment.
 * @field safeProxy      The address of the target GnosisSafeProxy.
 * @field moduleProxy    The address of the target SphinxModuleProxy.
 * @field uri            The URI where the deployment data is stored.
 */
type BaseNetworkData = {
  nonce: string
  executor: string
  safeProxy: string
  moduleProxy: string
  uri: string
}

/**
 * @notice Contains data on each network which should be included in the MerkleTree and is specific to
 * deployments.
 *
 * @field type           Differentiates this object type from the `NetworkCancellationData` type.
 * @field arbitraryChain Indicates If this deployment data is for execution on an arbitrary network.
 * @field txs            The transactions which should be executed on this network in the order in which they should be executed.
 */
export type NetworkDeploymentData = BaseNetworkData & {
  type: 'deployment'
  arbitraryChain: boolean
  txs: SphinxTransaction[]
}

/**
 * @notice Contains data on each network which should be included in the MerkleTree and is specific to
 * deployment cancellations.
 *
 * @field type               Differentiates this object type from the `NetworkDeploymentData` type.
 * @field merkleRootToCancel The Merkle root of the deployment that will be canceled.
 */
export type NetworkCancellationData = BaseNetworkData & {
  type: 'cancellation'
  merkleRootToCancel: string
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
 * @field requireSuccess Whether or not to require this transaction to succeed.
 */
export type SphinxTransaction = {
  to: string
  value: string
  txData: string
  gas: string
  operation: Operation
  requireSuccess: boolean
}

/**
 * @notice The complete SphinxMerkleTree that is ready to be executed (pending signatures on the root).
 *
 * @field root             The root hash of the MerkleTree.
 * @field leavesWithProofs The individual tree leaves and their proofs.
 */
export interface SphinxMerkleTree {
  root: string
  leavesWithProofs: SphinxLeafWithProof[]
}

/**
 * @notice Generates a set of `SphinxLeaf` objects, ready to generate the Merkle tree.
 *
 * @param deploymentData All the data required to generate the Merkle tree leaves.
 * @returns              An array of `SphinxLeaf` objects.
 */
export const makeSphinxLeaves = (
  deploymentData: DeploymentData
): Array<SphinxLeaf> => {
  let approvalIncluded = false
  let arbitraryApprovalIncluded = false
  let cancellationLeafIncluded = false

  const merkleLeaves: Array<SphinxLeaf> = []

  const coder = AbiCoder.defaultAbiCoder()

  for (const [chainIdStr, data] of Object.entries(deploymentData)) {
    if (isNetworkDeploymentData(data) && !isNetworkCancellationData(data)) {
      const chainId = data.arbitraryChain ? BigInt(0) : BigInt(chainIdStr)

      // If this DeploymentData entry is for an arbitrary approval, then throw errors related to prior conflicting leaves
      if (data.arbitraryChain === true) {
        if (cancellationLeafIncluded) {
          // If there has already been a cancellation leaf, then throw an error
          throw new Error(
            'Detected conflicting cancellation and `arbitraryChain` === true `DeploymentData` entries.'
          )
        } else if (arbitraryApprovalIncluded) {
          // If there has already been another arbitrary approval leaf, then throw an error
          throw new Error(
            'Detected `arbitraryChain` === true in multiple DeploymentData entries'
          )
        } else if (approvalIncluded) {
          // If there has already been any other approval leaf, then throw an error
          throw new Error(
            'Detected conflicting approval and `arbitraryChain` === true `DeploymentData` entries.'
          )
        }

        arbitraryApprovalIncluded = true
      } else if (arbitraryApprovalIncluded) {
        // If this DeploymentData entry is for a normal approval and there was a previous arbitrary approval, then throw an error
        throw new Error(
          'Detected conflicting approval and `arbitraryChain` === true `DeploymentData` entries.'
        )
      }

      approvalIncluded = true

      // generate approval leaf data
      const approvalData = coder.encode(
        ['address', 'address', 'uint', 'uint', 'address', 'string', 'bool'],
        [
          data.safeProxy,
          data.moduleProxy,
          data.nonce,
          data.txs.length + 1, // We add one to account for the approval leaf
          data.executor,
          data.uri,
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
        const transactionLeafData = coder.encode(
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
    } else if (
      isNetworkCancellationData(data) &&
      !isNetworkDeploymentData(data)
    ) {
      // Encode CANCEL leaf data.
      const cancellationData = coder.encode(
        ['address', 'address', 'uint256', 'bytes32', 'address', 'string'],
        [
          data.safeProxy,
          data.moduleProxy,
          data.nonce,
          data.merkleRootToCancel,
          data.executor,
          data.uri,
        ]
      )

      // If there has already been an arbitrary approval leaf, then throw an error
      if (arbitraryApprovalIncluded) {
        throw new Error(
          'Detected conflicting cancellation and `arbitraryChain` === true `DeploymentData` entries.'
        )
      } else {
        cancellationLeafIncluded = true
      }

      // Push CANCEL leaf.
      merkleLeaves.push({
        chainId: BigInt(chainIdStr),
        index: BigInt(0),
        leafType: SphinxLeafType.CANCEL,
        data: cancellationData,
      })
    } else {
      throw new Error(`Unknown network data type. Should never happen.`)
    }
  }

  return merkleLeaves
}

/**
 * @notice Checks if an input networkData object is a valid NetworkDeploymentData object with the correct fields and types
 * and that the object does not simultaneously satisfy the requirements to be a NetworkCancellationData object.
 *
 * @param networkData The object to check.
 * @returns boolean indicating if the input object is a NetworkDeploymentData object.
 */
export const isNetworkDeploymentData = (
  networkData: NetworkDeploymentData | NetworkCancellationData
): networkData is NetworkDeploymentData => {
  const networkDeploymentData = networkData as NetworkDeploymentData
  return (
    typeof networkDeploymentData.nonce === 'string' &&
    typeof networkDeploymentData.executor === 'string' &&
    typeof networkDeploymentData.safeProxy === 'string' &&
    typeof networkDeploymentData.moduleProxy === 'string' &&
    typeof networkDeploymentData.uri === 'string' &&
    typeof networkDeploymentData.arbitraryChain === 'boolean' &&
    Array.isArray(networkDeploymentData.txs)
  )
}

/**
 * @notice Checks if an input networkData object is a valid NetworkCancellationData object with the correct fields and types.
 * and that the object does not simultaneously satisfy the requirements to be a NetworkDeploymentData object.
 *
 * @param networkData The object to check.
 * @returns boolean indicating if the input object is a NetworkCancellationData object.
 */
export const isNetworkCancellationData = (
  networkData: NetworkDeploymentData | NetworkCancellationData
): networkData is NetworkCancellationData => {
  const networkCancellationData = networkData as NetworkCancellationData
  return (
    typeof networkCancellationData.nonce === 'string' &&
    typeof networkCancellationData.executor === 'string' &&
    typeof networkCancellationData.safeProxy === 'string' &&
    typeof networkCancellationData.moduleProxy === 'string' &&
    typeof networkCancellationData.uri === 'string' &&
    typeof networkCancellationData.merkleRootToCancel === 'string'
  )
}

/**
 * @notice Generates the complete `SphinxMerkleTree` object from a set of `SphinxLeaves`.
 *
 * @param leaves The raw leaves that should be included in the tree
 * @returns      The `SphinxMerkleTree` object, which is ready to be executed, pending signatures.
 */
export const makeSphinxMerkleTreeFromLeaves = (
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

/**
 * @notice Generates the complete `SphinxMerkleTree` object from the raw DeploymentData
 * This is the *only* function we consider to satisfy the invariants defined in the Sphinx Merkle tree spec.
 *
 * @param deploymentData All the data required to generate the Merkle tree.
 * @returns              The `SphinxMerkleTree` object, which is ready to be executed, pending signatures.
 */
export const makeSphinxMerkleTree = (
  deploymentData: DeploymentData
): SphinxMerkleTree => {
  const leaves = makeSphinxLeaves(deploymentData)
  return makeSphinxMerkleTreeFromLeaves(leaves)
}
