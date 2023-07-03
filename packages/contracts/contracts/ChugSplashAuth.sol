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
    AuthAction,
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

    uint256 public nonce;

    /**
     * @notice Boolean indicating whether or not a proposal has been made. After this occurs, the
     *         the org owners of this contract can no longer call `setup`.
     */
    bool public firstProposalOccurred;

    /**
     * @notice Mapping of project names to the threshold required to execute an auth action for that
     *        project.
     */
    mapping(string => uint256) public thresholds;

    /**
     * @notice Mapping of an auth tree's Merkle root to the corresponding AuthState.
     */
    mapping(bytes32 => AuthState) public authStates;

    modifier isValidAuthAction(
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) {
        AuthState memory authState = authStates[_authRoot];
        if (authState.status != AuthStatus.PROPOSED) revert AuthStateNotProposed();

        verifySignatures(
            _authRoot,
            _action,
            _threshold,
            _verifyingRole,
            _signatures,
            _proof,
            authState.numLeafs
        );
        _;
    }

    modifier incrementProtocolDebt(uint256 _initialGasLeft) {
        _;
        manager.incrementProtocolDebt(_initialGasLeft);
    }

    event AuthStateCompleted(bytes32 indexed authRoot);
    event AuthSetup(bytes32 indexed authRoot, uint256 actionIndex);
    event ProjectManagerSet(bytes32 indexed authRoot, uint256 actionIndex);
    event ProxyExported(bytes32 indexed authRoot, uint256 actionIndex);
    event ProposerAdded(bytes32 indexed authRoot, uint256 actionIndex);
    event OrgOwnerSet(bytes32 indexed authRoot, uint256 actionIndex);
    event ProjectUpdated(bytes32 indexed authRoot, uint256 actionIndex);
    event OrgOwnerThresholdSet(bytes32 indexed authRoot, uint256 actionIndex);
    event DeployerOwnershipTransferred(bytes32 indexed authRoot, uint256 actionIndex);
    event DeployerUpgraded(bytes32 indexed authRoot, uint256 actionIndex);
    event AuthContractUpgraded(bytes32 indexed authRoot, uint256 actionIndex);
    event DeployerAndAuthContractUpgraded(bytes32 indexed authRoot, uint256 actionIndex);
    event ProjectCreated(bytes32 indexed authRoot, uint256 actionIndex);
    event ProposerRemoved(bytes32 indexed authRoot, uint256 actionIndex);
    event ETHWithdrawn(bytes32 indexed authRoot, uint256 actionIndex);
    event DeploymentApproved(bytes32 indexed authRoot, uint256 actionIndex);
    event ProjectThresholdChanged(bytes32 indexed authRoot, uint256 actionIndex);
    event ProjectOwnerSet(bytes32 indexed authRoot, uint256 actionIndex);
    event ProjectRemoved(bytes32 indexed authRoot, uint256 actionIndex);
    event ActiveDeploymentCancelled(bytes32 indexed authRoot, uint256 actionIndex);
    event ContractsInProjectUpdated(bytes32 indexed authRoot, uint256 actionIndex);
    event AuthRootProposed(
        bytes32 indexed proposedAuthRoot,
        bytes32 indexed verifiedAuthRoot,
        uint256 verifiedActionIndex
    );

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
    error InvalidNonce();
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
    error AuthRootAlreadyProposed();
    error InvalidAuthRoot();
    error InvalidNumLeafs();
    error AuthRootsCannotMatch();
    error FunctionDisabled();
    error RoleMemberCannotBeZeroAddress();
    error RoleMemberCannotBeThisContract();

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

    function assertValidAuthAction(
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        private
        view
        isValidAuthAction(_threshold, _verifyingRole, _authRoot, _action, _signatures, _proof)
    {}

    /**
     * @notice Verifies a list of EIP-712 meta transaction signatures.
     *
     * @param _authRoot Merkle root of the auth tree. The signers of the signatures
     *                  initiated the meta transaction by signing this value.
     * @param _action  AuthAction struct. This is the decoded leaf of the auth tree.
     * @param _threshold Number of signatures required to execute the meta transaction.
     * @param _verifyingRole Role that the signers of the signatures must have.
     * @param _signatures List of meta transaction signatures. These must correspond to
     *                      signer addresses that are in ascending order. E.g. The signature that
                            corresponds to the signer `0x00...` should come before the signature
                            that corresponds to the signer `0xff...`.
     * @param _proof    Merkle proof of the leaf in the auth tree.
     * @param _numLeafs Total number of leaves in the auth tree.
     */
    function verifySignatures(
        bytes32 _authRoot,
        AuthAction memory _action,
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes[] memory _signatures,
        ActionProof memory _proof,
        uint256 _numLeafs
    ) private view {
        if (_threshold == 0) revert ThresholdCannotBeZero();
        if (_signatures.length < _threshold) revert NotEnoughSignatures();

        address signer;
        address prevSigner = address(0);
        for (uint256 i = 0; i < _threshold; i++) {
            bytes memory signature = _signatures[i];
            if (signature.length != 65) revert InvalidSignatureLength();

            bytes32 typedDataHash = ECDSAUpgradeable.toTypedDataHash(DOMAIN_SEPARATOR, _authRoot);
            signer = ECDSAUpgradeable.recover(typedDataHash, signature);
            if (!hasRole(_verifyingRole, signer)) revert UnauthorizedSigner();
            if (signer <= prevSigner) revert DuplicateSigner();

            // Validate the fields of the AuthAction
            if (_action.from != signer) revert InvalidFromAddress();
            if (_action.to != address(manager)) revert InvalidToAddress();
            if (_action.chainId != block.chainid) revert InvalidChainId();
            if (_action.nonce != nonce) revert InvalidNonce();

            if (
                !Lib_MerkleTree.verify(
                    _authRoot,
                    keccak256(_action.data),
                    _proof.actionIndex,
                    _proof.siblings,
                    _numLeafs
                )
            ) revert InvalidMerkleProof();

            prevSigner = signer;
        }
    }

    /********************************** ORG OWNER FUNCTIONS **********************************/

    /**
     * @notice Sets up initial roles. The number of org owner signatures must be at least
               `orgOwnerThreshold`.

               This is the only permissioned function in this contract that doesn't require
               that the auth Merkle root has been proposed in a separate transaction.

               This function is callable until the first proposal occurs. This allows for the
               possibility that the org owners mistakenly enter invalid initial proposers. For
               example, they may enter proposers addresses that don't exist on this chain. If this
               function were only callable once, then this contract would be unusable in this
               scenario, since every other function requires that a proposal has first occurred.
     *
     * @param _authRoot Merkle root of the auth tree.
     * @param _action AuthAction struct. This is the decoded leaf of the auth tree.
     * @param _signatures List of meta transaction signatures. Must correspond to signer addresses
     *                    in ascending order (see `verifySignatures` for more info).
     * @param _proof    Merkle proof of the leaf in the auth tree.
     */
    function setup(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        if (firstProposalOccurred) revert FirstProposalOccurred();

        (
            SetRoleMember[] memory proposers,
            SetRoleMember[] memory projectManagers,
            uint256 numLeafs
        ) = abi.decode(_action.data, (SetRoleMember[], SetRoleMember[], uint256));

        verifySignatures(
            _authRoot,
            _action,
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _signatures,
            _proof,
            numLeafs
        );

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

        nonce += 1;

        emit AuthSetup(_authRoot, _proof.actionIndex);
    }

    function setProjectManager(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        (address projectManager, bool add) = abi.decode(_action.data, (address, bool));

        if (add) {
            _assertValidRoleMemberAddress(projectManager);
            if (hasRole(PROJECT_MANAGER_ROLE, projectManager)) revert AddressAlreadyHasRole();
            _grantRole(PROJECT_MANAGER_ROLE, projectManager);
        } else {
            if (!hasRole(PROJECT_MANAGER_ROLE, projectManager)) revert AddressDoesNotHaveRole();
            _revokeRole(PROJECT_MANAGER_ROLE, projectManager);
        }

        _updateProposedState(_authRoot);

        emit ProjectManagerSet(_authRoot, _proof.actionIndex);
    }

    function exportProxy(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        (address proxy, bytes32 contractKindHash, address newOwner) = abi.decode(
            _action.data,
            (address, bytes32, address)
        );

        _updateProposedState(_authRoot);

        manager.exportProxy(payable(proxy), contractKindHash, newOwner);

        emit ProxyExported(_authRoot, _proof.actionIndex);
    }

    function addProposer(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        address proposer = abi.decode(_action.data, (address));

        _assertValidRoleMemberAddress(proposer);

        if (hasRole(PROPOSER_ROLE, proposer)) revert AddressAlreadyHasRole();
        _grantRole(PROPOSER_ROLE, proposer);

        _updateProposedState(_authRoot);

        emit ProposerAdded(_authRoot, _proof.actionIndex);
    }

    function setOrgOwner(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        (address orgOwner, bool add) = abi.decode(_action.data, (address, bool));

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

        _updateProposedState(_authRoot);

        emit OrgOwnerSet(_authRoot, _proof.actionIndex);
    }

    function updateProject(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        // Use scope here to prevent "Stack too deep" error
        {
            (
                string memory projectName,
                address[] memory projectOwnersToRemove,
                uint256 newThreshold,
                address[] memory newProjectOwners
            ) = abi.decode(_action.data, (string, address[], uint256, address[]));

            if (bytes(projectName).length == 0) revert EmptyProjectName();
            if (newThreshold == 0) revert ThresholdCannotBeZero();
            if (thresholds[projectName] == 0) revert ProjectDoesNotExist();

            bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
            if (
                getRoleMemberCount(projectOwnerRole) -
                    projectOwnersToRemove.length +
                    newProjectOwners.length <
                newThreshold
            ) revert UnreachableThreshold();

            thresholds[projectName] = newThreshold;

            for (uint256 i = 0; i < projectOwnersToRemove.length; i++) {
                address projectOwnerToRemove = projectOwnersToRemove[i];
                if (!hasRole(projectOwnerRole, projectOwnerToRemove))
                    revert AddressDoesNotHaveRole();
                _revokeRole(projectOwnerRole, projectOwnerToRemove);
            }

            for (uint256 i = 0; i < newProjectOwners.length; i++) {
                address newProjectOwner = newProjectOwners[i];
                _assertValidRoleMemberAddress(newProjectOwner);
                if (hasRole(projectOwnerRole, newProjectOwner)) revert AddressAlreadyHasRole();
                _grantRole(projectOwnerRole, newProjectOwner);
            }
        }

        _updateProposedState(_authRoot);

        emit ProjectUpdated(_authRoot, _proof.actionIndex);
    }

    function setOrgOwnerThreshold(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        uint256 newThreshold = abi.decode(_action.data, (uint256));

        if (newThreshold == 0) revert ThresholdCannotBeZero();
        if (getRoleMemberCount(DEFAULT_ADMIN_ROLE) < newThreshold)
            revert ThresholdExceedsOwnerCount();

        orgOwnerThreshold = newThreshold;

        _updateProposedState(_authRoot);

        emit OrgOwnerThresholdSet(_authRoot, _proof.actionIndex);
    }

    function transferDeployerOwnership(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        address newOwner = abi.decode(_action.data, (address));

        _updateProposedState(_authRoot);

        IOwnable managerOwnable = IOwnable(address(manager));
        newOwner == address(0)
            ? managerOwnable.renounceOwnership()
            : managerOwnable.transferOwnership(newOwner);
        ChugSplashManagerProxy(payable(address(manager))).changeAdmin(newOwner);

        emit DeployerOwnershipTransferred(_authRoot, _proof.actionIndex);
    }

    // Reverts if the ChugSplashManager is currently executing a deployment.
    function upgradeDeployerImplementation(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        if (manager.isExecuting()) revert DeploymentInProgress();

        _updateProposedState(_authRoot);

        (address impl, bytes memory data) = abi.decode(_action.data, (address, bytes));
        ChugSplashManagerProxy deployerProxy = ChugSplashManagerProxy(payable(address(manager)));
        if (data.length > 0) {
            deployerProxy.upgradeToAndCall(impl, data);
        } else {
            deployerProxy.upgradeTo(impl);
        }

        emit DeployerUpgraded(_authRoot, _proof.actionIndex);
    }

    function upgradeAuthImplementation(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        (address impl, bytes memory data) = abi.decode(_action.data, (address, bytes));

        _updateProposedState(_authRoot);

        ChugSplashManagerProxy authProxy = ChugSplashManagerProxy(payable(address(this)));
        if (data.length > 0) {
            authProxy.upgradeToAndCall(impl, data);
        } else {
            authProxy.upgradeTo(impl);
        }

        emit AuthContractUpgraded(_authRoot, _proof.actionIndex);
    }

    // Reverts if the ChugSplashManager is currently executing a deployment.
    function upgradeDeployerAndAuthImpl(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(
            orgOwnerThreshold,
            DEFAULT_ADMIN_ROLE,
            _authRoot,
            _action,
            _signatures,
            _proof
        )
    {
        if (manager.isExecuting()) revert DeploymentInProgress();

        _updateProposedState(_authRoot);

        // Use scope here to prevent "Stack too deep" error
        {
            (
                address deployerImpl,
                bytes memory deployerData,
                address authImpl,
                bytes memory authData
            ) = abi.decode(_action.data, (address, bytes, address, bytes));

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

        emit DeployerAndAuthContractUpgraded(_authRoot, _proof.actionIndex);
    }

    /************************ PROJECT MANAGER FUNCTIONS *****************************/

    /**
     * @notice Creates a new project with the given name and threshold. Must be signed by at least
       one project manager. Note that this function wil revert if any of the contracts in the new
       project already belong to an existing project.
     */
    function createProject(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _action, _signatures, _proof)
    {
        _updateProposedState(_authRoot);

        // Use scope here to prevent "Stack too deep" error
        {
            (
                string memory projectName,
                uint256 threshold,
                address[] memory projectOwners,
                ContractInfo[] memory contractInfoArray
            ) = abi.decode(_action.data, (string, uint256, address[], ContractInfo[]));

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

        emit ProjectCreated(_authRoot, _proof.actionIndex);
    }

    function removeProposer(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _action, _signatures, _proof)
    {
        address proposerToRemove = abi.decode(_action.data, (address));
        if (!hasRole(PROPOSER_ROLE, proposerToRemove)) revert AddressDoesNotHaveRole();
        _revokeRole(PROPOSER_ROLE, proposerToRemove);

        _updateProposedState(_authRoot);

        emit ProposerRemoved(_authRoot, _proof.actionIndex);
    }

    function withdrawETH(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(1, PROJECT_MANAGER_ROLE, _authRoot, _action, _signatures, _proof)
    {
        address receiver = abi.decode(_action.data, (address));
        _updateProposedState(_authRoot);
        manager.withdrawOwnerETH(receiver);
        emit ETHWithdrawn(_authRoot, _proof.actionIndex);
    }

    /***************************** PROJECT OWNER FUNCTIONS ****************************/

    function approveDeployment(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (
            string memory projectName,
            bytes32 actionRoot,
            bytes32 targetRoot,
            uint256 numActions,
            uint256 numTargets,
            uint256 numImmutableContracts,
            string memory configUri
        ) = abi.decode(_action.data, (string, bytes32, bytes32, uint256, uint256, uint256, string));

        assertValidAuthAction(
            thresholds[projectName],
            keccak256(abi.encodePacked(projectName, "ProjectOwner")),
            _authRoot,
            _action,
            _signatures,
            _proof
        );

        _updateProposedState(_authRoot);

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

        emit DeploymentApproved(_authRoot, _proof.actionIndex);
    }

    function setProjectThreshold(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (string memory projectName, uint256 newThreshold) = abi.decode(
            _action.data,
            (string, uint256)
        );

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _action,
            _signatures,
            _proof
        );

        if (newThreshold == 0) revert ThresholdCannotBeZero();
        if (getRoleMemberCount(projectOwnerRole) < newThreshold) revert UnreachableThreshold();

        thresholds[projectName] = newThreshold;

        _updateProposedState(_authRoot);

        emit ProjectThresholdChanged(_authRoot, _proof.actionIndex);
    }

    function setProjectOwner(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (string memory projectName, address projectOwner, bool add) = abi.decode(
            _action.data,
            (string, address, bool)
        );

        if (bytes(projectName).length == 0) revert EmptyProjectName();

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        uint256 projectThreshold = thresholds[projectName];
        assertValidAuthAction(
            projectThreshold,
            projectOwnerRole,
            _authRoot,
            _action,
            _signatures,
            _proof
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

        _updateProposedState(_authRoot);

        emit ProjectOwnerSet(_authRoot, _proof.actionIndex);
    }

    // Reverts if any of the contracts don't belong to the project. Also reverts if the project has
    // a deployment that is currently executing.
    function removeProject(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (string memory projectName, address[] memory addresses) = abi.decode(
            _action.data,
            (string, address[])
        );
        if (addresses.length == 0) revert EmptyArray();

        _updateProposedState(_authRoot);

        string memory activeProjectName = manager
            .deployments(manager.activeDeploymentId())
            .projectName;
        if (keccak256(bytes(activeProjectName)) == keccak256(bytes(projectName)))
            revert ProjectHasActiveDeployment();

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _action,
            _signatures,
            _proof
        );

        uint256 numContractsToRemove = addresses.length;
        string memory existingProjectName;
        for (uint256 i = 0; i < numContractsToRemove; i++) {
            address contractAddress = addresses[i];
            existingProjectName = manager.contractToProject(contractAddress);
            if (keccak256(bytes(existingProjectName)) != keccak256(bytes(projectName)))
                revert ContractDoesNotExistInProject();
            manager.transferContractToProject(contractAddress, "");
        }

        if (manager.numContracts(projectName) > 0) revert LeftoverContractsInProject();

        thresholds[projectName] = 0;

        emit ProjectRemoved(_authRoot, _proof.actionIndex);
    }

    function cancelActiveDeployment(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        string memory projectName = abi.decode(_action.data, (string));

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _action,
            _signatures,
            _proof
        );

        _updateProposedState(_authRoot);

        manager.cancelActiveChugSplashDeployment();

        emit ActiveDeploymentCancelled(_authRoot, _proof.actionIndex);
    }

    // Allows the project owners to add or remove contracts to their project. Reverts if any of the
    // contracts already belong to another project. Reverts if a deployment in this project is
    // currently executing.
    function updateContractsInProject(
        bytes32 _authRoot,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    ) public incrementProtocolDebt(gasleft()) {
        (
            string memory projectName,
            address[] memory contractAddresses,
            bool[] memory addContract
        ) = abi.decode(_action.data, (string, address[], bool[]));

        uint256 numContracts = contractAddresses.length;
        if (numContracts == 0) revert EmptyArray();

        if (numContracts != addContract.length) revert ArrayLengthMismatch();

        _updateProposedState(_authRoot);

        string memory activeProjectName = manager
            .deployments(manager.activeDeploymentId())
            .projectName;
        if (keccak256(bytes(activeProjectName)) == keccak256(bytes(projectName)))
            revert ProjectHasActiveDeployment();

        bytes32 projectOwnerRole = keccak256(abi.encodePacked(projectName, "ProjectOwner"));
        assertValidAuthAction(
            thresholds[projectName],
            projectOwnerRole,
            _authRoot,
            _action,
            _signatures,
            _proof
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

        emit ContractsInProjectUpdated(_authRoot, _proof.actionIndex);
    }

    /****************************** PROPOSER FUNCTIONS ******************************/

    function propose(
        bytes32 _authRootToVerify,
        AuthAction memory _action,
        bytes[] memory _signatures,
        ActionProof memory _proof
    )
        public
        incrementProtocolDebt(gasleft())
        isValidAuthAction(1, PROPOSER_ROLE, _authRootToVerify, _action, _signatures, _proof)
    {
        (bytes32 authRootToPropose, uint256 numActions, uint256 numLeafs) = abi.decode(
            _action.data,
            (bytes32, uint256, uint256)
        );

        AuthStatus status = authStates[authRootToPropose].status;
        if (status == AuthStatus.PROPOSED) revert AuthRootAlreadyProposed();
        if (authRootToPropose == bytes32(0)) revert InvalidAuthRoot();
        if (numLeafs == 0) revert InvalidNumLeafs();
        // This check enforces expected user behavior, which is that one auth root will be signed
        // by a proposer, and another auth root will be signed by another role after the proposal.
        if (authRootToPropose == _authRootToVerify) revert AuthRootsCannotMatch();

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

        emit AuthRootProposed(authRootToPropose, _authRootToVerify, _proof.actionIndex);
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

    function _updateProposedState(bytes32 _authRoot) private {
        AuthState storage authState = authStates[_authRoot];
        nonce += 1;
        authState.actionsExecuted += 1;
        if (authState.actionsExecuted == authState.numActions) {
            authState.status = AuthStatus.COMPLETED;
            emit AuthStateCompleted(_authRoot);
        }
    }

    function _assertValidRoleMemberAddress(address _addr) private view {
        if (_addr == address(0)) revert RoleMemberCannotBeZeroAddress();
        if (_addr == address(this)) revert RoleMemberCannotBeThisContract();
    }
}
