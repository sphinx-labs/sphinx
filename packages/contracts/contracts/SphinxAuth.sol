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
import { ISphinxManager } from "./interfaces/ISphinxManager.sol";
import { IOwnable } from "./interfaces/IOwnable.sol";
import {
    AuthState,
    AuthStatus,
    AuthLeaf,
    DeploymentApproval,
    SetRoleMember
} from "./SphinxDataTypes.sol";
import { SphinxManagerProxy } from "./SphinxManagerProxy.sol";
import { Semver, Version } from "./Semver.sol";

/**
 * @title SphinxAuth
 * @custom:version 0.2.0
 */
contract SphinxAuth is AccessControlEnumerableUpgradeable, Semver {
    bytes32 private constant PROPOSER_ROLE = keccak256("ProposerRole");

    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name)");

    bytes32 private constant DOMAIN_NAME_HASH = keccak256(bytes("Sphinx"));

    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(abi.encode(DOMAIN_TYPE_HASH, DOMAIN_NAME_HASH));

    bytes32 private constant TYPE_HASH = keccak256("AuthRoot(bytes32 root)");

    ISphinxManager public manager;

    uint256 public threshold;

    string public projectName;

    /**
     * @notice Boolean indicating whether or not a proposal has been made. After this occurs, the
     *         the owners of this contract can no longer call `setup`.
     */
    bool public firstProposalOccurred;

    /**
     * @notice Mapping of an auth Merkle root to the corresponding AuthState.
     */
    mapping(bytes32 => AuthState) public authStates;

    event Setup(bytes32 indexed authRoot, uint256 numLeafs);
    event ProxyExported(bytes32 indexed authRoot, uint256 leafIndex);
    event OwnerSet(bytes32 indexed authRoot, uint256 leafIndex);
    event ThresholdSet(bytes32 indexed authRoot, uint256 leafIndex);
    event ManagerOwnershipTransferred(bytes32 indexed authRoot, uint256 leafIndex);
    event ManagerUpgraded(bytes32 indexed authRoot, uint256 leafIndex);
    event AuthContractUpgraded(bytes32 indexed authRoot, uint256 leafIndex);
    event ManagerAndAuthContractUpgraded(bytes32 indexed authRoot, uint256 leafIndex);
    event ProposerSet(bytes32 indexed authRoot, uint256 leafIndex);
    event DeploymentApproved(bytes32 indexed authRoot, uint256 leafIndex);
    event ActiveDeploymentCancelled(bytes32 indexed authRoot, uint256 leafIndex);
    event AuthRootProposed(bytes32 indexed authRoot, uint256 numLeafs);
    event AuthRootCompleted(bytes32 indexed authRoot, uint256 numLeafs);

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

        _verifySignatures(_authRoot, _leaf, _proof, _threshold, _verifyingRole, _signatures);
        _;
    }

    error AuthStateNotProposed();
    error ThresholdCannotBeZero();
    error ThresholdExceedsOwnerCount();
    error AddressAlreadyHasRole();
    error NotEnoughSignatures();
    error InvalidSignatureLength();
    error UnauthorizedSigner();
    error NonAscendingSignerOrder();
    error InvalidToAddress();
    error InvalidChainId();
    error InvalidLeafIndex();
    error InvalidMerkleProof();
    error FirstProposalOccurred();
    error AddressDoesNotHaveRole();
    error UnreachableThreshold();
    error EmptyProjectName();
    error DeploymentInProgress();
    error EmptyArray();
    error AuthStateNotEmpty();
    error AuthStateNotProposable();
    error InvalidNumLeafs();
    error FunctionDisabled();
    error RoleMemberCannotBeZeroAddress();
    error RoleMemberCannotBeThisContract();
    error NumLeafsMismatch();

    constructor(Version memory _version) Semver(_version.major, _version.minor, _version.patch) {
        // Disables initializing the implementation contract. Does not impact proxy contracts.
        _disableInitializers();
    }

    /**
     * @notice Initializes this contract. Must only be callable one time, which should occur
       immediately after contract creation. This is necessary because this contract is meant to
       exist as an implementation behind proxies.
     *
     * @param _manager Address of the SphinxManager contract.
     * @param _data Arbitrary data. Provides a flexible interface for future versions of this
                    contract. In this version, the data is expected to be the ABI-encoded
                    list of owners and the owner threshold. Note that the list of owners
                    should be in ascending order.
     */
    function initialize(
        address _manager,
        string memory _projectName,
        bytes memory _data
    ) external initializer {
        (address[] memory _owners, uint256 _threshold) = abi.decode(_data, (address[], uint256));

        if (bytes(_projectName).length == 0) revert EmptyProjectName();
        if (_threshold == 0) revert ThresholdCannotBeZero();
        if (_owners.length < _threshold) revert ThresholdExceedsOwnerCount();

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            _assertValidRoleMemberAddress(owner);

            // Throw an error if the caller is attempting to add the same owner twice, since
            // this means that the caller made a mistake.
            if (hasRole(DEFAULT_ADMIN_ROLE, owner)) revert AddressAlreadyHasRole();

            _grantRole(DEFAULT_ADMIN_ROLE, owner);
        }

        projectName = _projectName;
        manager = ISphinxManager(_manager);
        threshold = _threshold;

        __AccessControlEnumerable_init();
    }

    /********************************** OWNER FUNCTIONS **********************************/

    /**
     * @notice Sets initial proposers. The number of owner signatures must be greater than
     *         or equal to the threshold.

               This is the only permissioned function in this contract that doesn't require
               that the auth Merkle root has been proposed in a separate transaction.

               This function is callable until the first proposal occurs. This allows for the
               possibility that the owners mistakenly enter invalid initial proposers. For
               example, they may enter proposers addresses that don't exist on this chain. If this
               function was only callable once, then this contract would be unusable in this
               scenario, since every other public function requires that a proposal has occurred.
     *
     * @param _authRoot Auth Merkle root for the Merkle tree that the owners approved.
     * @param _leaf AuthLeaf struct. This is the decoded leaf of the auth tree.
     * @param _signatures List of meta transaction signatures. Must correspond to signer addresses
     *                    in ascending order (see `_verifySignatures` for more info).
     * @param _proof    Merkle proof of the leaf in the auth tree.
     */
    function setup(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    ) public {
        if (firstProposalOccurred) revert FirstProposalOccurred();

        _verifySignatures(_authRoot, _leaf, _proof, threshold, DEFAULT_ADMIN_ROLE, _signatures);

        AuthStatus status = authStates[_authRoot].status;

        if (status != AuthStatus.EMPTY) revert AuthStateNotEmpty();

        (SetRoleMember[] memory proposers, uint256 numLeafs) = abi.decode(
            _leaf.data,
            (SetRoleMember[], uint256)
        );

        if (numLeafs == 0) revert InvalidNumLeafs();
        // There must be at least one proposer or else this function will be unusable, since every
        // other public function requires that a proposal has occurred.
        if (proposers.length == 0) revert EmptyArray();

        uint256 numProposers = proposers.length;
        bool add;
        address proposer;
        for (uint256 i = 0; i < numProposers; i++) {
            proposer = proposers[i].member;
            add = proposers[i].add;
            if (add) {
                _assertValidRoleMemberAddress(proposer);
                if (hasRole(PROPOSER_ROLE, proposer)) revert AddressAlreadyHasRole();
                _grantRole(PROPOSER_ROLE, proposer);
            } else {
                if (!hasRole(PROPOSER_ROLE, proposer)) revert AddressDoesNotHaveRole();
                _revokeRole(PROPOSER_ROLE, proposer);
            }
        }

        if (numLeafs == 1) {
            // Mark the auth root as completed if there is only one leaf.
            authStates[_authRoot] = AuthState({
                status: AuthStatus.COMPLETED,
                leafsExecuted: 1,
                numLeafs: numLeafs
            });
            emit AuthRootCompleted(_authRoot, numLeafs);
        } else {
            // Set the status to be `SETUP` if there are more leafs to execute in this tree. Note
            // that it's not possible for there to be zero leafs since we would have reverted
            // earlier in this function.
            authStates[_authRoot] = AuthState({
                status: AuthStatus.SETUP,
                leafsExecuted: 1,
                numLeafs: numLeafs
            });
        }

        emit Setup(_authRoot, numLeafs);
    }

    function exportProxy(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
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

    function setOwner(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        (address owner, bool add) = abi.decode(_leaf.data, (address, bool));

        if (add) {
            _assertValidRoleMemberAddress(owner);
            if (hasRole(DEFAULT_ADMIN_ROLE, owner)) revert AddressAlreadyHasRole();
            _grantRole(DEFAULT_ADMIN_ROLE, owner);
        } else {
            if (getRoleMemberCount(DEFAULT_ADMIN_ROLE) <= threshold) revert UnreachableThreshold();
            if (!hasRole(DEFAULT_ADMIN_ROLE, owner)) revert AddressDoesNotHaveRole();
            _revokeRole(DEFAULT_ADMIN_ROLE, owner);
        }

        _updateProposedAuthState(_authRoot);

        emit OwnerSet(_authRoot, _leaf.index);
    }

    function setThreshold(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        uint256 newThreshold = abi.decode(_leaf.data, (uint256));

        if (newThreshold == 0) revert ThresholdCannotBeZero();
        if (getRoleMemberCount(DEFAULT_ADMIN_ROLE) < newThreshold)
            revert ThresholdExceedsOwnerCount();

        threshold = newThreshold;

        _updateProposedAuthState(_authRoot);

        emit ThresholdSet(_authRoot, _leaf.index);
    }

    function transferManagerOwnership(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
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
        SphinxManagerProxy(payable(address(manager))).changeAdmin(newOwner);

        emit ManagerOwnershipTransferred(_authRoot, _leaf.index);
    }

    // Reverts if the SphinxManager is currently executing a deployment.
    function upgradeManagerImplementation(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        if (manager.isExecuting()) revert DeploymentInProgress();

        _updateProposedAuthState(_authRoot);

        (address impl, bytes memory data) = abi.decode(_leaf.data, (address, bytes));
        SphinxManagerProxy managerProxy = SphinxManagerProxy(payable(address(manager)));
        if (data.length > 0) {
            managerProxy.upgradeToAndCall(impl, data);
        } else {
            managerProxy.upgradeTo(impl);
        }

        emit ManagerUpgraded(_authRoot, _leaf.index);
    }

    function upgradeAuthImplementation(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        (address impl, bytes memory data) = abi.decode(_leaf.data, (address, bytes));

        _updateProposedAuthState(_authRoot);

        SphinxManagerProxy authProxy = SphinxManagerProxy(payable(address(this)));
        if (data.length > 0) {
            authProxy.upgradeToAndCall(impl, data);
        } else {
            authProxy.upgradeTo(impl);
        }

        emit AuthContractUpgraded(_authRoot, _leaf.index);
    }

    // Reverts if the SphinxManager is currently executing a deployment.
    function upgradeManagerAndAuthImpl(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        if (manager.isExecuting()) revert DeploymentInProgress();

        _updateProposedAuthState(_authRoot);

        // Use scope here to prevent "Stack too deep" error
        {
            (
                address managerImpl,
                bytes memory managerInitCallData,
                address authImpl,
                bytes memory authInitCallData
            ) = abi.decode(_leaf.data, (address, bytes, address, bytes));

            SphinxManagerProxy managerProxy = SphinxManagerProxy(payable(address(manager)));
            SphinxManagerProxy authProxy = SphinxManagerProxy(payable(address(this)));

            if (managerInitCallData.length > 0) {
                managerProxy.upgradeToAndCall(managerImpl, managerInitCallData);
            } else {
                managerProxy.upgradeTo(managerImpl);
            }

            if (authInitCallData.length > 0) {
                authProxy.upgradeToAndCall(authImpl, authInitCallData);
            } else {
                authProxy.upgradeTo(authImpl);
            }
        }

        emit ManagerAndAuthContractUpgraded(_authRoot, _leaf.index);
    }

    function setProposer(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
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

    function approveDeployment(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        // We must use a struct because unpacking the data into a tuple causes a "Stack too deep"
        // error.
        DeploymentApproval memory approval = abi.decode(_leaf.data, (DeploymentApproval));

        _updateProposedAuthState(_authRoot);

        manager.approve(
            approval.actionRoot,
            approval.targetRoot,
            approval.numInitialActions,
            approval.numSetStorageActions,
            approval.numTargets,
            approval.configUri,
            true
        );

        emit DeploymentApproved(_authRoot, _leaf.index);
    }

    function cancelActiveDeployment(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes[] memory _signatures,
        bytes32[] memory _proof
    )
        public
        isValidProposedAuthLeaf(
            _authRoot,
            _leaf,
            _proof,
            threshold,
            DEFAULT_ADMIN_ROLE,
            _signatures
        )
    {
        _updateProposedAuthState(_authRoot);
        manager.cancelActiveSphinxDeployment();
        emit ActiveDeploymentCancelled(_authRoot, _leaf.index);
    }

    /****************************** PROPOSER FUNCTIONS ******************************/

    /**
     * @notice Allows a proposer to propose a new auth Merkle root. This function may
     * be called as the first leaf of a new auth Merkle tree, or as the second leaf
     * after the `setup` function has been called.
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
    ) public {
        _verifySignatures(_authRoot, _leaf, _proof, 1, PROPOSER_ROLE, _signatures);

        uint256 numLeafs = abi.decode(_leaf.data, (uint256));

        AuthState storage authState = authStates[_authRoot];
        AuthStatus status = authState.status;
        uint256 leafsExecuted = authState.leafsExecuted;

        if (status == AuthStatus.EMPTY) {
            // The proposal counts as the first leaf, so there must be at least one other leaf, or
            // else there will be nothing left to execute for this auth root.
            if (numLeafs <= 1) revert InvalidNumLeafs();
        } else if (status == AuthStatus.SETUP) {
            // The first leaf was the setup leaf, and the current proposal counts as the second
            // leaf, so there must be at least one other leaf or else there will be nothing left to
            // execute for this auth root.
            if (numLeafs <= 2) revert InvalidNumLeafs();

            // We sanity check that the number of leafs passed as an input to this function matches
            // the number of leafs in the auth state, which was set during the setup function. If
            // these don't match, there's a bug in the off-chain logic. It's not strictly necessary
            // for us to check this here, since we can just use the numLeafs that was set during the
            // setup function, but we do it anyway to ensure that there isn't a bug in the off-chain
            // logic.
            if (numLeafs != authState.numLeafs) revert NumLeafsMismatch();
        } else {
            // We don't allow auth Merkle roots to be proposed more than once. Otherwise, anyone
            // could call this function to re-propose an auth root that has already been proposed.
            revert AuthStateNotProposable();
        }

        authStates[_authRoot] = AuthState({
            status: AuthStatus.PROPOSED,
            leafsExecuted: leafsExecuted + 1,
            numLeafs: numLeafs
        });

        if (!firstProposalOccurred) {
            firstProposalOccurred = true;
        }

        emit AuthRootProposed(_authRoot, numLeafs);
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
    function _verifySignatures(
        bytes32 _authRoot,
        AuthLeaf memory _leaf,
        bytes32[] memory _proof,
        uint256 _threshold,
        bytes32 _verifyingRole,
        bytes[] memory _signatures
    ) private view {
        if (_threshold == 0) revert ThresholdCannotBeZero();
        if (_signatures.length < _threshold) revert NotEnoughSignatures();

        AuthState memory authState = authStates[_authRoot];
        uint256 leafsExecuted = authState.leafsExecuted;

        // Validate the fields of the AuthLeaf
        if (_leaf.to != address(manager)) revert InvalidToAddress();
        if (_leaf.chainId != block.chainid) revert InvalidChainId();
        if (_leaf.index != leafsExecuted) revert InvalidLeafIndex();

        if (!MerkleProofUpgradeable.verify(_proof, _authRoot, _getAuthLeafHash(_leaf)))
            revert InvalidMerkleProof();

        bytes32 structHash = keccak256(abi.encode(TYPE_HASH, _authRoot));
        bytes32 typedDataHash = ECDSAUpgradeable.toTypedDataHash(DOMAIN_SEPARATOR, structHash);

        address signer;
        address prevSigner = address(0);
        for (uint256 i = 0; i < _threshold; i++) {
            bytes memory signature = _signatures[i];
            if (signature.length != 65) revert InvalidSignatureLength();

            signer = ECDSAUpgradeable.recover(typedDataHash, signature);
            if (!hasRole(_verifyingRole, signer)) revert UnauthorizedSigner();
            if (signer <= prevSigner) revert NonAscendingSignerOrder();

            prevSigner = signer;
        }
    }

    function _getAuthLeafHash(AuthLeaf memory _leaf) private pure returns (bytes32) {
        return
            keccak256(
                bytes.concat(
                    keccak256(abi.encode(_leaf.chainId, _leaf.to, _leaf.index, _leaf.data))
                )
            );
    }

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
