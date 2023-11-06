// SPDX-License-Identifier: MIT
// TODO: can this license be MIT given that we're interacting with an LGPL contract?
pragma solidity >=0.7.0 <0.9.0;

// TODO: consider having a SphinxModuleFactory. if we don't, it'd probably be pretty easy for a dev's local optimizer
// settings to mess with the address of the SphinxModule.

// TODO: import abstract Enum contract from Safe

// TODO: make sure that you import the safe contracts using a commit hash / version that was audited.

/**
 * @title SphinxModule
 * @custom:version 1.0.0 (TODO: correct version?)
 * @notice TODO(docs)
 */
contract SphinxModule {

    string public constant VERSION = "1.0.0";

    // TODO: add a version field according to the EIP-712 standard
    // TODO(docs): we use the version field in the EIP-712 typehash to prevent the possibility that the
    // same signed merkle root can be re-executed in future versions.
    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name)");

    bytes32 private constant DOMAIN_NAME_HASH = keccak256(bytes("Sphinx"));

    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(abi.encode(DOMAIN_TYPE_HASH, DOMAIN_NAME_HASH));

    bytes32 private constant TYPE_HASH = keccak256("MerkleRoot(bytes32 root)");

    // TODO(docs): we have a nonce to ensure that deployments can't be replayed.
    uint256 public currentNonce;

    uint256 public activeMerkleRoot;

    // TODO: change address to interface type here (but not in constructor). TODO(docs): this allows
    // contracts to deploy the SphinxModule without needing to import the Safe contract.
    address safeProxy;

    constructor(address _safeProxy) {
        safeProxy = _safeProxy;
    }

    // TODO(off-chain): check that the corresponding Safe is a valid version. (not sure which versions are "valid").

    // TODO(ask-ryan)
    // 1. There can only be one deployment at a time for each Safe. This simplifies the
    //    SphinxModule. Is that fine?
    // 2. Should we emit an event each time an action is executed? This doesn't seem necessary
    //    because we can use state variables to track how many leafs have been executed in the
    //    active deployment. If you're confident we won't use these events off-chain, we may want to
    //    remove them to save gas.

    // TODO(spec): the user must be able to cancel a deployment that has been approved off-chain but
    // not approved on-chain. they can do this by approving an empty deployment that has the same
    // nonce as the deployment that they'd like to cancel.
    // likewise, the user must be able to cancel a deployment that has been approved on-chain. they
    // can do this by approving a new Merkle root, which will cancel the previous deployment.
    // TODO(docs): we add a reentrancy guard because `safe.checkSignatures` may contain an external call
    // to another contract (in the EIP-1271 verification logic).
    function approve(
        bytes32 _root,
        Leaf memory _leaf,
        bytes32[] memory _proof,
        bytes memory _signatures
    ) public nonReentrant {
        // TODO: is there an audited version of any aspect of this line?
        bytes32 typedDataHash = ECDSAUpgradeable.toTypedDataHash(DOMAIN_SEPARATOR, keccak256(abi.encode(TYPE_HASH, _root)));
        safe.checkSignatures(typedDataHash, _signatures);

        // TODO(end): loop through each `require` statement in each function to see if you should add it to any of the other functions.

        // TODO: should the key be the root or the typedDataHash?
        DeploymentState storage state = deployments[_root];
        // TODO(docs): Verify the signatures. Since the Merkle root hasn't been approved before, we know that
        // there haven't been any leafs executed yet.
        _verifySignatures(_root, _leaf, _proof, 0);

        (uint256 nonce, uint256 numLeafs, address executor, string memory uri) = abi.decode(_leaf.data, (uint256, uint256, address, string));

        require(executor == msg.sender, "TODO: caller must be the executor selected by the owner(s)");
        require(nonce == currentNonce, "TODO: invalid nonce");
        require(numLeafs > 0, "TODO: there cannot be zero leafs in the Merkle tree");
        // TODO(docs): we don't perform any checks on the URI because it may be empty if numLeafs is 1.

        state = DeploymentState({
            numLeafs: numLeafs,
            leafsExecuted: 1,
            uri: uri,
            executor: executor
        });

        currentNonce += 1;

        activeMerkleRoot = numLeafs > 1 ? _root : bytes32(0);


        // TODO: emit events everywhere
    }

    // TODO(end): include the `deployments` function in SphinxManager if you have dynamic arrays in DeploymentState

    // TODO(docs): we require that any ETH transfers occur in the `execute` function. we don't have
    // a mechanism for sending ETH to this contract in advance because it'd be possible for the ETH
    // to be sent, then the deployment is cancelled, leaving ETH stuck in this contract.

    // TODO(docs): we return `results` so that we can display a useful error message to the user in
    // case an action fails.
    function execute(
        Leaf[] memory _leafs,
        bytes32[][] memory _proofs
    ) public nonReentrant payable returns (Result[] memory results) {
        require(_leafs.length == _proofs.length, "TODO: number of leafs does not match number of Merkle proofs");
        uint256 numActions = _leafs.length;
        require(numActions > 0, "TODO: leafs array is empty");
        require(activeMerkleRoot != bytes32(0), "TODO: no deployment is currently active");

        DeploymentState storage state = deployments[activeMerkleRoot];

        require(state.executor == msg.sender, "TODO: caller must be the executor selected by the owner(s)");

        results = new Result[](numActions);
        Leaf memory leaf;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numActions; i++) {
            leaf = _leafs[i];
            proof = _proofs[i];

            _verifySignatures(activeMerkleRoot, leaf, proof, state.leafsExecuted);

            // TODO: handle value > 0.

            (address to, uint256 value, bytes memory data, Enum.Operation operation) = abi.decode(_leaf.data, (address, uint256, bytes, Enum.Operation));

            state.leafsExecuted += 1;

            Result memory result = results[i];
            (result.success, result.returnData) = safe.execTransactionFromModuleReturnData(
                to,
                value,
                data,
                operation
            );

            // TODO: handle failed action. see Safe then SphinxManager.executeInitialActions.

            // TODO: emit an event upon failure, and set status to FAILED. perhaps see the old SphinxManager
            // to be thorough.

            // TODO(test): see if there are any noteworthy chains that don't support create3. recently,
            // we discovered a chain that has an alternate create3 formula, although i forget its name.
            // we should consider modifying an existing create3 library and auditing our version to support
            // alternate formulas.

            // TODO: emit event
        }

        // TODO: add the logic in Safe.execTransaction.

        if (state.leafsExecuted == state.numLeafs) {
            activeMerkleRoot = bytes32(0);
            // TODO: emit event
        }
    }

    // TODO(test): run the test suite using all supported versions of SafeL2.
    // TODO(test): see if we support "atomic" create3 (i.e. the 'create2' and 'call' actions are guaranteed to be in the same txn).

    /**
     * @notice TODO(docs)
     */
    function _verifySignatures(
        bytes32 _root,
        Leaf memory _leaf,
        bytes32[] memory _proof,
        uint256 _leafsExecuted
    ) internal view {
        // TODO: consider validating that the merkle tree isn't empty.

        // TODO: figure out how to validate these fields: (uint256 value,uint256 gas)

        // Validate the fields of the Leaf.
        if (_leaf.to != address(safe)) revert InvalidToAddress();
        if (_leaf.chainId != block.chainid) revert InvalidChainId();
        if (_leaf.index != leafsExecuted) revert InvalidLeafIndex();

        // TODO: all of these libraries should be non-upgradeable
        if (!MerkleProofUpgradeable.verify(_proof, _root, _getLeafHash(_leaf)))
            revert InvalidMerkleProof();
    }

    // TODO(test): compile the contracts repo using the earliest expected version, like you do in the plugins package.
    // this function will error because `bytes.concat` isn't supported by earlier versions of Solidity.
    // TODO: why do we double hash? i believe openzeppelin recommends this to prevent some sort of vulnerability.
    // we should make sure that we do it correctly, and document why we do it.
    function _getLeafHash(Leaf memory _leaf) internal pure returns (bytes32) {
        return
            keccak256(
                bytes.concat(
                    keccak256(abi.encode(_leaf.chainId, _leaf.to, _leaf.index, _leaf.data))
                )
            );
    }
}
