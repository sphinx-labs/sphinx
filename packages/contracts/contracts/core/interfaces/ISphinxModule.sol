// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { SphinxLeafWithProof, DeploymentStatus } from "../SphinxDataTypes.sol";
// TODO: replace with IGnosisSafe
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";

interface ISphinxModule {
    event SphinxActionFailed(bytes32 indexed merkleRoot, uint256 leafIndex);
    event SphinxActionSucceeded(bytes32 indexed merkleRoot, uint256 leafIndex);
    event SphinxDeploymentApproved(
        bytes32 indexed merkleRoot,
        bytes32 indexed previousActiveRoot,
        uint256 indexed nonce,
        address executor,
        uint256 numLeafs,
        string uri
    );
    event SphinxDeploymentCancelled(bytes32 indexed merkleRoot);
    event SphinxDeploymentCompleted(bytes32 indexed merkleRoot);
    event SphinxDeploymentFailed(bytes32 indexed merkleRoot, uint256 leafIndex);

    function VERSION() external view returns (string memory);
    function activeMerkleRoot() external view returns (bytes32);
    function approve(
        bytes32 _root,
        SphinxLeafWithProof memory _leafWithProof,
        bytes memory _signatures
    ) external;
    function currentNonce() external view returns (uint256);
    function deployments(
        bytes32
    )
        external
        view
        returns (
            uint256 numLeafs,
            uint256 leafsExecuted,
            string memory uri,
            address executor,
            DeploymentStatus status,
            bool arbitraryChain
        );
    function execute(
        SphinxLeafWithProof[] memory _leafsWithProofs
    ) external returns (DeploymentStatus);
    function safeProxy() external view returns (GnosisSafe);
}
