// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Lib_MerkleTree } from "@eth-optimism/contracts/libraries/utils/Lib_MerkleTree.sol";
import { IChugSplashManager } from "./interfaces/IChugSplashManager.sol";
import { ActionProof } from "./ChugSplashDataTypes.sol";

contract ChugSplashAuth is AccessControl {
    struct ForwardRequest {
        uint256 chainId;
        address from;
        address to;
        uint256 nonce;
        bytes data;
    }

    IChugSplashManager public immutable manager;

    uint256 public ownerThreshold;

    // TODO: if upgradeable: add first require statement in Safe.sol:constructor

    constructor(address _manager, address[] memory _owners, uint256 _ownerThreshold) {
        require(_ownerThreshold > 0, "ChugSplashAuth: threshold must be greater than 0");
        require(
            _ownerThreshold <= _owners.length,
            "ChugSplashAuth: threshold exceeds number of owners"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "ChugSplashAuth: owner cannot be address(0)");
            _grantRole(DEFAULT_ADMIN_ROLE, owner);
        }
        manager = IChugSplashManager(_manager);
        ownerThreshold = _ownerThreshold;
    }

    // TODO: should we use Openzeppelin's roleAdmin functionality?

    // TODO: we should either disable all the AccessControl functions that we don't use or implement
    // the necessary functionality ourselves (or look at other libraries)

    function setProjectManager(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        (address _projectManager, bool _add) = abi.decode(_request.data, (address, bool));

        require(
            _projectManager != address(0),
            "ChugSplashAuth: project manager cannot be address(0)"
        );

        nonce += 1;

        _add
            ? _grantRole(PROJECT_MANAGER_ROLE, _projectManager)
            : _revokeRole(PROJECT_MANAGER_ROLE, _projectManager);
    }

    function exportProxy(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        (string memory projectName, string memory referenceName, address newOwner) = abi.decode(
            _request.data,
            (string, string, address)
        );

        nonce += 1;

        manager.exportProxy(projectName, referenceName, newOwner);
    }

    modifier isValidAuthAction(
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) {
        AuthAction memory authAction = authActions[_authRoot];
        require(
            authAction.status == AuthActionStatus.PROPOSED,
            "ChugSplashAuth: action must be proposed"
        );

        verifySignatures(
            _authRoot,
            _request,
            _threshold,
            _verifyingRole,
            _signatures,
            _proof,
            authAction.numLeafs
        );
        _;
    }

    function addProposer(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        address proposer = abi.decode(_request.data, (address));

        require(proposer != address(0), "ChugSplashAuth: proposer cannot be address(0)");

        nonce += 1;

        _grantRole(PROPOSER_ROLE_HASH, proposer);
    }

    

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

    // merkle root of auth tree => AuthAction
    mapping(bytes32 => AuthAction) public authActions;

    struct AuthBundle {
        bytes32 root;
        BundledAuthAction[] actions;
    }

    struct BundledAuthAction {
        AuthAction action;
        ActionProof proof;
    }

    struct AuthAction {
        AuthActionStatus status;
        uint256 numLeafs;
    }

    enum AuthActionStatus {
        EMPTY,
        PROPOSED,
        COMPLETED
    }

    bytes32 private constant PROPOSER_ROLE_HASH = keccak256("ProposerRole");

    bytes32 private constant PROJECT_MANAGER_ROLE = keccak256("ProjectManagerRole");

    // TODO: rm manager.propose

    // TODO: after writing every permissioned function: add a modifier or something that checks if
    // the authRoot has been proposed

    // TODO: require that the authRoots are different
    // TODO: input validation
    // TODO: must be signed by a proposer
    // function proposeAuthAction(bytes32 _proposedAuthRoot, ForwardRequest memory _request, bytes[] memory _signatures, ActionProof memory _proof) external {
    //     require(authActions[_authRoot].status == AuthActionStatus.EMPTY, "ChugSplashAuth: auth action not empty");
    //     authActions[_authRoot] = AuthAction({ status: AuthActionStatus.PROPOSED, numLeafs: _numLeafs });

    //     verifySignatures(_authRoot, _request, 1, PROPOSER_ROLE_HASH, _signatures, _proof, authAction.numLeafs);
    // }

    // TODO(docs): meta transaction must be signed by a project manager
    // TODO(docs): the call to `manager.setContractKind` will revert if any of the contracts already belong to a project
    function createProject(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _request, _signatures, _proof) {
        // TODO: rm _ from these vars
        (
            string memory _projectName,
            uint256 _threshold,
            address[] memory _projectOwners,
            ContractInfo[] memory _contractInfoArray
        ) = abi.decode(_request.data, (string, uint256, address[], ContractInfo[]));

        require(bytes(_projectName).length > 0, "ChugSplashAuth: project name cannot be empty");
        require(_threshold > 0, "ChugSplashAuth: threshold must be greater than 0");
        require(thresholds[_projectName] == 0, "ChugSplashAuth: project already exists");

        nonce += 1;

        thresholds[_projectName] = _threshold;

        bytes32 projectOwnerRoleHash = keccak256(abi.encodePacked(_projectName, "ProjectOwner"));
        uint256 numProjectOwners = _projectOwners.length;
        for (uint256 i = 0; i < numProjectOwners; i++) {
            address projectOwner = _projectOwners[i];
            require(
                projectOwner != address(0),
                "ChugSplashAuth: project owner cannot be address(0)"
            );
            _grantRole(projectOwnerRoleHash, projectOwner);
        }

        if (_contractInfoArray.length > 0) {
            manager.setContractInfo(_projectName, _contractInfoArray);
        }
    }

    uint256 public nonce;

    function verifySignatures(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes[] memory _signatures,
        ActionProof memory _proof,
        uint256 _numLeafs
    ) public {
        require(_signatures.length >= _threshold, "ChugSplashAuth: not enough signatures");

        uint256 merkleIndex = _proof.merkleIndex;
        bytes32[] memory merkleProof = _proof.merkleProof;

        address signer;
        address prevSigner = address(0);
        uint8 v;
        bytes32 r;
        bytes32 s;
        for (uint256 i = 0; i < _threshold; i++) {
            bytes memory signature = _signatures[i];
            require(signature.length == 65, "ChugSplashAuth: invalid signature length");

            // TODO: tell ryan that the `_signatures` array must yield 'from' addresses that are in
            // ascending order. this applies to every function on this contract that takes in `_signatures`

            signer = ECDSA.recover(_authRoot, signature);
            require(hasRole(_verifyingRole, signer), "ChugSplashAuth: unauthorized signer");
            require(signer > prevSigner, "ChugSplashAuth: duplicate signers");

            // Validate the fields of the ForwardRequest
            require(_request.from == signer, "ChugSplashAuth: invalid 'from' address");
            require(_request.to == address(manager), "ChugSplashAuth: invalid 'to' address");
            require(_request.chainId == block.chainid, "ChugSplashAuth: invalid chain id");
            require(_request.nonce == nonce, "ChugSplashAuth: invalid nonce");

            require(
                Lib_MerkleTree.verify(
                    _authRoot,
                    keccak256(_request.data),
                    merkleIndex,
                    merkleProof,
                    _numLeafs
                ),
                "ChugSplashAuth: invalid merkle proof"
            );

            prevSigner = signer;
        }
    }
}
