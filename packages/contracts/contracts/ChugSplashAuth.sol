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
import {
    MerkleProofUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import { IChugSplashManager } from "./interfaces/IChugSplashManager.sol";
import { IOwnable } from "./interfaces/IOwnable.sol";
import {
    AuthState,
    AuthStatus,
    AuthLeaf,
    ContractInfo,
    SetRoleMember
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

    uint256 public orgOwnerThreshold;

    /**
     * @notice Boolean indicating whether or not a proposal has been made. After this occurs, the
     *         the org owners of this contract can no longer call `setup`.
     */
    bool public firstProposalOccurred;

    /**
     * @notice Mapping of project names to the threshold required to execute an auth leaf for that
     *        project.
     */
    mapping(string => uint256) public thresholds;

    /**
     * @notice Mapping of an auth Merkle root to the corresponding AuthState.
     */
    mapping(bytes32 => AuthState) public authStates;

    modifier isValidProposedAuthLeaf(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes32[] memory _proof,
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes[] memory _signatures
    ) {
        AuthState memory authState = authStates[_authRoot];
        if (authState.status != AuthStatus.PROPOSED) revert AuthStateNotProposed();

        verifySignatures(_authRoot, _leaf, _proof, _threshold, _verifyingRole, _signatures);
        _;
    }

    modifier incrementProtocolDebt(uint256 _initialGasLeft) {
        _;
        manager.incrementProtocolDebt(_initialGasLeft);
    }

    event Setup(bytes32 indexed authRoot);
    event ProjectManagerSet(bytes32 indexed authRoot, uint256 leafIndex);
    event ProxyExported(bytes32 indexed authRoot, uint256 leafIndex);
    event OrgOwnerSet(bytes32 indexed authRoot, uint256 leafIndex);
    event OrgOwnerThresholdSet(bytes32 indexed authRoot, uint256 leafIndex);
    event DeployerOwnershipTransferred(bytes32 indexed authRoot, uint256 leafIndex);
    event DeployerUpgraded(bytes32 indexed authRoot, uint256 leafIndex);
    event AuthContractUpgraded(bytes32 indexed authRoot, uint256 leafIndex);
    event DeployerAndAuthContractUpgraded(bytes32 indexed authRoot, uint256 leafIndex);
    event ProjectCreated(bytes32 indexed authRoot, uint256 leafIndex);
    event ProposerSet(bytes32 indexed authRoot, uint256 leafIndex);
    event ETHWithdrawn(bytes32 indexed authRoot, uint256 leafIndex);
    event DeploymentApproved(bytes32 indexed authRoot, uint256 leafIndex);
    event ProjectThresholdChanged(bytes32 indexed authRoot, uint256 leafIndex);
    event ProjectOwnerSet(bytes32 indexed authRoot, uint256 leafIndex);
    event ProjectRemoved(bytes32 indexed authRoot, uint256 leafIndex);
    event ActiveDeploymentCancelled(bytes32 indexed authRoot, uint256 leafIndex);
    event ContractsInProjectUpdated(bytes32 indexed authRoot, uint256 leafIndex);
    event AuthRootProposed(bytes32 indexed authRoot, address indexed proposer, uint256 numLeafs);
    event AuthRootCompleted(bytes32 indexed authRoot, uint256 numLeafs);

    error AuthStateNotProposed();
    error ThresholdCannotBeZero();
    error ThresholdExceedsOwnerCount();
    error AddressAlreadyHasRole();
    error NotEnoughSignatures();
    error InvalidSignatureLength();
    error UnauthorizedSigner();
    error DuplicateSigner();
    error InvalidFromAddress();
    error InvalidToAddress();
    error InvalidChainId();
    error InvalidLeafIndex();
    error InvalidMerkleProof();
    error FirstProposalOccurred();
    error ArrayLengthMismatch();
    error AddressDoesNotHaveRole();
    error UnreachableThreshold();
    error EmptyProjectName();
    error ProjectDoesNotExist();
    error DeploymentInProgress();
    error ProjectAlreadyExists();
    error ContractExistsInAnotherProject();
    error EmptyArray();
    error ProjectHasActiveDeployment();
    error ContractDoesNotExistInProject();
    error LeftoverContractsInProject();
    error AuthStateNotEmpty();
    error InvalidAuthRoot();
    error InvalidNumLeafs();
    error FunctionDisabled();
    error RoleMemberCannotBeZeroAddress();
    error RoleMemberCannotBeThisContract();
    error LeftoverProjectOwners();

    constructor(Version memory _version) Semver(_version.major, _version.minor, _version.patch) {
        // Disables initializing the implementation contract. Does not impact proxy contracts.
        _disableInitializers();
    }

    /**
     * @notice Initializes this contract. Must only be callable one time, which should occur
       immediately after contract creation. This is necessary because this contract is meant to
       exist as an implementation behind proxies.
     *
     * @param _manager Address of the ChugSplashManager contract.
     * @param _data Arbitrary data. Provides a flexible interface for future versions of this
                    contract. In this version, the data is expected to be the ABI-encoded
                    list of org owners and the org owner threshold.
     */
    function initialize(address _manager, bytes memory _data) external initializer {
        (address[] memory _orgOwners, uint256 _orgOwnerThreshold) = abi.decode(
            _data,
            (address[], uint256)
        );

        if (_orgOwnerThreshold == 0) revert ThresholdCannotBeZero();
        if (_orgOwners.length < _orgOwnerThreshold) revert ThresholdExceedsOwnerCount();

        for (uint256 i = 0; i < _orgOwners.length; i++) {
            address orgOwner = _orgOwners[i];
            _assertValidRoleMemberAddress(orgOwner);

            // Throw an error if the caller is attempting to add the same org owner twice, since
            // this means that the caller made a mistake.
            if (hasRole(DEFAULT_ADMIN_ROLE, orgOwner)) revert AddressAlreadyHasRole();

            _grantRole(DEFAULT_ADMIN_ROLE, orgOwner);
        }

        manager = IChugSplashManager(_manager);
        orgOwnerThreshold = _orgOwnerThreshold;

        __AccessControlEnumerable_init();
    }

    /********************************** ORG OWNER FUNCTIONS **********************************/

    /**
     * @notice Sets initial proposers. The number of org owner signatures must be at least
               `orgOwnerThreshold`.

               This is the only permissioned function in this contract that doesn't require
               that the auth Merkle root has been proposed in a separate transaction.

               This function is callable until the first proposal occurs. This allows for the
               possibility that the org owners mistakenly enter invalid initial proposers. For
               example, they may enter proposers addresses that don't exist on this chain. If this
               function was only callable once, then this contract would be unusable in this
               scenario, since every other public function requires that a proposal has occurred.
     *
     * @param _authRoot Auth Merkle root for the Merkle tree that the owners approved.
     * @param _leaf AuthLeaf struct. This is the decoded leaf of the auth tree.
     * @param _signatures List of meta transaction signatures. Must correspond to signer addresses
     *                    in ascending order (see `verifySignatures` for more info).
     * @param _proof    Merkle proof of the leaf in the auth tree.
     */
    function setup(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        if (firstProposalOccurred) revert FirstProposalOccurred();

        verifySignatures(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        );

        AuthState storage authState = authStates[_authRoot];

        if (authState.status != AuthStatus.EMPTY) revert AuthStateNotEmpty();

        (
            SetRoleMember[] memory proposers,
            SetRoleMember[] memory projectManagers
        ) = abi.decode(_leaf.data, (SetRoleMember[], SetRoleMember[]));

        uint256 numProposers = proposers.length;
        uint256 numProjectManagers = projectManagers.length;
        if (proposers.length != projectManagers.length) revert ArrayLengthMismatch();

        bool add;
        address member;
        for (uint256 i = 0; i < numProposers; i++) {
            add = proposers[i].add;
            member = proposers[i].member;
            if (add) {
                _assertValidRoleMemberAddress(member);
                if (hasRole(PROPOSER_ROLE, member)) revert AddressAlreadyHasRole();
                _grantRole(PROPOSER_ROLE, member);
            } else {
                if (!hasRole(PROPOSER_ROLE, member)) revert AddressDoesNotHaveRole();
                _revokeRole(PROPOSER_ROLE, member);
            }
        }

        for (uint256 i = 0; i < numProjectManagers; i++) {
            add = projectManagers[i].add;
            member = projectManagers[i].member;
            if (add) {
                _assertValidRoleMemberAddress(member);
                if (hasRole(PROJECT_MANAGER_ROLE, member)) revert AddressAlreadyHasRole();
                _grantRole(PROJECT_MANAGER_ROLE, member);
            } else {
                if (!hasRole(PROJECT_MANAGER_ROLE, member)) revert AddressDoesNotHaveRole();
                _revokeRole(PROJECT_MANAGER_ROLE, member);
            }
        }

        // We mark the auth root as completed so that it can't be re-executed.
        authStates[_authRoot] = AuthState({
            status: AuthStatus.COMPLETED,
            leafsExecuted: 1,
            numLeafs: 1
        });

        emit Setup(_authRoot);
    }

    function setProjectManager(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        (address projectManager, bool add) = abi.decode(_leaf.data, (address, bool));

        if (add) {
            _assertValidRoleMemberAddress(projectManager);
            if (hasRole(PROJECT_MANAGER_ROLE, projectManager)) revert AddressAlreadyHasRole();
            _grantRole(PROJECT_MANAGER_ROLE, projectManager);
        } else {
            if (!hasRole(PROJECT_MANAGER_ROLE, projectManager)) revert AddressDoesNotHaveRole();
            _revokeRole(PROJECT_MANAGER_ROLE, projectManager);
        }

        _updateProposedAuthState(_authRoot);

        emit ProjectManagerSet(_authRoot, _leaf.index);
    }

    function exportProxy(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        (address proxy, bytes32 contractKindHash, address newOwner) = abi.decode(
            _leaf.data,
            (address, bytes32, address)
        );

        _updateProposedAuthState(_authRoot);

        manager.exportProxy(payable(proxy), contractKindHash, newOwner);

        emit ProxyExported(_authRoot, _leaf.index);
    }

    function setOrgOwner(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        (address orgOwner, bool add) = abi.decode(_leaf.data, (address, bool));

        if (add) {
            _assertValidRoleMemberAddress(orgOwner);
            if (hasRole(DEFAULT_ADMIN_ROLE, orgOwner)) revert AddressAlreadyHasRole();
            _grantRole(DEFAULT_ADMIN_ROLE, orgOwner);
        } else {
            if (getRoleMemberCount(DEFAULT_ADMIN_ROLE) <= orgOwnerThreshold)
                revert UnreachableThreshold();
            if (!hasRole(DEFAULT_ADMIN_ROLE, orgOwner)) revert AddressDoesNotHaveRole();
            _revokeRole(DEFAULT_ADMIN_ROLE, orgOwner);
        }

        _updateProposedAuthState(_authRoot);

        emit OrgOwnerSet(_authRoot, _leaf.index);
    }

    // Reverts if any of the contracts don't belong to the project. Also reverts if the project has
    // a deployment that is currently executing.
    function removeProject(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        (string memory projectName, address[] memory contractAddresses) = abi.decode(
            _leaf.data,
            (string, address[])
        );

        // Use scope here to prevent "Stack too deep" error
        {
            if (bytes(projectName).length == 0) revert EmptyProjectName();
            // We don't assert that the contract addresses array is non-empty because it's possible that
            // the project has no contracts.

            if (thresholds[projectName] == 0) revert ProjectDoesNotExist();

            _updateProposedAuthState(_authRoot);

            if (
                keccak256(bytes(manager.deployments(manager.activeDeploymentId()).projectName)) ==
                keccak256(bytes(projectName))
            ) revert ProjectHasActiveDeployment();

            // Remove all of the contracts from the project.
            uint256 numContractsToRemove = contractAddresses.length;
            for (uint256 i = 0; i < numContractsToRemove; i++) {
                address contractAddress = contractAddresses[i];
                string memory existingProjectName = manager.contractToProject(contractAddress);
                if (keccak256(bytes(existingProjectName)) != keccak256(bytes(projectName)))
                    revert ContractDoesNotExistInProject();
                manager.transferContractToProject(contractAddress, "");
            }

            if (manager.numContracts(projectName) > 0) revert LeftoverContractsInProject();

            // Remove all of the project owners.
            bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
            uint256 numProjectOwners = getRoleMemberCount(projectOwnerRole);
            for (uint256 i = 0; i < numProjectOwners; i++) {
                address projectOwner = getRoleMember(projectOwnerRole, i);
                _revokeRole(projectOwnerRole, projectOwner);
            }

            if (getRoleMemberCount(projectOwnerRole) > 0) revert LeftoverProjectOwners();
        }

        thresholds[projectName] = 0;

        _updateProposedAuthState(_authRoot);

        emit ProjectRemoved(_authRoot, _leaf.index);
    }

    function setOrgOwnerThreshold(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        uint256 newThreshold = abi.decode(_leaf.data, (uint256));

        if (newThreshold == 0) revert ThresholdCannotBeZero();
        if (getRoleMemberCount(DEFAULT_ADMIN_ROLE) < newThreshold)
            revert ThresholdExceedsOwnerCount();

        orgOwnerThreshold = newThreshold;

        _updateProposedAuthState(_authRoot);

        emit OrgOwnerThresholdSet(_authRoot, _leaf.index);
    }

    function transferDeployerOwnership(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        address newOwner = abi.decode(_leaf.data, (address));

        _updateProposedAuthState(_authRoot);

        IOwnable managerOwnable = IOwnable(address(manager));
        newOwner == address(0)
            ? managerOwnable.renounceOwnership()
            : managerOwnable.transferOwnership(newOwner);
        ChugSplashManagerProxy(payable(address(manager))).changeAdmin(newOwner);

        emit DeployerOwnershipTransferred(_authRoot, _leaf.index);
    }

    // Reverts if the ChugSplashManager is currently executing a deployment.
    function upgradeDeployerImplementation(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        if (manager.isExecuting()) revert DeploymentInProgress();

        _updateProposedAuthState(_authRoot);

        (address impl, bytes memory data) = abi.decode(_leaf.data, (address, bytes));
        ChugSplashManagerProxy deployerProxy = ChugSplashManagerProxy(payable(address(manager)));
        if (data.length > 0) {
            deployerProxy.upgradeToAndCall(impl, data);
        } else {
            deployerProxy.upgradeTo(impl);
        }

        emit DeployerUpgraded(_authRoot, _leaf.index);
    }

    function upgradeAuthImplementation(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        (address impl, bytes memory data) = abi.decode(_leaf.data, (address, bytes));

        _updateProposedAuthState(_authRoot);

        ChugSplashManagerProxy authProxy = ChugSplashManagerProxy(payable(address(this)));
        if (data.length > 0) {
            authProxy.upgradeToAndCall(impl, data);
        } else {
            authProxy.upgradeTo(impl);
        }

        emit AuthContractUpgraded(_authRoot, _leaf.index);
    }

    // Reverts if the ChugSplashManager is currently executing a deployment.
    function upgradeDeployerAndAuthImpl(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        if (manager.isExecuting()) revert DeploymentInProgress();

        _updateProposedAuthState(_authRoot);

        // Use scope here to prevent "Stack too deep" error
        {
            (
                address deployerImpl,
                bytes memory deployerData,
                address authImpl,
                bytes memory authData
            ) = abi.decode(_leaf.data, (address, bytes, address, bytes));

            ChugSplashManagerProxy deployerProxy = ChugSplashManagerProxy(
                payable(address(manager))
            );
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

        emit DeployerAndAuthContractUpgraded(_authRoot, _leaf.index);
    }

    /************************ PROJECT MANAGER FUNCTIONS *****************************/

    /**
     * @notice Creates a new project with the given name and threshold. Must be signed by at least
       one project manager. Note that this function wil revert if any of the contracts in the new
       project already belong to an existing project.
     */
    function createProject(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(_authRoot, _leaf, _proof, 1, PROJECT_MANAGER_ROLE, _signatures)
    {
        _updateProposedAuthState(_authRoot);

        // Use scope here to prevent "Stack too deep" error
        {
            (
                string memory projectName,
                uint256 threshold,
                address[] memory projectOwners,
                ContractInfo[] memory contractInfoArray
            ) = abi.decode(_leaf.data, (string, uint256, address[], ContractInfo[]));

            if (bytes(projectName).length == 0) revert EmptyProjectName();
            if (threshold == 0) revert ThresholdCannotBeZero();
            if (thresholds[projectName] > 0) revert ProjectAlreadyExists();

            thresholds[projectName] = threshold;

            bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
            uint256 numProjectOwners = projectOwners.length;
            for (uint256 i = 0; i < numProjectOwners; i++) {
                address projectOwner = projectOwners[i];
                _assertValidRoleMemberAddress(projectOwner);
                if (hasRole(projectOwnerRole, projectOwner)) revert AddressAlreadyHasRole();
                _grantRole(projectOwnerRole, projectOwner);
            }

            uint256 numContracts = contractInfoArray.length;
            ContractInfo memory contractInfo;
            address contractAddress;
            string memory referenceName;
            for (uint256 i = 0; i < numContracts; i++) {
                contractInfo = contractInfoArray[i];
                contractAddress = contractInfo.addr;
                referenceName = contractInfo.referenceName;

                bytes memory existingProjectBytes = bytes(
                    manager.contractToProject(contractAddress)
                );
                if (
                    existingProjectBytes.length > 0 &&
                    (keccak256(existingProjectBytes) != keccak256(bytes(projectName)))
                ) revert ContractExistsInAnotherProject();
                manager.transferContractToProject(contractAddress, referenceName);
            }
        }

        emit ProjectCreated(_authRoot, _leaf.index);
    }

    function setProposer(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(_authRoot, _leaf, _proof, 1, PROJECT_MANAGER_ROLE, _signatures)
    {
        (address proposer, bool add) = abi.decode(_leaf.data, (address, bool));

        if (add) {
            _assertValidRoleMemberAddress(proposer);
            if (hasRole(PROPOSER_ROLE, proposer)) revert AddressAlreadyHasRole();
            _grantRole(PROPOSER_ROLE, proposer);
        } else {
            if (!hasRole(PROPOSER_ROLE, proposer)) revert AddressDoesNotHaveRole();
            _revokeRole(PROPOSER_ROLE, proposer);
        }

        _updateProposedAuthState(_authRoot);

        emit ProposerSet(_authRoot, _leaf.index);
    }

    function withdrawETH(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidProposedAuthLeaf(_authRoot, _leaf, _proof, 1, PROJECT_MANAGER_ROLE, _signatures)
    {
        address receiver = abi.decode(_leaf.data, (address));
        _updateProposedAuthState(_authRoot);
        manager.withdrawOwnerETH(receiver);
        emit ETHWithdrawn(_authRoot, _leaf.index);
    }

    /***************************** PROJECT OWNER FUNCTIONS ****************************/

    function approveDeployment(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (
            string memory projectName,
            bytes32 actionRoot,
            bytes32 targetRoot,
            uint256 numLeafs,
            uint256 numTargets,
            uint256 numImmutableContracts,
            string memory configUri
        ) = abi.decode(_leaf.data, (string, bytes32, bytes32, uint256, uint256, uint256, string));

        assertValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            thresholds[projectName],
            keccak256(abi.encodePacked(projectName, "ProjectOwner")),
            _signatures
        );

        _updateProposedAuthState(_authRoot);

        manager.approve(
            projectName,
            actionRoot,
            targetRoot,
            numLeafs,
            numTargets,
            numImmutableContracts,
            configUri,
            true
        );

        emit DeploymentApproved(_authRoot, _leaf.index);
    }

    function setProjectThreshold(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (string memory projectName, uint256 newThreshold) = abi.decode(
            _leaf.data,
            (string, uint256)
        );

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            thresholds[projectName],
            projectOwnerRole,
            _signatures
        );

        if (newThreshold == 0) revert ThresholdCannotBeZero();
        if (getRoleMemberCount(projectOwnerRole) < newThreshold) revert UnreachableThreshold();

        thresholds[projectName] = newThreshold;

        _updateProposedAuthState(_authRoot);

        emit ProjectThresholdChanged(_authRoot, _leaf.index);
    }

    function setProjectOwner(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (string memory projectName, address projectOwner, bool add) = abi.decode(
            _leaf.data,
            (string, address, bool)
        );

        if (bytes(projectName).length == 0) revert EmptyProjectName();

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        uint256 projectThreshold = thresholds[projectName];
        assertValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            projectThreshold,
            projectOwnerRole,
            _signatures
        );

        if (add) {
            _assertValidRoleMemberAddress(projectOwner);
            if (hasRole(projectOwnerRole, projectOwner)) revert AddressAlreadyHasRole();
            _grantRole(projectOwnerRole, projectOwner);
        } else {
            if (getRoleMemberCount(projectOwnerRole) <= projectThreshold)
                revert UnreachableThreshold();
            if (!hasRole(projectOwnerRole, projectOwner)) revert AddressDoesNotHaveRole();
            _revokeRole(projectOwnerRole, projectOwner);
        }

        _updateProposedAuthState(_authRoot);

        emit ProjectOwnerSet(_authRoot, _leaf.index);
    }

    function cancelActiveDeployment(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        string memory projectName = abi.decode(_leaf.data, (string));

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            thresholds[projectName],
            projectOwnerRole,
            _signatures
        );

        _updateProposedAuthState(_authRoot);

        manager.cancelActiveChugSplashDeployment();

        emit ActiveDeploymentCancelled(_authRoot, _leaf.index);
    }

    // Allows the project owners to add or remove contracts to their project. Reverts if any of the
    // contracts already belong to another project. Reverts if a deployment in the ChugSplashManager
    // is currently being executed. Although this last check may not be strictly necessary, it
    // guarantees that it's not possible for this project to claim a contract address that will soon
    // be deployed by the active project, which would prevent that project from executing. This
    // shouldn't be possible anyway, since the salt of each contract address includes the project
    // name, but it's possible that the salt could change in the future, so we play it safe here.
    function updateContractsInProject(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (
            string memory projectName,
            address[] memory contractAddresses,
            bool[] memory addContract
        ) = abi.decode(_leaf.data, (string, address[], bool[]));

        uint256 numContracts = contractAddresses.length;
        if (numContracts == 0) revert EmptyArray();

        if (numContracts != addContract.length) revert ArrayLengthMismatch();

        _updateProposedAuthState(_authRoot);

        if (manager.isExecuting()) revert DeploymentInProgress();

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            thresholds[projectName],
            projectOwnerRole,
            _signatures
        );

        uint256 numContractsToUpdate = contractAddresses.length;
        bool add;
        for (uint256 i = 0; i < numContractsToUpdate; i++) {
            address contractAddress = contractAddresses[i];
            add = addContract[i];
            bytes memory existingProjectNameBytes = bytes(
                manager.contractToProject(contractAddress)
            );
            if (
                existingProjectNameBytes.length > 0 &&
                (keccak256(existingProjectNameBytes) != keccak256(bytes(projectName)))
            ) revert ContractExistsInAnotherProject();

            add
                ? manager.transferContractToProject(contractAddress, projectName)
                : manager.transferContractToProject(contractAddress, "");
        }

        emit ContractsInProjectUpdated(_authRoot, _leaf.index);
    }

    /****************************** PROPOSER FUNCTIONS ******************************/

    /**
     * @notice Allows a proposer to propose a new auth Merkle root.
     *
     * @param _authRoot The auth Merkle root to propose.
     * @param _leaf The leaf that contains the proposal info.
     * @param _signatures The meta transaction signature of the proposer that proves the
     */
    function propose(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        verifySignatures(_authRoot, _leaf, _proof, 1, PROPOSER_ROLE, _signatures);

        uint256 numLeafs = abi.decode(_leaf.data, (uint256));

        // The proposal counts as one of the auth leafs, so there must be at least one other
        // leaf, or else there will be nothing left to execute for this auth root.
        if (numLeafs <= 1) revert InvalidNumLeafs();

        AuthState storage authState = authStates[_authRoot];

        // We don't allow auth Merkle roots to be proposed more than once. Without this check, anyone can
        // call this function to re-propose an auth root that has already been proposed.
        if (authState.status != AuthStatus.EMPTY) revert AuthStateNotEmpty();

        authStates[_authRoot] = AuthState({
            status: AuthStatus.PROPOSED,
            leafsExecuted: 1, // The proposal counts as an auth leaf, so we start at 1
            numLeafs: numLeafs
        });

        if (!firstProposalOccurred) {
            firstProposalOccurred = true;
        }

        emit AuthRootProposed(_authRoot, _leaf.from, numLeafs);
    }

    /**************************** OPENZEPPELIN FUNCTIONS ******************************/

    /**
     * @notice Disables the ability to grant roles with OpenZeppelin's standard AccessControl
       function. This must instead occur through the functions defined by this contract.
     */
    function grantRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable, IAccessControlUpgradeable) {
        revert FunctionDisabled();
    }

    /**
     * @notice Disables the ability to revoke roles with OpenZeppelin's standard AccessControl
       function. This must instead occur through the functions defined by this contract.
     */
    function revokeRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable, IAccessControlUpgradeable) {
        revert FunctionDisabled();
    }

    /**
     * @notice Disables the ability to renounce roles with OpenZeppelin's standard AccessControl
       function. This must instead occur through the functions defined by this contract.
     */
    function renounceRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable, IAccessControlUpgradeable) {
        revert FunctionDisabled();
    }

    /****************************** PRIVATE FUNCTIONS ******************************/

    /**
     * @notice Verifies a list of EIP-712 meta transaction signatures.
     *
     * @param _authRoot Root of the auth Merkle tree that was signed in the meta transaction.
     * @param _leaf  AuthLeaf struct. This is the decoded leaf of the auth tree.
     * @param _threshold Number of signatures required to execute the meta transaction.
     * @param _verifyingRole Role that the signers of the signatures must have.
     * @param _signatures List of meta transaction signatures. These must correspond to
     *                      signer addresses that are in ascending order. E.g. The signature that
                            corresponds to the signer `0x00...` should come before the signature
                            that corresponds to the signer `0xff...`.
     * @param _proof    Merkle proof of the leaf in the auth tree.
     */
    function verifySignatures(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes32[] memory _proof,
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes[] memory _signatures
    ) private view {
        if (_threshold == 0) revert ThresholdCannotBeZero();
        if (_signatures.length < _threshold) revert NotEnoughSignatures();

        uint256 leafsExecuted = authStates[_authRoot].leafsExecuted;

        address signer;
        address prevSigner = address(0);
        for (uint256 i = 0; i < _threshold; i++) {
            bytes memory signature = _signatures[i];
            if (signature.length != 65) revert InvalidSignatureLength();

            bytes32 typedDataHash = ECDSAUpgradeable.toTypedDataHash(DOMAIN_SEPARATOR, _authRoot);
            signer = ECDSAUpgradeable.recover(typedDataHash, signature);
            if (!hasRole(_verifyingRole, signer)) revert UnauthorizedSigner();
            if (signer <= prevSigner) revert DuplicateSigner();

            // Validate the fields of the AuthLeaf
            if (_leaf.from != signer) revert InvalidFromAddress();
            if (_leaf.to != address(manager)) revert InvalidToAddress();
            if (_leaf.chainId != block.chainid) revert InvalidChainId();
            if (_leaf.index != leafsExecuted) revert InvalidLeafIndex();

            if (!MerkleProofUpgradeable.verify(_proof, _authRoot, keccak256(_leaf.data)))
                revert InvalidMerkleProof();

            prevSigner = signer;
        }
    }

    function assertValidProposedAuthLeaf(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes32[] memory _proof,
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes[] memory _signatures
    )
        private
        view
        isValidProposedAuthLeaf(_authRoot, _leaf, _proof, _threshold, _verifyingRole, _signatures)
    {}

    function _updateProposedAuthState(bytes32 _authRoot) private {
        AuthState storage authState = authStates[_authRoot];
        authState.leafsExecuted += 1;
        if (authState.leafsExecuted == authState.numLeafs) {
            authState.status = AuthStatus.COMPLETED;
            emit AuthRootCompleted(_authRoot, authState.numLeafs);
        }
    }

    function _assertValidRoleMemberAddress(address _addr) private view {
        if (_addr == address(0)) revert RoleMemberCannotBeZeroAddress();
        if (_addr == address(this)) revert RoleMemberCannotBeThisContract();
    }
}
