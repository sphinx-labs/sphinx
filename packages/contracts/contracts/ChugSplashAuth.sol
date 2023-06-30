// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {
    AccessControlEnumerableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {
    IAccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {
    ECDSAUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import { Lib_MerkleTree } from "@eth-optimism/contracts/libraries/utils/Lib_MerkleTree.sol";
import { IChugSplashManager } from "./interfaces/IChugSplashManager.sol";
import { IOwnable } from "./interfaces/IOwnable.sol";
import {
    ActionProof,
    AuthState,
    AuthStatus,
    ForwardRequest,
    ContractInfo
} from "./ChugSplashDataTypes.sol";
import { ChugSplashManagerProxy } from "./ChugSplashManagerProxy.sol";
import { Semver, Version } from "./Semver.sol";

/**
 * @title ChugSplashAuth
 * @custom:version 1.0.0
 */
contract ChugSplashAuth is AccessControlEnumerableUpgradeable, Semver {
    bytes32 private constant PROPOSER_ROLE = keccak256("ProposerRole");

    bytes32 private constant PROJECT_MANAGER_ROLE = keccak256("ProjectManagerRole");

    bytes32 private constant TYPE_HASH = keccak256("EIP712Domain(string name)");

    bytes32 private constant NAME_HASH = keccak256(bytes("ChugSplash"));

    bytes32 private constant DOMAIN_SEPARATOR = keccak256(abi.encode(TYPE_HASH, NAME_HASH));

    IChugSplashManager public manager;

    uint256 public ownerThreshold;

    uint256 public nonce;

    // TODO(docs)
    bool public firstProposalOccurred;

    // projectName => threshold
    mapping(string => uint256) public thresholds;

    // merkle root of auth tree => AuthState
    mapping(bytes32 => AuthState) public authStates;

    modifier isValidAuthAction(
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) {
        AuthState memory authState = authStates[_authRoot];
        require(authState.status == AuthStatus.PROPOSED, "action must be proposed");

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

    modifier updateState(bytes32 _authRoot, uint256 _initialGasLeft) {
        _;
        nonce += 1;
        AuthState memory authState = authStates[_authRoot];
        authState.actionsExecuted += 1;
        if (authState.actionsExecuted == authState.numActions) {
            authState.status = AuthStatus.COMPLETED;
            // emit AuthActionCompleted(...);
        }
        manager.incrementProtocolDebt(_initialGasLeft);
    }

    constructor(Version memory _version) Semver(_version.major, _version.minor, _version.patch) {
        // Disables initializing the implementation contract. Does not impact proxy contracts.
        _disableInitializers();
    }

    // TODO(docs): generic _data input variable because...
    function initialize(
        address _manager,
        bytes memory _data
    ) external initializer {
        (address[] memory _owners, uint256 _ownerThreshold) = abi.decode(
            _data,
            (address[], uint256)
        );

        require(_ownerThreshold > 0, "threshold must be greater than 0");
        require(
            _owners.length >= _ownerThreshold,
            "threshold exceeds number of owners"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            _assertValidAuthAddress(owner);

            // Throw an error if the caller is attempting to add the same owner twice, since this
            // means that the caller made a mistake.
            require(
                !hasRole(DEFAULT_ADMIN_ROLE, owner),
                "address already has role"
            );

            _grantRole(DEFAULT_ADMIN_ROLE, owner);
        }

        manager = IChugSplashManager(_manager);
        ownerThreshold = _ownerThreshold;

        __AccessControlEnumerable_init();
    }

    function assertValidAuthAction(
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        private
        view
        isValidAuthAction(_threshold, _verifyingRole, _authRoot, _request, _signatures, _proof)
    {}

    function verifySignatures(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes[] memory _signatures,
        ActionProof memory _proof,
        uint256 _numLeafs
    ) public view {
        require(_threshold > 0, "threshold must be greater than 0");
        require(_signatures.length >= _threshold, "not enough signatures");

        address signer;
        address prevSigner = address(0);
        for (uint256 i = 0; i < _threshold; i++) {
            bytes memory signature = _signatures[i];
            require(signature.length == 65, "invalid signature length");

            // TODO: tell ryan that the `_signatures` array must yield 'from' addresses that are in
            // ascending order. this applies to every function on this contract that takes in `_signatures`

            bytes32 typedDataHash = ECDSAUpgradeable.toTypedDataHash(DOMAIN_SEPARATOR, _authRoot);
            signer = ECDSAUpgradeable.recover(typedDataHash, signature);
            require(hasRole(_verifyingRole, signer), "unauthorized signer");
            require(signer > prevSigner, "duplicate signers");

            // Validate the fields of the ForwardRequest
            require(_request.from == signer, "invalid 'from' address");
            require(_request.to == address(manager), "invalid 'to' address");
            require(_request.chainId == block.chainid, "invalid chain id");
            require(_request.nonce == nonce, "invalid nonce");

            require(
                Lib_MerkleTree.verify(
                    _authRoot,
                    keccak256(_request.data),
                    _proof.actionIndex,
                    _proof.siblings,
                    _numLeafs
                ),
                "invalid merkle proof"
            );

            prevSigner = signer;
        }
    }

    /********************************** OWNER FUNCTIONS **********************************/

    // TODO(docs) this is the only permissioned function that doesn't require a proposal.
    // TODO(docs): this can't be called after the first proposal has occurred. this is because...
    function initialSetup(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
        // TODO: this modifier checks if the authRoot is proposed, which you don't want to do here
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        require(!firstProposalOccurred, "cannot setup after first proposal");

        // TODO(docs): we add an '_' to the end of addProposer because there's a function in this contract with the same name
        (
            address[] memory proposers,
            bool[] memory addProposer_,
            address[] memory projectManagers,
            bool[] memory addProjectManager
        ) = abi.decode(_request.data, (address[], bool[], address[], bool[]));

        uint256 numProposers = proposers.length;
        uint256 numProjectManagers = projectManagers.length;
        require(numProposers == addProposer_.length, "invalid proposers length");
        require(
            numProjectManagers == addProjectManager.length,
            "invalid projectManagers length"
        );

        bool add;
        address addr;
        for (uint256 i = 0; i < numProposers; i++) {
            add = addProposer_[i];
            addr = proposers[i];
            if (add) {
                _assertValidAuthAddress(addr);
                require(!hasRole(PROPOSER_ROLE, addr), "address already has role");
                _grantRole(PROPOSER_ROLE, addr);
            } else {
                require(hasRole(PROPOSER_ROLE, addr), "address does not have role");
                _revokeRole(PROPOSER_ROLE, addr);
            }
        }

        for (uint256 i = 0; i < numProjectManagers; i++) {
            add = addProjectManager[i];
            addr = projectManagers[i];
            if (add) {
                _assertValidAuthAddress(addr);
                require(
                    !hasRole(PROJECT_MANAGER_ROLE, addr),
                    "address already has role"
                );
                _grantRole(PROJECT_MANAGER_ROLE, addr);
            } else {
                require(
                    hasRole(PROJECT_MANAGER_ROLE, addr),
                    "address does not have role"
                );
                _revokeRole(PROJECT_MANAGER_ROLE, addr);
            }
        }
    }

    function setProjectManager(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
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

        if (add) {
            // TODO: come up with better name for this function
            _assertValidAuthAddress(projectManager);
            require(
                !hasRole(PROJECT_MANAGER_ROLE, projectManager),
                "address already has role"
            );
            _grantRole(PROJECT_MANAGER_ROLE, projectManager);
        } else {
            require(
                hasRole(PROJECT_MANAGER_ROLE, projectManager),
                "address does not have role"
            );
            _revokeRole(PROJECT_MANAGER_ROLE, projectManager);
        }
    }

    // TODO: we should remove the `address` field in the action and target bundles. instead, the
    // Manager contract should contain a mapping from project names to reference names to addresses.
    // this prevents a situation where a malicious project owner attempts to perform actions on
    // contracts outside of its project. This mapping should be updated during execution probably.
    // We also need logic that updates this mapping when importing proxies and when transferring a
    // contract from project A to project B. We should require that a contract can only belong to
    // one project at a time.

    function exportProxy(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
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

    function addProposer(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
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

        _assertValidAuthAddress(proposer);

        require(!hasRole(PROPOSER_ROLE, proposer), "address already has role");
        _grantRole(PROPOSER_ROLE, proposer);
    }

    function setOwner(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
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

        if (add) {
            _assertValidAuthAddress(owner);
            require(
                !hasRole(DEFAULT_ADMIN_ROLE, owner),
                "address already has role"
            );
            _grantRole(DEFAULT_ADMIN_ROLE, owner);
        } else {
            require(
                getRoleMemberCount(DEFAULT_ADMIN_ROLE) > ownerThreshold,
                "removing owner would yield unreachable threshold"
            );
            require(
                hasRole(DEFAULT_ADMIN_ROLE, owner),
                "address does not have role"
            );
            _revokeRole(DEFAULT_ADMIN_ROLE, owner);
        }
    }

    // TODO: events

    function updateProject(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
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

        require(bytes(projectName).length > 0, "project name cannot be empty");
        require(newThreshold > 0, "threshold must be greater than 0");
        require(thresholds[projectName] > 0, "project does not exist");

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        uint256 numToRemove = projectOwnersToRemove.length;
        uint256 numToAdd = newProjectOwners.length;
        require(
            getRoleMemberCount(projectOwnerRole) - numToRemove + numToAdd >= newThreshold,
            "threshold exceeds number of project owners"
        );

        thresholds[projectName] = newThreshold;

        address projectOwnerToRemove;
        for (uint256 i = 0; i < numToRemove; i++) {
            projectOwnerToRemove = projectOwnersToRemove[i];
            require(
                hasRole(projectOwnerRole, projectOwnerToRemove),
                "address does not have role"
            );
            _revokeRole(projectOwnerRole, projectOwnerToRemove);
        }

        address newProjectOwner;
        for (uint256 i = 0; i < numToAdd; i++) {
            newProjectOwner = newProjectOwners[i];
            _assertValidAuthAddress(newProjectOwner);
            require(
                !hasRole(projectOwnerRole, newProjectOwner),
                "address already has role"
            );
            _grantRole(projectOwnerRole, newProjectOwner);
        }
    }

    function setOwnerThreshold(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
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

        require(newThreshold > 0, "threshold cannot be 0");
        require(
            getRoleMemberCount(DEFAULT_ADMIN_ROLE) >= newThreshold,
            "threshold exceeds number of owners"
        );

        ownerThreshold = newThreshold;
    }

    function transferDeployerOwnership(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        address newOwner = abi.decode(_request.data, (address));

        IOwnable managerOwnable = IOwnable(address(manager));
        newOwner == address(0)
            ? managerOwnable.renounceOwnership()
            : managerOwnable.transferOwnership(newOwner);
        ChugSplashManagerProxy(payable(address(manager))).changeAdmin(newOwner);
    }

    function upgradeDeployerImplementation(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        (address impl, bytes memory data) = abi.decode(_request.data, (address, bytes));
        ChugSplashManagerProxy deployerProxy = ChugSplashManagerProxy(payable(address(manager)));
        if (data.length > 0) {
            deployerProxy.upgradeToAndCall(impl, data);
        } else {
            deployerProxy.upgradeTo(impl);
        }
    }

    function upgradeAuthImplementation(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
        isValidAuthAction(
            ownerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _request,
            _signatures,
            _proof
        )
    {
        (address impl, bytes memory data) = abi.decode(_request.data, (address, bytes));
        ChugSplashManagerProxy authProxy = ChugSplashManagerProxy(payable(address(this)));
        if (data.length > 0) {
            authProxy.upgradeToAndCall(impl, data);
        } else {
            authProxy.upgradeTo(impl);
        }
    }

    function upgradeDeployerAndAuthImpl(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
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
            address deployerImpl,
            bytes memory deployerData,
            address authImpl,
            bytes memory authData
        ) = abi.decode(_request.data, (address, bytes, address, bytes));

        ChugSplashManagerProxy deployerProxy = ChugSplashManagerProxy(payable(address(manager)));
        ChugSplashManagerProxy authProxy = ChugSplashManagerProxy(payable(address(this)));

        if (deployerData.length > 0) {
            deployerProxy.upgradeToAndCall(deployerImpl, deployerData);
        } else {
            deployerProxy.upgradeTo(deployerImpl);
        }

        if (authData.length > 0) {
            authProxy.upgradeToAndCall(authImpl, authData);
        } else {
            authProxy.upgradeTo(authImpl);
        }
    }

    /************************ PROJECT MANAGER FUNCTIONS *****************************/

    // TODO(docs): meta transaction must be signed by a project manager
    // TODO(docs): the call to `manager.setContractKind` will revert if any of the contracts already belong to a project
    function createProject(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _request, _signatures, _proof)
    {
        (
            string memory projectName,
            uint256 threshold,
            address[] memory projectOwners,
            ContractInfo[] memory contractInfoArray
        ) = abi.decode(_request.data, (string, uint256, address[], ContractInfo[]));

        require(threshold > 0, "threshold must be greater than 0");
        require(thresholds[projectName] == 0, "project already exists");

        thresholds[projectName] = threshold;

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        uint256 numProjectOwners = projectOwners.length;
        for (uint256 i = 0; i < numProjectOwners; i++) {
            address projectOwner = projectOwners[i];
            _assertValidAuthAddress(projectOwner);
            require(
                !hasRole(projectOwnerRole, projectOwner),
                "address already has role"
            );
            _grantRole(projectOwnerRole, projectOwner);
        }

        if (contractInfoArray.length > 0) {
            manager.addContractsToProject(projectName, contractInfoArray);
        }
    }

    function removeProposer(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _request, _signatures, _proof)
    {
        address proposerToRemove = abi.decode(_request.data, (address));
        require(
            hasRole(PROPOSER_ROLE, proposerToRemove),
            "address does not have role"
        );
        _revokeRole(PROPOSER_ROLE, proposerToRemove);
    }

    function withdrawETH(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        updateState(_authRoot, gasleft())
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _request, _signatures, _proof)
    {
        address receiver = abi.decode(_request.data, (address));
        manager.withdrawOwnerETH(receiver);
    }

    /***************************** PROJECT OWNER FUNCTIONS ****************************/

    function approveDeployment(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public updateState(_authRoot, gasleft()) {
        (
            string memory projectName,
            bytes32 actionRoot,
            bytes32 targetRoot,
            uint256 numActions,
            uint256 numTargets,
            uint256 numImmutableContracts,
            string memory configUri
        ) = abi.decode(
                _request.data,
                (string, bytes32, bytes32, uint256, uint256, uint256, string)
            );

        assertValidAuthAction(
            thresholds[projectName],
            keccak256(abi.encodePacked(projectName, "ProjectOwner")),
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        manager.approve(
            projectName,
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
    ) public updateState(_authRoot, gasleft()) {
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

        require(newThreshold > 0, "threshold cannot be 0");
        require(
            getRoleMemberCount(projectOwnerRole) >= newThreshold,
            "threshold cannot exceed number of project owners"
        );

        thresholds[projectName] = newThreshold;
    }

    function setProjectOwner(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public updateState(_authRoot, gasleft()) {
        (string memory projectName, address projectOwner, bool add) = abi.decode(
            _request.data,
            (string, address, bool)
        );

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        uint256 projectThreshold = thresholds[projectName];
        assertValidAuthAction(
            projectThreshold,
            projectOwnerRole,
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        if (add) {
            _assertValidAuthAddress(projectOwner);
            require(
                !hasRole(projectOwnerRole, projectOwner),
                "address already has role"
            );
            _grantRole(projectOwnerRole, projectOwner);
        } else {
            require(
                getRoleMemberCount(projectOwnerRole) > projectThreshold,
                "removing project owner would yield unreachable threshold"
            );
            require(
                hasRole(projectOwnerRole, projectOwner),
                "address does not have role"
            );
            _revokeRole(projectOwnerRole, projectOwner);
        }
    }

    // TODO: rm thirdweb everywhere in repo

    function removeProject(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public updateState(_authRoot, gasleft()) {
        (string memory projectName, string[] memory referenceNames) = abi.decode(
            _request.data,
            (string, string[])
        );
        require(referenceNames.length > 0, "no contracts to remove");

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
            manager.numContracts(projectName) == 0,
            "leftover contract(s) in project"
        );

        thresholds[projectName] = 0;
    }

    function cancelActiveDeployment(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public updateState(_authRoot, gasleft()) {
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

    // update the contracts in a project, or transfer contracts to a new project
    function updateContracts(
        bytes32 _authRoot,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public updateState(_authRoot, gasleft()) {
        (
            string memory currProjectName,
            string memory newProjectName,
            ContractInfo[] memory contractInfoArray
        ) = abi.decode(_request.data, (string, string, ContractInfo[]));

        uint256 numContracts = contractInfoArray.length;
        require(numContracts > 0, "no contracts to update");

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(currProjectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[currProjectName],
            projectOwnerRole,
            _authRoot,
            _request,
            _signatures,
            _proof
        );

        // Get the reference names of the contracts to update
        string[] memory referenceNames = new string[](numContracts);
        for (uint256 i = 0; i < numContracts; i++) {
            referenceNames[i] = contractInfoArray[i].referenceName;
        }

        manager.removeContractsFromProject(currProjectName, referenceNames);
        manager.addContractsToProject(newProjectName, contractInfoArray);
    }

    /****************************** PROPOSER FUNCTIONS ******************************/

    function propose(
        bytes32 _authRootToVerify,
        ForwardRequest memory _request,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public isValidAuthAction(1, PROPOSER_ROLE, _authRootToVerify, _request, _signatures, _proof) {
        uint256 initialGasLeft = gasleft();
        (bytes32 authRootToPropose, uint256 numActions, uint256 numLeafs) = abi.decode(
            _request.data,
            (bytes32, uint256, uint256)
        );

        AuthStatus status = authStates[authRootToPropose].status;
        require(
            status == AuthStatus.EMPTY || status == AuthStatus.COMPLETED,
            "auth action is already proposed"
        );
        require(authRootToPropose != bytes32(0), "auth root cannot be address(0)");
        require(numLeafs > 0, "numLeafs must be greater than 0");
        // This check enforces expected user behavior, which is that one auth root will be signed
        // by a proposer, and another auth root will be signed by another role after the proposal.
        require(authRootToPropose != _authRootToVerify, "auth roots cannot match");

        authStates[authRootToPropose] = AuthState({
            status: AuthStatus.PROPOSED,
            numActions: numActions,
            numLeafs: numLeafs,
            actionsExecuted: 0
        });

        if (!firstProposalOccurred) {
            firstProposalOccurred = true;
        }

        nonce += 1;

        manager.incrementProtocolDebt(initialGasLeft);
    }

    /**************************** OPENZEPPELIN FUNCTIONS ******************************/

    // TODO(docs): explain
    function grantRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable, IAccessControlUpgradeable) {
        revert("function disabled");
    }

    function revokeRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable, IAccessControlUpgradeable) {
        revert("function disabled");
    }

    function renounceRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable, IAccessControlUpgradeable) {
        revert("function disabled");
    }

    /****************************** PRIVATE FUNCTIONS ******************************/

    function _assertValidAuthAddress(address _addr) private view {
        require(_addr != address(0), "cannot be address(0)");
        require(_addr != address(this), "address cannot be this contract");
    }
}
