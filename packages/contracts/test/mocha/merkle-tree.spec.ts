import { expect } from 'chai'
import { ethers, parseUnits } from 'ethers'

import {
  DeploymentData,
  Operation,
  SphinxLeafType,
  SphinxMerkleTree,
  SphinxTransaction,
  makeSphinxMerkleTree,
  decodeApproveLeafData,
} from '../../dist'

/**
 * @notice This test suite covers generating Merkle trees that satisfy invariants 2-5 defined in the Sphinx Merkle tree specification.
 * Note that in this test suite we do not confirm that the actual encoding is correct or that the Merkle tree is executable on
 * chain (invariant 1).
 *
 * For tests that cover the encoding logic and that the generated Merkle tree is executable, see the `SphinxModule.t.sol` where we use
 * the `makeSphinxMerkleTree` function to generate Merkle trees via the `getMerkleTreeFFI` and test executing them on-chain.
 */

/**
 * @notice Checks that the leaves in the tree are ordered properly such that the tree satisfies invariants 2, 3, and 5 of the
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

      // Check that the current leaf is EXECUTE (otherwise there are multiple APPROVE or CANCEL leafs for this chain)
      expect(leaf.leaf.leafType).to.eq(SphinxLeafType.EXECUTE)
    } else {
      // If the chain ids are different, then we must be switching to a new set of a leaves for a new chain

      // Check that the new chain id is greater than the current one so that the order of the leafs is ascending by the chain id
      // This combined with the above check implicitly shows that there are no duplicate index + chain id combinations
      expect(
        Number(leaf.leaf.chainId),
        'Network order is not correct'
      ).to.be.greaterThan(Number(previousLeaf.leaf.chainId))

      // Check that the first leaf is either an approval leaf or cancel
      expect(
        leaf.leaf.leafType,
        'CANCEL or APPROVE leaf is not first'
      ).to.not.eq(SphinxLeafType.EXECUTE)

      // Check that the new chain id has not been seen before.
      // We expect all the leaves for a given network to be grouped together, so each chain should only be switched to exactly one time.
      // If we switch to a chain more than one time, then there must be multiple CANCEL or APPROVE leafs for that chain.
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
 * @notice Checks that the tree contains exactly one APPROVAL or CANCEL leaf per chain such that invariant 2 is satisfied.
 */
const assertInvariantTwo = (tree: SphinxMerkleTree) => {
  let detectedArbitraryApproval = false
  const detectedChainId: BigInt[] = []

  for (let i = 1; i < tree.leavesWithProofs.length; i++) {
    const leaf = tree.leavesWithProofs[i]

    if (leaf.leaf.leafType !== SphinxLeafType.EXECUTE) {
      // Expect that we have not already detected an arbitrary approval
      expect(detectedArbitraryApproval).to.be.false

      // If the leaf is an approval leaf, then check if it is arbitrary and if so update `detectedArbitraryApproval`
      if (leaf.leaf.leafType === SphinxLeafType.APPROVE) {
        const values = decodeApproveLeafData(leaf.leaf.data)
        const isArbitraryLeaf = values[6]
        if (isArbitraryLeaf) {
          detectedArbitraryApproval = true

          // If this APPROVE leaf is arbitrary, then we must expect that we have not previously seen any CANCEL or APPROVE leafs for any chain
          expect(detectedChainId.length).to.eq(0)
        }
      }

      // Expect that we have not already detected an APPROVE or CANCEL leaf for this leafs chainId
      expect(
        detectedChainId.includes(leaf.leaf.chainId),
        'Found extra CANCEL or APPROVAL leaf for chain'
      ).to.not.eq(true)

      // Mark this chain id as detected
      detectedChainId.push(leaf.leaf.chainId)
    }
  }
}

const assertInvariantThree = (tree: SphinxMerkleTree) => {}

const assertInvariantFour = (tree: SphinxMerkleTree) => {}

const assertInvariantFive = (tree: SphinxMerkleTree) => {}

const assertInvariantSix = (tree: SphinxMerkleTree) => {}

const assertInvariantSeven = (tree: SphinxMerkleTree) => {}

describe('Merkle tree satisfies invariants', () => {
  it('Cancel on all networks', () => {
    const deploymentData: DeploymentData = {}
    const chainIds = ['5', '420', '421613']
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
    const arbitraryChain = false
    const merkleRootToCancel = ethers.keccak256(ethers.toUtf8Bytes('1'))

    for (const chainId of chainIds) {
      deploymentData[chainId] = {
        nonce,
        executor,
        safeProxy,
        moduleProxy,
        uri,
        arbitraryChain,
        merkleRootToCancel,
      }
    }

    const tree = makeSphinxMerkleTree(deploymentData)

    // Check that there are 3 leaves in the tree
    expect(tree.leavesWithProofs.length === 3, 'Incorrect number of leaves')

    // Check that all three leaves are APPROVAL leaves
    for (const leaf of tree.leavesWithProofs) {
      expect(
        leaf.leaf.leafType,
        'Found EXECUTION or APPROVE leaf which should not be included in the tree'
      ).to.eq(SphinxLeafType.CANCEL)
    }

    // Check tree is ordered properly
    assertTreeOrderedProperly(tree)

    // Check that invariant 2 is satisfied
    assertInvariantTwo(tree)
  })

  it('Send transactions on all networks', () => {
    const deploymentData: DeploymentData = {}
    const chainIds = ['421613', '420', '5']
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
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
        uri,
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

    // Check that invariant 2 is satisfied
    assertInvariantTwo(tree)
  })

  it('Cancel on one network, transactions on other networks', () => {
    const deploymentData: DeploymentData = {}
    const chainIds = ['421613', '420', '5']
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
    const arbitraryChain = false

    for (const chainId of chainIds) {
      const to = '0x' + '11'.repeat(20)
      const value = parseUnits('1', 'ether').toString()
      const txData = '0x'
      const gas = BigInt(50_000).toString()
      const operation = Operation.Call
      const requireSuccess = true

      // On Goerli, only generate a cancel leaf
      if (chainId === '5') {
        deploymentData[chainId] = {
          nonce,
          executor,
          safeProxy,
          moduleProxy,
          uri,
          merkleRootToCancel: ethers.keccak256(ethers.toUtf8Bytes('1')),
        }
      } else {
        // On other networks, generate a deployment
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

        deploymentData[chainId] = {
          nonce,
          executor,
          safeProxy,
          moduleProxy,
          uri,
          arbitraryChain,
          txs,
        }
      }
    }

    const tree = makeSphinxMerkleTree(deploymentData)

    // Check that there are 5 leaves in the tree (1 cancel, 2 approval, 2 transactions)
    expect(tree.leavesWithProofs.length, 'Incorrect number of leaves').to.eq(5)

    // Check tree is ordered properly
    assertTreeOrderedProperly(tree)

    // Check that invariant 2 is satisfied
    assertInvariantTwo(tree)
  })
})
