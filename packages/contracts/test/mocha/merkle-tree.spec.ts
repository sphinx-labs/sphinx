import { expect } from 'chai'
import { parseUnits } from 'ethers'

import {
  DeploymentData,
  Operation,
  SphinxLeafType,
  SphinxMerkleTree,
  SphinxTransaction,
  makeSphinxMerkleTree,
} from '../../dist'

/**
 * @notice This test suite covers generating Merkle trees that satisfy the invariants defined in the Sphinx Merkle tree specification.
 * Note that in this test suite, we do not confirm that the actual encoding is correct or that the Merkle tree is actually executable on
 * chain.
 *
 * For tests that cover the encoding logic and that the generated Merkle tree is executable, see the `SphinxModule.t.sol` where we use
 * the `makeSphinxMerkleTree` function to generate Merkle trees via the `getMerkleTreeFFI`.
 */

/**
 * @notice Checks that the leaves in the tree are ordered properly such that the tree satisfies invariants 1, 2, and 3 of the
 * Sphinx Merkle tree specification.
 */
const assertTreeOrderedProperly = (tree: SphinxMerkleTree) => {
  const seenChainIds: BigInt[] = []
  // Check that the leaves are ordered by index and chain id ascending
  for (let i = 1; i < tree.leavesWithProofs.length; i++) {
    const leaf = tree.leavesWithProofs[i]
    const previousLeaf = tree.leavesWithProofs[i - 1]

    if (leaf.leaf.chainId === previousLeaf.leaf.chainId) {
      // If the chain ids are the same, then we must be iterating through all the leaves for a specific chain

      // Check that individual leafs are ordered by index ascending within each chain
      // This implicitly confirms that there are no duplicate indexes for this chain
      expect(leaf.leaf.index, 'Detected incorrect leaf index').to.eq(
        previousLeaf.leaf.index + BigInt(1)
      )
    } else {
      // If the chain ids are different, then we must be switching to a new set of a leaves for a new chain

      // Check that the new chain id is greater than the current one so that the order of the leafs is ascending by the chain id
      // This combined with the above check implicitly shows that there are no duplicate index + chain id combinations
      expect(
        Number(leaf.leaf.chainId),
        'Network order is not correct'
      ).to.be.greaterThan(Number(previousLeaf.leaf.chainId))

      // Check that the first leaf is an approval leaf
      expect(leaf.leaf.leafType, 'Approval leaf is not first').to.eq(
        SphinxLeafType.APPROVE
      )

      // TODO - or that the first leaf is a CANCEL leaf

      // Check that the new chain id has not been seen before.
      // We expect all the leaves for a given network to be grouped together, so each chain should only be switched to exactly one time.
      expect(
        seenChainIds.includes(leaf.leaf.chainId),
        'found duplicate chain id'
      ).to.eq(false)

      // Add to list of seen chain ids
      seenChainIds.push(leaf.leaf.chainId)
    }
  }
}

/**
 * @notice Checks that the tree contains exactly one APPROVAL or CANCEL leaf per chain such that invariant 4 is satisfied.
 */
const assertOneApprovalOrCancellationLeafPerChain = (
  tree: SphinxMerkleTree
) => {
  const approvalLeafChainIds: BigInt[] = []
  const cancelLeafChainIds: BigInt[] = []

  for (let i = 1; i < tree.leavesWithProofs.length; i++) {
    const leaf = tree.leavesWithProofs[i]
    if (leaf.leaf.leafType === SphinxLeafType.APPROVE) {
      expect(
        approvalLeafChainIds.includes(leaf.leaf.chainId),
        'Found extra APPROVE leaf for chain'
      ).to.not.eq(true)
      approvalLeafChainIds.push(leaf.leaf.chainId)
    } else if (leaf.leaf.leafType === SphinxLeafType.CANCEL) {
      expect(
        cancelLeafChainIds.includes(leaf.leaf.chainId),
        'Found extra CANCEL leaf for chain'
      ).to.not.eq(true)
      cancelLeafChainIds.push(leaf.leaf.chainId)
    } else if (leaf.leaf.leafType === SphinxLeafType.EXECUTE) {
      expect(
        cancelLeafChainIds.includes(leaf.leaf.chainId),
        'Detected execution leaf for chain that also has cancelation leaf'
      ).to.not.eq(true)
    }
  }
}

describe('Merkle tree satisfies invariants', () => {
  it('Cancel on all networks', () => {
    const deploymentData: DeploymentData = {}
    const chainIds = ['5', '420', '421613']
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const deploymentURI = 'http://localhost'
    const arbitraryChain = false
    const txs: SphinxTransaction[] = []

    for (const chainId of chainIds) {
      deploymentData[chainId] = {
        nonce,
        executor,
        safeProxy,
        moduleProxy,
        deploymentURI,
        arbitraryChain,
        txs,
      }
    }

    const tree = makeSphinxMerkleTree(deploymentData)

    // Check that there are 3 leaves in the tree
    expect(tree.leavesWithProofs.length === 3, 'Incorrect number of leaves')

    // Check that all three leaves are APPROVAL leaves
    for (const leaf of tree.leavesWithProofs) {
      expect(
        leaf.leaf.leafType === SphinxLeafType.EXECUTE,
        'Found EXECUTION leaf which should not be included in the tree'
      )
    }

    // Check tree is ordered properly
    assertTreeOrderedProperly(tree)

    // Check tree has only one CANCEL or APPROVAL leaf per network
    assertOneApprovalOrCancellationLeafPerChain(tree)
  })

  it('Send transactions on all networks', () => {
    const deploymentData: DeploymentData = {}
    const chainIds = ['421613', '420', '5']
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const deploymentURI = 'http://localhost'
    const arbitraryChain = false

    const to = '0x' + '11'.repeat(20)
    const value = parseUnits('1', 'ether').toString()
    const txData = '0x'
    const gas = BigInt(50_000).toString()
    const operation = Operation.Call
    const requireSuccess = true
    const txs: SphinxTransaction[] = [
      {
        to,
        value,
        txData,
        gas,
        operation,
        requireSuccess,
      },
    ]

    for (const chainId of chainIds) {
      deploymentData[chainId] = {
        nonce,
        executor,
        safeProxy,
        moduleProxy,
        deploymentURI,
        arbitraryChain,
        txs,
      }
    }

    const tree = makeSphinxMerkleTree(deploymentData)

    // Check that there are 6 leaves in the tree (3 for approval, 3 for transactions)
    const numLeaves = chainIds.length + chainIds.length * txs.length
    expect(tree.leavesWithProofs.length, 'Incorrect number of leaves').to.eq(
      numLeaves
    )

    // Check tree is ordered properly
    assertTreeOrderedProperly(tree)

    // Check tree has only one CANCEL or APPROVAL leaf per network
    assertOneApprovalOrCancellationLeafPerChain(tree)
  })

  it('Cancel on one network, transactions on other networks', () => {
    const deploymentData: DeploymentData = {}
    const chainIds = ['421613', '420', '5']
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const deploymentURI = 'http://localhost'
    const arbitraryChain = false

    for (const chainId of chainIds) {
      const to = '0x' + '11'.repeat(20)
      const value = parseUnits('1', 'ether').toString()
      const txData = '0x'
      const gas = BigInt(50_000).toString()
      const operation = Operation.Call
      const requireSuccess = true

      // No transactions on goerli
      const txs: SphinxTransaction[] =
        chainId === '5'
          ? []
          : [
              {
                to,
                value,
                txData,
                gas,
                operation,
                requireSuccess,
              },
            ]

      deploymentData[chainId] = {
        nonce,
        executor,
        safeProxy,
        moduleProxy,
        deploymentURI,
        arbitraryChain,
        txs,
      }
    }

    const tree = makeSphinxMerkleTree(deploymentData)

    // Check that there are 5 leaves in the tree (1 cancel, 2 approval, 2 transactions)
    expect(tree.leavesWithProofs.length, 'Incorrect number of leaves').to.eq(5)

    // Check tree is ordered properly
    assertTreeOrderedProperly(tree)

    // Check tree has only one CANCEL or APPROVAL leaf per network
    assertOneApprovalOrCancellationLeafPerChain(tree)
  })
})
