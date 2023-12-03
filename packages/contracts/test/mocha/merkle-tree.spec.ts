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
 * @notice This test suite covers generating Merkle trees that satisfy invariants 2-7 defined in the Sphinx Merkle tree specification.
 * Note that in this test suite we do not confirm that the actual encoding is correct or that the Merkle tree is necessarily executable
 * on-chain (invariant 1).
 *
 * For tests that cover the encoding logic and that the generated Merkle tree is executable, see the `SphinxModule.t.sol` where we use
 * the `makeSphinxMerkleTree` function to generate Merkle trees via the `getMerkleTreeFFI` and test executing them.
 */

/**
 * @notice Checks that the tree contains exactly one APPROVE or CANCEL leaf per chain so that invariant 2 is satisfied.
 * Also checks that if there is any APPROVE leaf where `arbitraryChain` is true, then it is the only `APPROVE` or `CANCEL` leaf in the
 * tree such that invariant 3 is satisfied.
 */
const assertInvariantTwoAndThree = (tree: SphinxMerkleTree) => {
  let detectedArbitraryApproval = false
  const detectedChainId: BigInt[] = []

  for (let i = 1; i < tree.leavesWithProofs.length; i++) {
    const leaf = tree.leavesWithProofs[i]

    if (leaf.leaf.leafType !== SphinxLeafType.EXECUTE) {
      // Expect that we have not already detected an arbitrary approval
      expect(detectedArbitraryApproval).to.be.false

      // If the leaf is an approval leaf, then check if it is arbitrary and if so update `detectedArbitraryApproval`
      if (leaf.leaf.leafType === SphinxLeafType.APPROVE) {
        const { arbitraryChain } = decodeApproveLeafData(leaf.leaf)
        if (arbitraryChain) {
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

/**
 * @notice Checks that all the EXECUTE leaves in the tree follow an APPROVE leaf on the same chain so that invariant 4 is satisfied.
 */
const assertInvariantFour = (tree: SphinxMerkleTree) => {
  const seenApprovalChainIds: BigInt[] = []

  for (const leafWithProof of tree.leavesWithProofs) {
    const leaf = leafWithProof.leaf

    if (leaf.leafType === SphinxLeafType.APPROVE) {
      // Keep track of all the chains that have APPROVE leafs
      if (!seenApprovalChainIds.includes(leaf.chainId)) {
        seenApprovalChainIds.push(leaf.chainId)
      }
    } else if (leaf.leafType === SphinxLeafType.EXECUTE) {
      // Expect that we have seen an APPROVE leaf for this chainId
      expect(seenApprovalChainIds.includes(leaf.chainId)).to.be.true
    }
  }
}

/**
 * @notice Checks that all chains with a CANCEL leaf also has no EXECUTE leafs for it so that invariant 5 is satisfied.
 */
const assertInvariantFive = (tree: SphinxMerkleTree) => {
  const seenCancelChainIds: BigInt[] = []

  for (const leafWithProof of tree.leavesWithProofs) {
    const leaf = leafWithProof.leaf

    if (leaf.leafType === SphinxLeafType.CANCEL) {
      // Keep track of all the chains that have APPROVE leafs
      if (!seenCancelChainIds.includes(leaf.chainId)) {
        seenCancelChainIds.push(leaf.chainId)
      }
    }
  }

  for (const leafWithProof of tree.leavesWithProofs) {
    const leaf = leafWithProof.leaf

    if (leaf.leafType === SphinxLeafType.EXECUTE) {
      // Expect that there was no CANCEL leaf for the chain
      expect(seenCancelChainIds.includes(leaf.chainId)).to.be.false
    }
  }
}

/**
 * @notice Checks that every leaf in the tree has a unique `index` and `chainId` combination so that invariant 5 is satisfied.
 */
const assertInvariantSix = (tree: SphinxMerkleTree) => {
  const indexChainIdSets: Record<string, Record<string, true | undefined>> = {}

  for (const leafWithProof of tree.leavesWithProofs) {
    const index = leafWithProof.leaf.index.toString()
    const chainId = leafWithProof.leaf.chainId.toString()

    if (indexChainIdSets[index] === undefined) {
      indexChainIdSets[index] = {}
    }

    // Expect index and chainId combination is undefined (has not been seen before)
    expect(indexChainIdSets[index][chainId]).to.be.undefined

    // Mark this combination as having been seen before
    indexChainIdSets[index][chainId] = true
  }
}

/**
 * @notice Checks that all APPROVE and CANCEL leaves in the tree have an index of 0 such that invariant 7 is satisfied.
 */
const assertInvariantSeven = (tree: SphinxMerkleTree) => {
  for (const leaf of tree.leavesWithProofs) {
    if (
      leaf.leaf.leafType === SphinxLeafType.APPROVE ||
      leaf.leaf.leafType === SphinxLeafType.CANCEL
    ) {
      expect(leaf.leaf.index).to.eq(BigInt(0))
    }
  }
}

/**
 * @notice Checks that all the `EXECUTE` leaves for each chain start with an `index` of 1 and sequentially increment by 1 so that invariant 8 is satisfied.
 */
const assertInvariantEight = (tree: SphinxMerkleTree) => {
  const seenChainIds: BigInt[] = []

  for (let i = 1; i < tree.leavesWithProofs.length; i++) {
    const leaf = tree.leavesWithProofs[i]
    const previousLeaf = tree.leavesWithProofs[i - 1]

    if (leaf.leaf.chainId === previousLeaf.leaf.chainId) {
      // If the chain ids are the same, then we must be iterating through all the leaves for a specific chain

      // Check that individual leafs are ordered by index ascending within each chain and increment sequentially by 1
      expect(leaf.leaf.index, 'Detected incorrect leaf index').to.eq(
        previousLeaf.leaf.index + BigInt(1)
      )
    } else {
      // If the chain ids are different, then we must be switching to a new set of a leaves for a new chain

      // Check that the new chain id is greater than the current one so that the order of the leafs is ascending by the chain id
      expect(
        Number(leaf.leaf.chainId),
        'Network order is not correct'
      ).to.be.greaterThan(Number(previousLeaf.leaf.chainId))

      // Check that the first leaf is either an approval or cancel leaf
      expect(
        leaf.leaf.leafType,
        'CANCEL or APPROVE leaf is not first'
      ).to.not.eq(SphinxLeafType.EXECUTE)

      // If we changed to an `APPROVE` leaf, and there is a leaf after it, and that leaf has the same chain id
      // then check it is an EXECUTE leaf, and that it's index is 1
      if (i + 1 < tree.leavesWithProofs.length) {
        const nextLeaf = tree.leavesWithProofs[i + 1]
        if (leaf.leaf.chainId === nextLeaf.leaf.chainId) {
          expect(nextLeaf.leaf.leafType).to.eq(SphinxLeafType.EXECUTE)
          expect(nextLeaf.leaf.index).to.eq(BigInt(1))
        }
      }

      // Check that the new chain id has not been seen before.
      // If the leaves are sorted by index and chainId ascending, then all leaves for a given chain will be grouped together.
      // So if we switched to a given chain more than one time, then the leafs must not be ordered by index and chain id ascending.
      expect(
        seenChainIds.includes(leaf.leaf.chainId),
        'found duplicate chain id'
      ).to.eq(false)

      // Add to list of seen chain ids
      seenChainIds.push(leaf.leaf.chainId)
    }
  }
}

const assertSatisfiesInvariants = (tree: SphinxMerkleTree) => {
  assertInvariantTwoAndThree(tree)
  assertInvariantFour(tree)
  assertInvariantFive(tree)
  assertInvariantSix(tree)
  assertInvariantSeven(tree)
  assertInvariantEight(tree)
}

describe('Merkle tree satisfies invariants', () => {
  it('Cancel on all networks', () => {
    const deploymentData: DeploymentData = {}
    const chainIds = ['5', '420', '421613']
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
    const merkleRootToCancel = ethers.keccak256(ethers.toUtf8Bytes('1'))

    for (const chainId of chainIds) {
      deploymentData[chainId] = {
        type: 'cancellation',
        nonce,
        executor,
        safeProxy,
        moduleProxy,
        uri,
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

    // Assert invariants are satisfied
    assertSatisfiesInvariants(tree)
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
        type: 'deployment',
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

    // Assert invariants are satisfied
    assertSatisfiesInvariants(tree)
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
          type: 'cancellation',
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
          type: 'deployment',
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

    // Assert invariants are satisfied
    assertSatisfiesInvariants(tree)
  })

  it('Errors if input DeploymentData that contains object which has valid field from both NetworkDeploymentData and NetworkCancellationData', () => {
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

    // Deployment data contains an entry with fields that make it both a valid
    // NetworkDeploymentData and a valid NetworkCancellationData
    const deploymentData: DeploymentData = {
      '5': {
        type: 'cancellation',
        nonce,
        executor,
        safeProxy,
        moduleProxy,
        uri,
        merkleRootToCancel: ethers.keccak256(ethers.toUtf8Bytes('1')),
        arbitraryChain,
        txs,
      } as any,
    }

    expect(() => makeSphinxMerkleTree(deploymentData)).to.throw(
      'Unknown network data type. Should never happen.'
    )
  })

  it('Errors if arbitraryChain === true for multiple DeploymentData entries', () => {
    const deploymentData: DeploymentData = {}
    const chainIds = ['421613', '420', '5']
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
    const arbitraryChain = true

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
        type: 'deployment',
        nonce,
        executor,
        safeProxy,
        moduleProxy,
        uri,
        arbitraryChain,
        txs,
      }
    }

    expect(() => makeSphinxMerkleTree(deploymentData)).to.throw(
      'Detected `arbitraryChain` === true in multiple DeploymentData entries'
    )
  })

  it('Errors if arbitraryChain === true and cancel DeploymentData entry before', () => {
    const deploymentData: DeploymentData = {}
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
    const arbitraryChain = true
    const merkleRootToCancel = ethers.keccak256(ethers.toUtf8Bytes('1'))

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

    // Cancel on Goerli
    deploymentData['5'] = {
      type: 'cancellation',
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      merkleRootToCancel,
      uri,
    }

    // Arbitrary approval
    deploymentData['420'] = {
      type: 'deployment',
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      uri,
      arbitraryChain,
      txs,
    }

    expect(() => makeSphinxMerkleTree(deploymentData)).to.throw(
      'Detected conflicting cancellation and `arbitraryChain` === true `DeploymentData` entries.'
    )
  })

  it('Errors if arbitraryChain === true and cancel DeploymentData entry after', () => {
    const deploymentData: DeploymentData = {}
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
    const arbitraryChain = true
    const merkleRootToCancel = ethers.keccak256(ethers.toUtf8Bytes('1'))

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

    // Arbitrary approval
    deploymentData['5'] = {
      type: 'deployment',
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      uri,
      arbitraryChain,
      txs,
    }

    // Cancel on OP Goerli
    deploymentData['420'] = {
      type: 'cancellation',
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      merkleRootToCancel,
      uri,
    }

    expect(() => makeSphinxMerkleTree(deploymentData)).to.throw(
      'Detected conflicting cancellation and `arbitraryChain` === true `DeploymentData` entries.'
    )
  })

  it('Errors if arbitraryChain === true and approval DeploymentData entry before', () => {
    const deploymentData: DeploymentData = {}
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
    const arbitraryChain = true

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

    // Approve on OP Goerli
    deploymentData['5'] = {
      type: 'deployment',
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      uri,
      arbitraryChain: false,
      txs,
    }

    // Arbitrary approval
    deploymentData['420'] = {
      type: 'deployment',
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      uri,
      arbitraryChain,
      txs,
    }

    expect(() => makeSphinxMerkleTree(deploymentData)).to.throw(
      'Detected conflicting approval and `arbitraryChain` === true `DeploymentData` entries.'
    )
  })

  it('Errors if arbitrary === true and approval DeploymentData entry after', () => {
    const deploymentData: DeploymentData = {}
    const nonce = '0'
    const executor = '0x' + '00'.repeat(19) + '11'
    const safeProxy = '0x' + '00'.repeat(19) + '22'
    const moduleProxy = '0x' + '00'.repeat(19) + '33'
    const uri = 'http://localhost'
    const arbitraryChain = true

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

    // Arbitrary approval
    deploymentData['5'] = {
      type: 'deployment',
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      uri,
      arbitraryChain,
      txs,
    }

    // Approve on OP Goerli
    deploymentData['420'] = {
      type: 'deployment',
      nonce,
      executor,
      safeProxy,
      moduleProxy,
      uri,
      arbitraryChain: false,
      txs,
    }

    expect(() => makeSphinxMerkleTree(deploymentData)).to.throw(
      'Detected conflicting approval and `arbitraryChain` === true `DeploymentData` entries.'
    )
  })
})
