// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract ChugSplashAuth is AccessControl {
    // TODO: rm unnecessary fields
    struct ForwardRequest {
        // address from;
        address to;
        uint256 chainId;
        // uint256 value;
        // uint256 gas;
        uint256 nonce;
        bytes data;
    }

    IChugSplashManager public immutable manager;

    constructor(address _manager) {
        manager = _manager;
    }

    function approveDeployment() external {}

    // TODO: mv or rm
    struct ContractInfoWithReferenceName {
        string referenceName;
        address addr;
        bytes32 contractKindHash;
    }
    struct ContractInfo {
        address addr;
        bytes32 contractKindHash;
    }

    // projectName => threshold
    mapping(string => uint256) public thresholds;

    // TODO(docs): meta transaction must be signed by a project manager
    // TODO: validate contents of forwardrequest
    // TODO: you need to throw an error if a contract already exists in another project
    function createProject(ForwardRequest memory _request, bytes32[][] memory _proofs) public {
        (
            string memory _projectName,
            uint256 _threshold,
            address[] memory _projectOwners,
            address[] memory _projectProposers,
            ContractInfo[] memory _contractInfoArray
        ) = abi.decode(_request.data, (string, uint256, address[], address[], ContractInfo[]));

        require(bytes(_projectName).length > 0, "ChugSplashAuth: project name cannot be empty");
        require(_threshold > 0, "ChugSplashAuth: threshold must be greater than 0");
        require(thresholds[_projectName] == 0, "ChugSplashAuth: project already exists");

        string memory projectManagerRole = string(abi.encodePacked(_projectName, "ProjectManager"));
        verifySignatures(keccak256(_request.data), 1, projectManagerRole, _proofs);

        thresholds[_projectName] = _threshold;

        string memory projectOwnerRole = string(abi.encodePacked(_projectName, "ProjectOwner"));
        uint256 numProjectOwners = _projectOwners.length;
        for (uint256 i = 0; i < numProjectOwners; i++) {
            address projectOwner = _projectOwners[i];
            require(
                projectOwner != address(0),
                "ChugSplashAuth: project owner cannot be address(0)"
            );
            _grantRole(projectOwnerRole, projectOwner);
        }

        string memory projectProposerRole = string(
            abi.encodePacked(_projectName, "ProjectProposer")
        );
        uint256 numProjectProposers = _projectProposers.length;
        for (uint256 i = 0; i < numProjectProposers; i++) {
            address projectProposer = _projectProposers[i];
            require(
                projectProposer != address(0),
                "ChugSplashAuth: project proposer cannot be address(0)"
            );
            _grantRole(projectProposerRole, projectProposer);
        }

        if (_contractInfoArray.length > 0) {
            manager.setContractInfo(_projectName, _contractInfoArray);
        }
    }

    mapping(address => uint256) public nonces;

    // TODO: increment nonce

    function verifySignatures(
        uint256 _threshold,
        string memory _role,
        bytes[] memory _signatures,
        bytes32 _merkleRoot,
        bytes32 _leaf,
        bytes[][] memory _merkleProofs
    ) public {
        address signer;
        address prevSigner = address(0);
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 merkleIndex;
        uint256 prevMerkleIndex = 0;
        for (uint256 i = 0; i < threshold; i++) {
            bytes memory signature = _signatures[i];
            require(signature.length == 65, "ChugSplashAuth: invalid signature length");

            // TODO: assign v r s
            // TODO: tell ryan that the signer addresses must be in ascending order

            signer = ecrecover(_merkleRoot, v, r, s);
            require(hasRole(_role, signer), "ChugSplashAuth: unauthorized signer");
            require(signer > prevSigner, "ChugSplashAuth: duplicate signers");

            // Validate the fields of the ForwardRequest
            require(_request.to == address(manager), "ChugSplashAuth: invalid 'to' address");
            require(_request.chainId == block.chainid, "ChugSplashAuth: invalid chain id");
            require(_request.nonce == nonces[signer], "ChugSplashAuth: invalid nonce");

            prevSigner = signer;

            merkleIndex = _merkleIndexes[i];
            require(
                MerkleTree.verify(_merkleRoot, _leaf, merkleIndex, proof, deployment.targets),
                "ChugSplashAuth: invalid merkle proof"
            );
        }
    }
}
