// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// TODO(spec): how does the executor find out about deployments? is this method grief-proof?

// TODO(spec): perhaps mention somewhere that the executor cannot lose money on a deployment because
// it withdraws enough USDC to cover the deployment, including a buffer, before it submits any
// transactions.

import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {
    SphinxLeafType,
    SphinxLeaf,
    SphinxLeafWithProof,
    Result,
    DeploymentState,
    DeploymentStatus
} from "./SphinxDataTypes.sol";
import { console } from "sphinx-forge-std/console.sol";

// TODO(break): actors:
// - malicious safe (finished)
// - malicious third-party (finished)
// - buggy executor (finished): the first two bullet points of 'malicious executor'
// - malicious executor:
//      - wait an arbitrary amount of time to approve then execute a deployment.
//      - partially execute a deployment.
//      - users can cancel deployments, but it's possible for the executor to approve a deployment
//        once the user has signaled intent to cancel the deployment. i.e. the executor can watch
//        for the 'cancel' transaction in the mempool, and submit the 'approve' transaction before
//        it.
//      - if a deployment relies on the state of an existing smart contract, and if the executor is
//        able to manipulate the state of that smart contract, then it could be possible for the
//        executor to execute the deployment in a manner that is detrimental to the user. a simple
//        example: a deployment relies on `existingContract.myBoolean() == true`, otherwise it
//        fails. if the executor is able to set `existingContract.myBoolean() == false`, then the
//        deployment will fail.
//      - the executor can interact with a contract in the same transaction that it's deployed,
//        which can be an "unfair advantage" for the executor. for example, if a deployed contract
//        has an open token airdrop, the executor can deploy the contract then claim the airdropped
//        tokens in the same transaction, before any other account has a chance to claim them.

/**
 * @title SphinxModule
 * @notice TODO(docs)
 */
contract SphinxModule is ReentrancyGuard, Enum {
    event SphinxDeploymentApproved(
        bytes32 indexed merkleRoot,
        bytes32 indexed previousActiveRoot,
        uint256 indexed nonce,
        address executor,
        uint256 numLeafs,
        string uri
    );

    event SphinxDeploymentCompleted(bytes32 indexed merkleRoot);

    event SphinxDeploymentCancelled(bytes32 indexed merkleRoot);

    event SphinxActionExecuted(bytes32 indexed merkleRoot, uint256 leafIndex);

    event SphinxDeploymentFailed(bytes32 indexed merkleRoot, uint256 leafIndex);

    string public constant VERSION = "1.0.0";

    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(abi.encode(keccak256("EIP712Domain(string name)"), keccak256(bytes("Sphinx"))));

    bytes32 private constant TYPE_HASH = keccak256("MerkleRoot(bytes32 root)");

    mapping(bytes32 => DeploymentState) public deployments;

    // TODO(docs): we have a nonce to make it possible for a user to cancel a deployment
    // that has been signed by the owners off-chain, but not approved on-chain. to do this,
    // the user must submit a deployment with the same nonce as the deployment that they'd
    // like to cancel.
    uint256 public currentNonce;

    bytes32 public activeRoot;

    GnosisSafe public safeProxy;

    // TODO(docs): this allows contracts to deploy the SphinxModule without needing to import the
    // Safe contract type.
    constructor(address _safeProxy) {
        safeProxy = GnosisSafe(payable(_safeProxy));
    }

    // TODO(off-chain): check that the corresponding Safe is a valid version. (not sure which versions are "valid").

    // TODO(H-invariant):
    // - a merkle root can only be used once per deployment, per chain.
    // - each leaf within a merkle tree can only be submitted once.
    // - only a single deployment can occur at a time.
    // - the SphinxModule must be compatible with:
    //      - GnosisSafe v1.3.0
    //      - GnosisSafeL2 v1.3.0
    //      - Safe v1.4.1
    //      - SafeL2 v1.4.1

    // TODO(refactor): for all contract dependencies, you should use an exact version. otherwise,
    // it'd probably be possible for the bytecode of our contracts to change.

    // TODO(invariant):
    // - must revert if a merkle root equals the zero hash (bytes32(0))
    // - must revert if a merkle root was previously approved.
    // - must revert if the leaf is not valid:
    //      - revert if the leaf type is not 'approve'
    //      - revert if the leaf's chain ID field does not match the `block.chainid`
    //      - revert if the leaf is not executed in the correct order
    //      - revert if the leaf is not part of the merkle tree
    // - the decoded leaf data must satisfy the following conditions:
    //      - revert if the 'safe' does not equal the hard-coded safe address in the SphinxModule
    //      - revert if the 'module' does not equal the address of the SphinxModule
    //      - revert if the 'nonce' does not equal the current nonce in the SphinxModule
    //      - revert if the 'numLeafs' equals 0
    //      - revert if the 'executor' does not equal the caller
    // - must revert if an insufficient number of Gnosis Safe owners have signed the merkle root.
    // - must be possible to cancel a deployment that has been signed by the owners off-chain, but
    //   not approved on-chain.
    // - must be possible to cancel an active deployment by approving a new deployment.
    // - a deployment that contains a single leaf on a chain (i.e. just an approval leaf) must be
    //   marked as completed in this function.

    // TODO(flow-chart): update this with 'cancelled' and any other DeploymentStatuses.
    // ```mermaid
    // graph TD
    //     style C fill:#ffff99,stroke:#cccc00,stroke-width:2px
    //     style B fill:#99ff99,stroke:#00cc00,stroke-width:2px
    //     style F fill:#ff9999,stroke:#cc0000,stroke-width:2px
    //     Approve --> A[Is there one leaf in the merkle tree for the current chain?]
    //     A -->|Yes| B[Completed]
    //     A -->|No| C[Approved]
    //     C --> D[Execute]
    //     D --> E[Did the Safe txn fail and does the leaf specify that it must succeed?]
    //     E -->|Yes| F[Failed]
    //     E -->|No| G[Are there any more leafs to execute for the current chain in this deployment?]
    //     G -->|Yes| D
    //     G -->|No| B
    // ```

    // TODO(spec): the user must be able to cancel a deployment that has been approved off-chain but
    // not approved on-chain. they can do this by approving an empty deployment that has the same
    // nonce as the deployment that they'd like to cancel. for this reason, we don't check that
    // there isn't an active deployment.
    // likewise, the user must be able to cancel a deployment that has been approved on-chain. they
    // can do this by approving a new Merkle root, which will cancel the previous deployment.
    // TODO(docs): we add a reentrancy guard because `safe.checkSignatures` may contain an external call
    // to another contract (in the EIP-1271 verification logic).
    function approve(
        bytes32 _root,
        SphinxLeaf memory _leaf,
        bytes32[] memory _proof,
        bytes memory _signatures
    )
        public
        nonReentrant
    {
        require(_root != bytes32(0), "SphinxModule: invalid root");

        // TODO(docs): without this check, it'd be possible to approve a Merkle root twice by
        // including two 'approval' leafs in the tree.
        require(deployments[_root].numLeafs == 0, "SphinxModule: root already used");

        // TODO(docs): Verify the signatures. We already checked that the `numLeafs` for this Merkle root is 0,
        // so we hard-code this value in this call.
        _validateLeaf(_root, _leaf, _proof, 0, SphinxLeafType.APPROVE);

        // TODO(docs): we include the address of the safe in this leaf to protect against a
        // vulnerability where you could attack a Safe with the same owners using a
        // tree that was signed for a previous deployment through a different Safe.
        // TODO(docs): We include the address of the `SphinxModule` to prevent a vulnerability where
        // every deployment in a Safe could be re-executed if it adds a new SphinxModule after
        // executing deployments in a different SphinxModule.
        (address safe, address module, uint256 nonce, uint256 numLeafs, address executor, string memory uri) =
            abi.decode(_leaf.data, (address, address, uint256, uint256, address, string));

        require(safe == address(safeProxy), "SphinxModule: invalid SafeProxy");
        require(module == address(this), "SphinxModule: invalid SphinxModule");
        require(nonce == currentNonce, "SphinxModule: invalid nonce");
        require(numLeafs > 0, "SphinxModule: tree has no leafs");
        require(executor == msg.sender, "SphinxModule: caller isn't executor");
        // TODO(docs): we don't perform any checks on the URI because it may be empty if numLeafs is 1.

        if (activeRoot != bytes32(0)) {
            // TODO(docs): we don't need to assign the activeRoot to a new value here because we do
            // it later in this function.
            deployments[activeRoot].status = DeploymentStatus.CANCELLED;
            emit SphinxDeploymentCancelled(activeRoot);
        }

        emit SphinxDeploymentApproved(_root, activeRoot, nonce, executor, numLeafs, uri);

        DeploymentState storage state = deployments[_root];
        // TODO(docs): assign values to all fields of the DeploymentState except for the `status`,
        // which will be assigned in the code block below (TODO(docs): <- awkward phrasing).
        state.numLeafs = numLeafs;
        state.leafsExecuted = 1;
        state.uri = uri;
        state.executor = executor;

        if (numLeafs == 1) {
            state.status = DeploymentStatus.COMPLETED;
            activeRoot = bytes32(0);
            emit SphinxDeploymentCompleted(_root);
        } else {
            state.status = DeploymentStatus.APPROVED;
            activeRoot = _root;
        }

        currentNonce += 1;

        // TODO(docs): we do this last to follow the CEI pattern. i think it's possible
        // for an external call to happen within 'checkSignatures' due to eip-1271 logic.
        bytes memory typedData = abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(TYPE_HASH, _root)));
        safeProxy.checkSignatures(keccak256(typedData), typedData, _signatures);
    }

    // TODO(docs): we require that any ETH transfers occur in the `execute` function. we don't have
    // a mechanism for sending ETH to this contract in advance because it'd be possible for the ETH
    // to be sent, then the deployment is cancelled, leaving ETH stuck in this contract.

    // TODO(test-e2e): enable two SphinxModules in a single Gnosis Safe, and execute a deployment
    // through each one.

    // TODO(docs): execute function: we return `results` so that we can display a useful error
    // message to the user in case an action fails.

    // TODO: our default recommended Safe should probably include a reentrancy guard.

    // TODO(invariant):
    // - must revert if zero leafs are provided as an input parameter.
    // - must revert if there is no active deployment (i.e. a merkle root hasn't been approved).
    // - must revert if the caller isn't the executor that was stored on-chain in the `approve` function.
    // - must revert if the leaf is not valid:
    //      - revert if the leaf type is not 'execute'
    //      - revert if the leaf's chain ID field does not match the `block.chainid`
    //      - revert if the leaf is not executed in the correct order
    //      - revert if the leaf is not part of the merkle tree
    // - must revert if a merkle leaf does not yield a merkle root, given a proof.
    // - the executor must not be able to cause a deployment to fail or cause one of the user's
    //   transactions to revert.
    // - it must be impossible to submit a leaf that is not part of the active merkle root.
    // - the transaction must be executed on the Safe using the exact data that was included in
    //   the leaf.
    // - it must not be possible to execute more leafs than the `numLeafs` field that was stored
    //   on-chain in the approval function.
    // - if a Safe transaction fails and the decoded leaf data contains `requireSuccess == true`,
    //   the deployment must end immediately, preventing any future transactions from being executed for the
    //   merkle root.
    // - if all of the leafs for the current chain are executed without the previous condition occurring, the
    //   deployment must be marked as 'completed':
    //      - emit event
    //      - the active merkle root is removed, allowing future deployments to occur.
    // - a `Result[]` must be returned for every Safe transaction that was attempted, regardless of whether
    //   or not it succeeded.
    // Trust assumptions:
    // - (is this true?) a malicious Safe could grief the executor by causing execution to revert.
    //   they could do this by doing `address(0).call{ gas: 10000000000}()` one of the transactions
    //   being executed. this is fine; the user will be billed for all of the executor's gas costs.
    function execute(SphinxLeafWithProof[] memory _leafsWithProofs)
        public
        nonReentrant
        returns (Result[] memory results)
    {
        uint256 numActions = _leafsWithProofs.length;
        require(numActions > 0, "SphinxModule: no leafs to execute");
        require(activeRoot != bytes32(0), "SphinxModule: no active root");

        DeploymentState storage state = deployments[activeRoot];

        require(state.executor == msg.sender, "SphinxModule: caller isn't executor");

        results = new Result[](numActions);
        SphinxLeaf memory leaf;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numActions; i++) {
            leaf = _leafsWithProofs[i].leaf;
            proof = _leafsWithProofs[i].proof;

            // TODO(docs): without this check, it'd be possible to execute more than `numLeafs` leafs.
            require(state.numLeafs > state.leafsExecuted, "SphinxModule: extra leafs not allowed");

            _validateLeaf(activeRoot, leaf, proof, state.leafsExecuted, SphinxLeafType.EXECUTE);

            (address to, uint256 value, uint256 gas, bytes memory txData, Enum.Operation operation, bool requireSuccess)
            = abi.decode(leaf.data, (address, uint256, uint256, bytes, Enum.Operation, bool));

            Result memory result = results[i];
            (result.success, result.returnData) =
                safeProxy.execTransactionFromModuleReturnData{ gas: gas }(to, value, txData, operation);

            if (!result.success && requireSuccess) {
                state.status = DeploymentStatus.FAILED;
                activeRoot = bytes32(0);
                emit SphinxDeploymentFailed(activeRoot, leaf.index);
                return results;
            } else {
                state.leafsExecuted += 1;
                emit SphinxActionExecuted(activeRoot, leaf.index);
            }

            // TODO(test): see if there are any noteworthy chains that don't support create3. recently,
            // we discovered a chain that has an alternate create3 formula, although i forget its name.
            // we should consider modifying an existing create3 library and auditing our version to support
            // alternate formulas.
        }

        if (state.leafsExecuted == state.numLeafs) {
            state.status = DeploymentStatus.COMPLETED;
            activeRoot = bytes32(0);
            emit SphinxDeploymentCompleted(activeRoot);
        }
    }

    // TODO(test): run the test suite using all supported versions of SafeL2.
    // TODO(test): see if we support "atomic" create3 (i.e. the 'create2' and 'call' actions are guaranteed to be in the
    // same txn).

    /**
     * @notice TODO(docs)
     */
    function _validateLeaf(
        bytes32 _root,
        SphinxLeaf memory _leaf,
        bytes32[] memory _proof,
        uint256 _leafsExecuted,
        SphinxLeafType _expectedLeafType
    )
        internal
        view
    {
        // Validate the fields of the Leaf.
        require(_leaf.leafType == _expectedLeafType, "SphinxModule: invalid leaf type");
        require(_leaf.chainId == block.chainid, "SphinxModule: invalid chain id");
        require(_leaf.index == _leafsExecuted, "SphinxModule: invalid leaf index");

        require(MerkleProof.verify(_proof, _root, _getLeafHash(_leaf)), "SphinxModule: invalid merkle proof");
    }

    // TODO(test): the `yarn test:solc` test in the plugins package should be in the contracts repo
    // too.

    // TODO(docs): the leaf is double hashed to prevent a second preimage attack.
    function _getLeafHash(SphinxLeaf memory _leaf) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(keccak256(abi.encode(_leaf))));
    }
}
