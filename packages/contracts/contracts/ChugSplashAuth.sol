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

    // TODO: input validation
    function propose(
        bytes32 _authRootToVerify,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
        isValidAuthAction(1, PROPOSER_ROLE, _authRootToVerify, _request, _signatures, _proof)
    {
        (bytes32 authRootToPropose, uint256 numActions, uint256 numLeafs) = abi.decode(
            _request.data,
            (bytes32, uint256, uint256)
        );

        require(
            authStates[authRootToPropose].status == AuthActionStatus.EMPTY,
            "ChugSplashAuth: auth action not empty"
        );
        require(authRootToPropose != bytes32(0), "ChugSplashAuth: auth root cannot be address(0)");
        require(numLeafs > 0, "ChugSplashAuth: numLeafs must be greater than 0");
        // This check enforces expected user behavior, which is that one auth root will be signed
        // by a proposer, and another auth root will be signed by another role after the proposal.
        require(authRootToPropose != _authRootToVerify, "ChugSplashAuth: auth roots cannot match");

        authStates[authRootToPropose] = AuthState({
            status: AuthActionStatus.PROPOSED,
            numActions: numActions,
            numLeafs: numLeafs,
            actionsExecuted: 0
        });
    }

    // TODO: we should either disable all the AccessControl functions that we don't use or implement
    // the necessary functionality ourselves (or look at other libraries)

    function setProjectManager(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        (address projectManager, bool add) = abi.decode(_request.data, (address, bool));

        require(
            projectManager != address(0),
            "ChugSplashAuth: project manager cannot be address(0)"
        );

        add
            ? _grantRole(PROJECT_MANAGER_ROLE, projectManager)
            : _revokeRole(PROJECT_MANAGER_ROLE, projectManager);
    }

    function setOwner(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        (address owner, bool add) = abi.decode(_request.data, (address, bool));

        require(owner != address(0), "ChugSplashAuth: owner cannot be address(0)");

        add ? _grantRole(DEFAULT_ADMIN_ROLE, owner) : _revokeRole(DEFAULT_ADMIN_ROLE, owner);
    }

    // TODO: events

    function setOwnerThreshold(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        uint256 newThreshold = abi.decode(_request.data, (uint256));

        require(newThreshold > 0, "ChugSplashAuth: threshold cannot be 0");

        ownerThreshold = newThreshold;
    }

    // TODO: do you have logic for adding and removing each role?

    function exportProxy(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
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
        AuthState memory authState = authStates[_authRoot];
        require(
            authState.status == AuthActionStatus.PROPOSED,
            "ChugSplashAuth: action must be proposed"
        );

        verifySignatures(
            _authRoot,
            _request,
            _threshold,
            _verifyingRole,
            _signatures,
            _proof,
            authState.numLeafs
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
        incrementNonce
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

        _grantRole(PROPOSER_ROLE, proposer);
    }

    // TODO: change name to "updateState"
    modifier incrementNonce(bytes32 _authRoot) {
        _;
        nonce += 1;
        AuthState memory authState = authStates[_authRoot];
        authState.actionsExecuted += 1;
        if (authState.actionsExecuted == authState.numActions) {
            authState.status = AuthActionStatus.COMPLETED;
            // emit AuthActionCompleted(...);
        }
    }

    function updateProject(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        (
            string memory projectName,
            address[] memory projectOwnersToRemove,
            uint256 newThreshold,
            address[] memory newProjectOwners
        ) = abi.decode(_request.data, (string, address[], uint256, address[]));

        require(bytes(projectName).length > 0, "ChugSplashAuth: project name cannot be empty");
        require(newThreshold > 0, "ChugSplashAuth: threshold must be greater than 0");
        require(thresholds[projectName] > 0, "ChugSplashAuth: project does not exist");

        thresholds[projectName] = newThreshold;

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));

        uint256 numRemoved = projectOwnersToRemove.length;
        for (uint256 i = 0; i < numRemoved; i++) {
            _revokeRole(projectOwnerRole, projectOwnersToRemove[i]);
        }

        uint256 numAdded = newProjectOwners.length;
        for (uint256 i = 0; i < numAdded; i++) {
            _grantRole(projectOwnerRole, newProjectOwners[i]);
        }
    }

    // TODO: check that you always increment the nonce

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

    // merkle root of auth tree => AuthState
    mapping(bytes32 => AuthState) public authStates;

    struct AuthState {
        AuthActionStatus status;
        uint256 actionsExecuted;
        uint256 numActions;
        uint256 numLeafs;
    }

    enum AuthActionStatus {
        EMPTY,
        PROPOSED,
        COMPLETED
    }

    bytes32 private constant PROPOSER_ROLE = keccak256("ProposerRole");

    bytes32 private constant PROJECT_MANAGER_ROLE = keccak256("ProjectManagerRole");

    // TODO: rm manager.propose

    // TODO: after writing every permissioned function: add a modifier or something that checks if
    // the authRoot has been proposed

    // TODO(docs): meta transaction must be signed by a project manager
    // TODO(docs): the call to `manager.setContractKind` will revert if any of the contracts already belong to a project
    function createProject(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _request, _signatures, _proof)
    {
        (
            string memory projectName,
            uint256 threshold,
            address[] memory projectOwners,
            ContractInfo[] memory contractInfoArray
        ) = abi.decode(_request.data, (string, uint256, address[], ContractInfo[]));

        require(bytes(projectName).length > 0, "ChugSplashAuth: project name cannot be empty");
        require(threshold > 0, "ChugSplashAuth: threshold must be greater than 0");
        require(thresholds[projectName] == 0, "ChugSplashAuth: project already exists");

        thresholds[projectName] = threshold;

        bytes32 projectOwnerRoleHash = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        uint256 numProjectOwners = projectOwners.length;
        for (uint256 i = 0; i < numProjectOwners; i++) {
            address projectOwner = projectOwners[i];
            require(
                projectOwner != address(0),
                "ChugSplashAuth: project owner cannot be address(0)"
            );
            _grantRole(projectOwnerRoleHash, projectOwner);
        }

        if (contractInfoArray.length > 0) {
            manager.addContractsToProject(projectName, contractInfoArray);
        }
    }

    function revokeProposer(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _request, _signatures, _proof)
    {
        address proposerToRemove = abi.decode(_request.data, (address));
        _revokeRole(DEFAULT_ADMIN_ROLE, proposerToRemove);
    }

    function withdrawETH(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementNonce
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _request, _signatures, _proof)
    {
        address receiver = abi.decode(_request.data, (address, ));
        manager.withdrawOwnerETH(receiver);
    }

    function approveDeployment(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementNonce {
        (
            string memory projectName,
            bytes32 actionRoot,
            bytes32 targetRoot,
            uint256 numActions,
            uint256 numTargets,
            uint256 numImmutableContracts,
            string memory configUri
        ) = abi.decode(_request.data, (string, uint256, address[], ContractInfo[]));

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        manager.approveDeployment(
            actionRoot,
            targetRoot,
            numActions,
            numTargets,
            numImmutableContracts,
            configUri,
            true
        );
    }

    function setProjectThreshold(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementNonce {
        (string memory projectName, uint256 newThreshold) = abi.decode(
            _request.data,
            (string, uint256)
        );

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        require(newThreshold > 0, "ChugSplashAuth: threshold cannot be 0");

        thresholds[projectName] = newThreshold;
    }

    function setProjectOwner(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementNonce {
        (string memory projectName, address projectOwner, bool add) = abi.decode(
            _request.data,
            (string, address, bool)
        );

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        require(projectOwner != address(0), "ChugSplashAuth: project owner cannot be address(0)");

        add
            ? _grantRole(projectOwnerRole, projectOwner)
            : _revokeRole(projectOwnerRole, projectOwner);
    }

    function removeProject(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementNonce {
        (string memory projectName, string[] memory referenceNames) = abi.decode(
            _request.data,
            (string, string[])
        );
        require(referenceNames.length > 0, "ChugSplashAuth: no contracts to remove");

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        manager.removeContractsFromProject(projectName, referenceNames);

        require(
            manager.numContracts[projectName] == 0,
            "ChugSplashAuth: leftover contract(s) in project"
        );

        thresholds[projectName] = 0;
    }

    function cancelActiveDeployment(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementNonce {
        string memory projectName = abi.decode(_request.data, (string));

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        manager.cancelActiveChugSplashDeployment();
    }

    function cancelActiveDeployment(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementNonce {
        string memory projectName = abi.decode(_request.data, (string));

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        manager.cancelActiveChugSplashDeployment();
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
