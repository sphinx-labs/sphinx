// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { console } from "sphinx-forge-std/console.sol"; // TODO(end): rm

import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {
    SphinxLeafType,
    SphinxLeaf,
    SphinxLeafWithProof,
    Result,
    DeploymentState
} from "./SphinxDataTypes.sol";

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

    event SphinxActionExecuted(bytes32 indexed merkleRoot, uint256 leafIndex);

    event SphinxDeploymentFailed(bytes32 indexed merkleRoot, uint256 leafIndex);

    string public constant VERSION = "1.0.0";

    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256(bytes("Sphinx")),
                keccak256(bytes(VERSION))
            )
        );

    bytes32 private constant TYPE_HASH = keccak256("MerkleRoot(bytes32 root)");

    mapping(bytes32 => DeploymentState) public deployments;

    // TODO(docs): we have a nonce to ensure that deployments can't be replayed.
    uint256 public currentNonce;

    bytes32 public activeRoot;

    GnosisSafe safeProxy;

    // TODO(docs): this allows contracts to deploy the SphinxModule without needing to import the
    // Safe contract type.
    constructor(address _safeProxy) {
        safeProxy = GnosisSafe(payable(_safeProxy));
    }

    // TODO(off-chain): check that the corresponding Safe is a valid version. (not sure which versions are "valid").

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
    ) public nonReentrant {
        require(_root != bytes32(0), "SP011");

        bytes memory typedData = abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPE_HASH, _root))
        );
        safeProxy.checkSignatures(keccak256(typedData), typedData, _signatures);

        // TODO(docs): Verify the signatures. Since the Merkle root hasn't been approved before, we know that
        // there haven't been any leafs executed yet.
        _verifySignatures(_root, _leaf, _proof, 0, SphinxLeafType.APPROVE);

        // TODO(docs): we include the address of the safe in this leaf to protect against a
        // vulnerability where you could attack a Safe with the same owners using a
        // tree that was signed for a previous deployment through a different Safe.
        // TODO(docs): We include the address of the `SphinxModule` to prevent a vulnerability where
        // every deployment in a Safe could be re-executed if it adds a new SphinxModule after
        // executing deployments in a different SphinxModule.
        (
            address safe,
            address module,
            uint256 nonce,
            uint256 numLeafs,
            address executor,
            string memory uri
        ) = abi.decode(_leaf.data, (address, address, uint256, uint256, address, string));

        require(safe == address(safeProxy), "SP000");
        require(module == address(this), "SP001");
        require(nonce == currentNonce, "SP003");
        require(numLeafs > 0, "SP004");
        require(executor == msg.sender, "SP002");
        // TODO(docs): we don't perform any checks on the URI because it may be empty if numLeafs is 1.

        deployments[_root] = DeploymentState({
            numLeafs: numLeafs,
            leafsExecuted: 1,
            uri: uri,
            executor: executor
        });

        emit SphinxDeploymentApproved(_root, activeRoot, nonce, executor, numLeafs, uri);

        currentNonce += 1;

        if (numLeafs == 1) {
            emit SphinxDeploymentCompleted(_root);
            activeRoot = bytes32(0);
        } else {
            activeRoot = _root;
        }
    }

    // TODO(docs): we require that any ETH transfers occur in the `execute` function. we don't have
    // a mechanism for sending ETH to this contract in advance because it'd be possible for the ETH
    // to be sent, then the deployment is cancelled, leaving ETH stuck in this contract.

    // TODO(docs): we return `results` so that we can display a useful error message to the user in
    // case an action fails.
    function execute(
        SphinxLeafWithProof[] memory _leafsWithProofs
    ) public nonReentrant returns (Result[] memory results) {
        uint256 numActions = _leafsWithProofs.length;
        require(numActions > 0, "SP005");
        require(activeRoot != bytes32(0), "SP006");

        DeploymentState storage state = deployments[activeRoot];

        require(state.executor == msg.sender, "SP002");

        results = new Result[](numActions);
        SphinxLeaf memory leaf;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numActions; i++) {
            leaf = _leafsWithProofs[i].leaf;
            proof = _leafsWithProofs[i].proof;

            _verifySignatures(activeRoot, leaf, proof, state.leafsExecuted, SphinxLeafType.EXECUTE);

            (
                address to,
                uint256 value,
                uint256 gas,
                bytes memory txData,
                Enum.Operation operation
            ) = abi.decode(leaf.data, (address, uint256, uint256, bytes, Enum.Operation));

            Result memory result = results[i];
            (result.success, result.returnData) = safeProxy.execTransactionFromModuleReturnData{
                gas: gas
            }(to, value, txData, operation);

            if (result.success) {
                state.leafsExecuted += 1;
                emit SphinxActionExecuted(activeRoot, leaf.index);
            } else {
                activeRoot = bytes32(0);
                emit SphinxDeploymentFailed(activeRoot, leaf.index);
                return results;
            }

            // TODO(test): use erc1167 proxy? if so, you probably don't need these SPXXX error codes.

            // TODO(test): see if there are any noteworthy chains that don't support create3. recently,
            // we discovered a chain that has an alternate create3 formula, although i forget its name.
            // we should consider modifying an existing create3 library and auditing our version to support
            // alternate formulas.
        }

        if (state.leafsExecuted == state.numLeafs) {
            emit SphinxDeploymentCompleted(activeRoot);
            activeRoot = bytes32(0);
        }
    }

    // TODO(test): run the test suite using all supported versions of SafeL2.
    // TODO(test): see if we support "atomic" create3 (i.e. the 'create2' and 'call' actions are guaranteed to be in the same txn).

    /**
     * @notice TODO(docs)
     */
    function _verifySignatures(
        bytes32 _root,
        SphinxLeaf memory _leaf,
        bytes32[] memory _proof,
        uint256 _leafsExecuted,
        SphinxLeafType _expectedLeafType
    ) internal view {
        // Validate the fields of the Leaf.
        require(_leaf.chainId == block.chainid, "SP007");
        require(_leaf.index == _leafsExecuted, "SP008");
        require(_leaf.leafType == _expectedLeafType, "SP009");

        bytes32 TODO = _getLeafHash(_leaf);
        require(MerkleProof.verify(_proof, _root, TODO), "SP010");
    }

    // TODO(test): the `yarn test:solc` test in the plugins package should be in the contracts repo
    // too.

    // TODO(docs): the leaf is double hashed to prevent a second preimage attack.
    function _getLeafHash(SphinxLeaf memory _leaf) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(keccak256(abi.encode(_leaf.chainId, _leaf.index, _leaf.leafType, _leaf.data))));
    }
}
