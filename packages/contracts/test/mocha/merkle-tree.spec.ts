import { expect } from 'chai'
import { parseUnits } from 'ethers'

import {
  DeploymentData,
  Operation,
  SphinxLeafType,
  SphinxMerkleTree,
  SphinxTransaction,
  makeSphinxLeaves,
  makeSphinxMerkleTree,
} from '../../dist'

/**
 * @notice This test suite covers generating Merkle trees that cover multiple networks. Note that we do not test that the tree
 * is actually executable or that the individual leaves are encoded properly in this test suite. We only test that the structure
 * of the tree is correct for multichain cases.
 *
 * For tests that cover the actual encoding logic and that the generated Merkle tree is executable, see the `SphinxModule.t.sol`
 * where we use the `makeSphinxLeaves` and `makeSphinxMerkleTree` functions to generate Merkle trees via the `getMerkleTreeFFI`.
 */

const assertTreeOrderedProperly = (tree: SphinxMerkleTree) => {
  const seenChainIds: BigInt[] = []
  // Check that the leaves are ordered by index and chain id ascending
  for (let i = 1; i < tree.leavesWithProofs.length; i++) {
    const leaf = tree.leavesWithProofs[i]
    const previousLeaf = tree.leavesWithProofs[i - 1]

    if (leaf.leaf.chainId === previousLeaf.leaf.chainId) {
      // If the chain ids are the same, then we must be iterating through all the leaves for a specific chain

      // Check that individual leafs are ordered properly within each chain
      expect(
        leaf.leaf.index === previousLeaf.leaf.index + BigInt(1),
        'Detected incorrect leaf index'
      )
    } else {
      // If the chain ids are different, then we must be switching to a new set of a leaves for a new chain

      // Check that the new chain id is greater than the current one
      expect(
        leaf.leaf.chainId > previousLeaf.leaf.chainId,
        'Network order is not correct'
      )

      // Check that the first leaf is an approval leaf
      expect(
        leaf.leaf.leafType === SphinxLeafType.APPROVE,
        'Approval leaf is not first'
      )

      // Check that the new chain id has not been seen before.
      // We expect all the leaves for a given network to be grouped together, so each chain should only be switched to exactly one time.
      expect(seenChainIds.includes(leaf.leaf.chainId) === false)

      // Add to list of seen chain ids
      seenChainIds.push(leaf.leaf.chainId)
    }
  }
}

describe('Merkle Tree', () => {
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
  })

  it('Send identical transactions on all networks', () => {
    console.log('a')
    const deploymentData: DeploymentData = {}
    const chainIds = ['5', '420', '421613']
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
    console.log('b')

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
    console.log('c')

    const tree = makeSphinxMerkleTree(deploymentData)

    // Check that there are 3 leaves in the tree
    const numLeaves = chainIds.length + chainIds.length * txs.length
    expect(
      tree.leavesWithProofs.length === numLeaves,
      'Incorrect number of leaves'
    )
    console.log('d')

    // // Check that all three leaves are APPROVAL leaves
    // for (const leaf of tree.leavesWithProofs) {
    //   expect(
    //     leaf.leaf.leafType === SphinxLeafType.APPROVE,
    //     'Found EXECUTION leaf which should not be included in the tree'
    //   )
    // }

    // Check tree is ordered properly
    assertTreeOrderedProperly(tree)
  })

  // it('Send different transactions on different networks', () => {})

  // it('Cancel on one network, send transactions on other networks', () => {})
})
