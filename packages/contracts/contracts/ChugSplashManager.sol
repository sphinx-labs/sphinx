// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "hardhat/console.sol";

import {
    ChugSplashBundleState,
    ChugSplashAction,
    ChugSplashActionType,
    ChugSplashBundleStatus
} from "./ChugSplashDataTypes.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Proxy } from "./libraries/Proxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { IProxyAdapter } from "./IProxyAdapter.sol";
import { ProxyUpdater } from "./ProxyUpdater.sol";
import { Create2 } from "./libraries/Create2.sol";
import { MerkleTree } from "./libraries/MerkleTree.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

/**
 * @title ChugSplashManager
 */
contract ChugSplashManager is OwnableUpgradeable, ReentrancyGuardUpgradeable {
    /**
     * @notice Emitted when a ChugSplash bundle is proposed.
     *
     * @param bundleId   ID of the bundle being proposed.
     * @param bundleRoot Root of the proposed bundle's merkle tree.
     * @param bundleSize Number of steps in the proposed bundle.
     * @param configUri  URI of the config file that can be used to re-generate the bundle.
     */
    event ChugSplashBundleProposed(
        bytes32 indexed bundleId,
        bytes32 bundleRoot,
        uint256 bundleSize,
        string configUri
    );

    /**
     * @notice Emitted when a ChugSplash bundle is approved.
     *
     * @param bundleId ID of the bundle being approved.
     */
    event ChugSplashBundleApproved(bytes32 indexed bundleId);

    /**
     * @notice Emitted when a ChugSplash action is executed.
     *
     * @param bundleId    Unique ID for the bundle.
     * @param proxy       Address of the proxy on which the event was executed.
     * @param executor    Address of the executor.
     * @param actionIndex Index within the bundle hash of the action that was executed.
     */
    event ChugSplashActionExecuted(
        bytes32 indexed bundleId,
        address indexed proxy,
        address indexed executor,
        uint256 actionIndex
    );

    /**
     * @notice Emitted when a ChugSplash bundle is completed.
     *
     * @param bundleId        Unique ID for the bundle.
     * @param executor        Address of the executor.
     * @param actionsExecuted Total number of completed actions.
     */
    event ChugSplashBundleCompleted(
        bytes32 indexed bundleId,
        address indexed executor,
        uint256 actionsExecuted
    );

    /**
     * @notice Emitted when an active ChugSplash bundle is cancelled.
     *
     * @param bundleId        Bundle ID that was cancelled.
     * @param owner           Owner of the ChugSplashManager.
     * @param actionsExecuted Total number of completed actions before cancellation.
     */
    event ChugSplashBundleCancelled(
        bytes32 indexed bundleId,
        address indexed owner,
        uint256 actionsExecuted
    );

    /**
     * @notice Emitted when ownership of a proxy is transferred from the ProxyAdmin to the project
     *         owner.
     *
     * @param referenceNameHash Hash of the reference name.
     * @param proxy             Address of the proxy that is the subject of the ownership transfer.
     * @param proxyType         The proxy type.
     * @param newOwner          Address of the project owner that is receiving ownership of the
     *                          proxy.
     * @param referenceName     String reference name.
     */
    event ProxyOwnershipTransferred(
        string indexed referenceNameHash,
        address indexed proxy,
        bytes32 indexed proxyType,
        address newOwner,
        string referenceName
    );

    /**
     * @notice Emitted when a custom proxy is assigned to a reference name.
     *
     * @param referenceNameHash Hash of the reference name.
     * @param proxy             Address of the proxy.
     * @param proxyType         The proxy type.
     * @param referenceName     String reference name.
     */
    event ProxySetToReferenceName(
        string indexed referenceNameHash,
        address indexed proxy,
        bytes32 indexed proxyType,
        string referenceName
    );

    /**
     * @notice Emitted when an executor claims a payment.
     *
     * @param executor The executor being paid.
     * @param amount   The ETH amount sent to the executor.
     */
    event ExecutorPaymentClaimed(address indexed executor, uint256 amount);

    /**
     * @notice Emitted when the owner withdraws ETH from this contract.
     *
     * @param owner  Address that initiated the withdrawal.
     * @param amount ETH amount withdrawn.
     */
    event OwnerWithdrewETH(address indexed owner, uint256 amount);

    /**
     * @notice Emitted when the owner of this contract adds a new proposer.
     *
     * @param proposer Address of the proposer that was added.
     * @param proposer Address of the owner.
     */
    event ProposerAdded(address indexed proposer, address indexed owner);

    /**
     * @notice Emitted when the owner of this contract removes an existing proposer.
     *
     * @param proposer Address of the proposer that was removed.
     * @param proposer Address of the owner.
     */
    event ProposerRemoved(address indexed proposer, address indexed owner);

    /**
     * @notice Emitted when ETH is deposited in this contract
     */
    event ETHDeposited(address indexed from, uint256 indexed amount);

    /**
     * @notice Emitted when a default proxy is deployed by this contract.
     *
     * @param referenceNameHash Hash of the reference name. This equals the salt used to deploy the
     *                          proxy.
     * @param proxy             Address of the deployed proxy.
     * @param bundleId          ID of the bundle in which the proxy was deployed.
     * @param referenceName     String reference name.
     */
    event DefaultProxyDeployed(
        string indexed referenceNameHash,
        address indexed proxy,
        bytes32 indexed bundleId,
        string referenceName
    );

    /**
     * @notice Emitted when an implementation contract is deployed by this contract.
     *
     * @param referenceNameHash Hash of the reference name.
     * @param implementation    Address of the deployed implementation.
     * @param bundleId          ID of the bundle in which the implementation was deployed.
     * @param referenceName     String reference name.
     */
    event ImplementationDeployed(
        string indexed referenceNameHash,
        address indexed implementation,
        bytes32 indexed bundleId,
        string referenceName
    );

    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @notice Address of the ProxyUpdater.
     */
    address public immutable proxyUpdater;

    /**
     * @notice Amount that must be deposited in this contract in order to execute a bundle. The
     *         project owner can withdraw this amount whenever a bundle is not active. This bond
     *         will be forfeited if the project owner cancels a bundle that is in progress, which is
     *         necessary to prevent owners from trolling the executor by immediately cancelling and
     *         withdrawing funds.
     */
    uint256 public immutable ownerBondAmount;

    /**
     * @notice Amount of time for an executor to finish executing a bundle once they have claimed
     *         it. If the executor fails to completely execute the bundle in this amount of time,
     *         their bond is forfeited to the ChugSplashManager.
     */
    uint256 public immutable executionLockTime;

    /**
     * @notice Amount that the executor is paid, denominated as a percentage of the cost of
     *         execution. For example: if a bundle costs 1 gwei to execute and the
     *         executorPaymentPercentage is 10, then the executor will profit 0.1 gwei.
     */
    uint256 public immutable executorPaymentPercentage;

    /**
     * @notice Mapping of reference names to proxy addresses. If a reference name is using the
     *         default proxy, then its value in this mapping is the zero-address.
     */
    mapping(string => address payable) public proxies;

    /**
     * @notice Mapping of reference names to proxy types. If a reference name is using the default
     *         proxy, then its value in this mapping is bytes32(0).
     */
    mapping(string => bytes32) public proxyTypes;

    /**
     * @notice Mapping of salt values to deployed implementation addresses. An implementation
     *         address is stored in this mapping in each DeployImplementation action, and is
     *         retrieved in the SetImplementation action. The salt is a hash of the bundle ID and
     *         reference name, which is guaranteed to be unique within this contract since each
     *         bundle ID can only be executed once and each reference name is unique within a
     *         bundle. The salt prevents address collisions, which would otherwise be possible since
     *         we use Create2 to deploy the implementations.
     */
    mapping(bytes32 => address) public implementations;

    /**
     * @notice Maps an address to a boolean indicating if the address is allowed to propose bundles.
     *         The owner of this contract is the only address that can add or remove proposers from
     *         this mapping.
     */
    mapping(address => bool) public proposers;

    /**
     * @notice Mapping of bundle IDs to bundle state.
     */
    mapping(bytes32 => ChugSplashBundleState) internal _bundles;

    /**
     * @notice Name of the project this contract is managing.
     */
    string public name;

    /**
     * @notice ID of the currently active bundle.
     */
    bytes32 public activeBundleId;

    /**
     * @notice ETH amount that is owed to the executor.
     */
    uint256 public debt;

    /**
     * @notice Modifier that restricts access to the executor.
     */
    modifier onlyExecutor() {
        require(
            registry.executors(msg.sender) == true,
            "ChugSplashManager: caller is not an executor"
        );
        _;
    }

    /**
     * @param _registry                  Address of the ChugSplashRegistry.
     * @param _proxyUpdater              Address of the ProxyUpdater.
     * @param _executionLockTime         Amount of time for an executor to completely execute a
     *                                   bundle after claiming it.
     * @param _ownerBondAmount           Amount that must be deposited in this contract in order to
     *                                   execute a bundle.
     * @param _executorPaymentPercentage Amount that an executor will earn from completing a bundle,
     *                                   denominated as a percentage.
     */
    constructor(
        ChugSplashRegistry _registry,
        address _proxyUpdater,
        uint256 _executionLockTime,
        uint256 _ownerBondAmount,
        uint256 _executorPaymentPercentage
    ) {
        registry = _registry;
        proxyUpdater = _proxyUpdater;
        executionLockTime = _executionLockTime;
        ownerBondAmount = _ownerBondAmount;
        executorPaymentPercentage = _executorPaymentPercentage;
    }

    /**
     * @param _name  Name of the project this contract is managing.
     * @param _owner Initial owner of this contract.
     */
    function initialize(string memory _name, address _owner) public initializer {
        name = _name;

        __Ownable_init();
        _transferOwnership(_owner);
    }

    /**
     * @notice Computes the bundle ID from the bundle parameters.
     *
     * @param _bundleRoot Root of the bundle's merkle tree.
     * @param _bundleSize Number of elements in the bundle's tree.
     * @param _configUri  URI pointing to the config file for the bundle.
     *
     * @return Unique ID for the bundle.
     */
    function computeBundleId(
        bytes32 _bundleRoot,
        uint256 _bundleSize,
        string memory _configUri
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(_bundleRoot, _bundleSize, _configUri));
    }

    /**
     * @notice Gets the ChugSplashBundleState struct for a given bundle ID. Note that we explicitly
     *         define this function because the getter function that is automatically generated by
     *         the Solidity compiler doesn't return a struct.
     *
     * @param _bundleId Bundle ID.
     *
     * @return ChugSplashBundleState struct.
     */
    function bundles(bytes32 _bundleId) public view returns (ChugSplashBundleState memory) {
        return _bundles[_bundleId];
    }

    /**
     * @notice Computes the Create2 address of the default EIP-1967 proxy deployed by the
     *         ChugSplashManager when a bundle is executed. Note that there will not be a contract
     *         at the deployed address until one with the given reference name is executed by
     *         the ChugSplashManager.
     *
     * @param _name Reference name get the corresponding proxy address of.
     *
     * @return Address of the proxy for the given name.
     */
    function getDefaultProxyAddress(string memory _name) public view returns (address payable) {
        return (
            payable(
                Create2.compute(
                    address(this),
                    keccak256(bytes(_name)),
                    abi.encodePacked(type(Proxy).creationCode, abi.encode(address(this)))
                )
            )
        );
    }

    /**
     * @notice Propose a new ChugSplash bundle to be approved. Only callable by the owner of this
     *         contract or a proposer. These permissions are required to prevent spam.
     *
     * @param _bundleRoot Root of the bundle's merkle tree.
     * @param _bundleSize Number of elements in the bundle's tree.
     * @param _configUri  URI pointing to the config file for the bundle.
     */
    function proposeChugSplashBundle(
        bytes32 _bundleRoot,
        uint256 _bundleSize,
        string memory _configUri
    ) public {
        require(
            msg.sender == owner() || proposers[msg.sender] == true,
            "ChugSplashManager: caller must be proposer or owner"
        );

        bytes32 bundleId = computeBundleId(_bundleRoot, _bundleSize, _configUri);
        ChugSplashBundleState storage bundle = _bundles[bundleId];

        require(
            bundle.status == ChugSplashBundleStatus.EMPTY,
            "ChugSplashManager: bundle already exists"
        );

        bundle.status = ChugSplashBundleStatus.PROPOSED;
        bundle.executions = new bool[](_bundleSize);
        bundle.merkleRoot = _bundleRoot;

        emit ChugSplashBundleProposed(bundleId, _bundleRoot, _bundleSize, _configUri);
        registry.announce("ChugSplashBundleProposed");
    }

    /**
     * @notice Allows the owner to approve a bundle to be executed. There must be at least
     *         `ownerBondAmount` deposited in this contract in order for a bundle to be approved.
     *         The owner can send the bond to this contract via a call to `depositETH` or `receive`.
     *         This bond will be forfeited if the project owner cancels an approved bundle. Also
     *         note that the bundle can be executed as soon as it is approved.
     *
     * @param _bundleId ID of the bundle to approve
     */
    function approveChugSplashBundle(bytes32 _bundleId) public onlyOwner {
        require(
            address(this).balance - debt >= ownerBondAmount,
            "ChugSplashManager: insufficient balance in manager"
        );

        ChugSplashBundleState storage bundle = _bundles[_bundleId];

        require(
            bundle.status == ChugSplashBundleStatus.PROPOSED,
            "ChugSplashManager: bundle does not exist or has already been approved or completed"
        );

        require(
            activeBundleId == bytes32(0),
            "ChugSplashManager: another bundle has been approved and not yet completed"
        );

        activeBundleId = _bundleId;
        bundle.status = ChugSplashBundleStatus.APPROVED;

        emit ChugSplashBundleApproved(_bundleId);
        registry.announce("ChugSplashBundleApproved");
    }

    /**
     * @notice Executes multiple ChugSplash actions at once. This speeds up execution time since the
     *         executor doesn't need to send as many transactions to execute a bundle. Note that
     *         this function only accepts SetStorage and DeployImplementation actions.
     *         SetImplementation actions must be sent separately to `completeChugSplashBundle` after
     *         the SetStorage and DeployImplementation actions have been executed. Only callable by
     *         the executor.
     *
     * @param _actions       Array of SetStorage/DeployImplementation actions to execute.
     * @param _actionIndexes Array of action indexes.
     * @param _proofs        Array of Merkle proofs for each action.
     */
    function executeMultipleActions(
        ChugSplashAction[] memory _actions,
        uint256[] memory _actionIndexes,
        bytes32[][] memory _proofs
    ) public onlyExecutor {
        console.log('a');
        for (uint256 i = 0; i < _actions.length; i++) {
            executeChugSplashAction(_actions[i], _actionIndexes[i], _proofs[i]);
        }
    }

    /**
     * @notice Executes a specific action within the current active bundle for a project. Actions
     *         can only be executed once. A re-entrancy guard is added to prevent an implementation
     *         contract's constructor from calling another contract which in turn calls back into
     *         this function. Only callable by the executor
     *
     * @param _action      Action to execute.
     * @param _actionIndex Index of the action in the bundle.
     * @param _proof       Merkle proof of the action within the bundle.
     */
    function executeChugSplashAction(
        ChugSplashAction memory _action,
        uint256 _actionIndex,
        bytes32[] memory _proof
    ) public nonReentrant onlyExecutor {
        uint256 initialGasLeft = gasleft();

        console.log('b');
        require(
            activeBundleId != bytes32(0),
            "ChugSplashManager: no bundle has been approved for execution"
        );

        ChugSplashBundleState storage bundle = _bundles[activeBundleId];
        console.logBytes32(activeBundleId);
        console.log('executions: ', bundle.executions.length);
        require(
            bundle.executions[_actionIndex] == false,
            "ChugSplashManager: action has already been executed"
        );

        require(
            MerkleTree.verify(
                bundle.merkleRoot,
                keccak256(abi.encode(_action.referenceName, _action.actionType, _action.data)),
                _actionIndex,
                _proof,
                bundle.executions.length
            ),
            "ChugSplashManager: invalid bundle action proof"
        );

        console.log('c');

        // Get the proxy type and adapter for this reference name.
        bytes32 proxyType = proxyTypes[_action.referenceName];
        address adapter = registry.adapters(proxyType);

        require(adapter != address(0), "ChugSplashManager: proxy type has no adapter");

        // Get the proxy to use for this reference name. The proxy can either be the default proxy
        // used by ChugSplash or a non-standard proxy that has previously been set by the project
        // owner.
        address payable proxy;
        if (proxyType == bytes32(0)) {
            // Use a default proxy if this reference name has no proxy type assigned to it.

            // Make sure the proxy has code in it and deploy the proxy if it doesn't. Since we're
            // deploying via CREATE2, we can always correctly predict what the proxy address
            // *should* be and can therefore easily check if it's already populated. TODO: See if
            // there's a better way to handle this case because it messes with the gas cost of
            // DEPLOY_IMPLEMENTATION/SET_STORAGE operations in a somewhat unpredictable way.
            proxy = getDefaultProxyAddress(_action.referenceName);
            if (proxy.code.length == 0) {
                bytes32 salt = keccak256(bytes(_action.referenceName));
                Proxy created = new Proxy{ salt: salt }(address(this));

                // Could happen if insufficient gas is supplied to this transaction, should not
                // happen otherwise. If there's a situation in which this could happen other than a
                // standard OOG, then this would halt the entire contract. TODO: Make sure this
                // cannot happen in any case other than OOG.
                require(
                    address(created) == proxy,
                    "ChugSplashManager: Proxy was not created correctly"
                );

                emit DefaultProxyDeployed(
                    _action.referenceName,
                    proxy,
                    activeBundleId,
                    _action.referenceName
                );
                registry.announceWithData("DefaultProxyDeployed", abi.encodePacked(proxy));
            }
        } else {
            // Use the non-standard proxy assigned to this reference name by the owner.
            proxy = proxies[_action.referenceName];
        }

        if (_getProxyImplementation(proxy, adapter) != registry.reverter()) {
            console.log('d');
            // Set the proxy's implementation to be the Reverter. This ensures that end-users can't
            // accidentally interact with a proxy that is in the process of being upgraded. Note
            // that we use a Reverter contract instead of address(0) to support OpenZeppelin's
            // `TransparentUpgradeableProxy`, whose `upgradeTo` call reverts if the implementation
            // is not a contract.
            _upgradeProxyTo(proxy, adapter, registry.reverter());
            console.log('e');
        }

        // Mark the action as executed and update the total number of executed actions.
        bundle.actionsExecuted++;
        bundle.executions[_actionIndex] = true;

        // Next, we execute the ChugSplash action by calling deployImplementation/setStorage.
        if (_action.actionType == ChugSplashActionType.DEPLOY_IMPLEMENTATION) {
            _deployImplementation(_action.referenceName, _action.data);
        } else if (_action.actionType == ChugSplashActionType.SET_STORAGE) {
            console.log('f');
            console.log(_action.referenceName);
            (bytes32 key, bytes32 val) = abi.decode(_action.data, (bytes32, bytes32));
            _setProxyStorage(proxy, adapter, key, val);
        } else {
            revert("ChugSplashManager: attemped setImplementation action in wrong function");
        }

        emit ChugSplashActionExecuted(activeBundleId, proxy, msg.sender, _actionIndex);
        console.log('i');
        registry.announceWithData("ChugSplashActionExecuted", abi.encodePacked(proxy));

        // Estimate the amount of gas used in this call by subtracting the current gas left from the
        // initial gas left. We add 152778 to this amount to account for the intrinsic gas cost
        // (21k), the calldata usage, and the subsequent opcodes that occur when we add the
        // executorPayment to the debt and debt. Unfortunately, there is a wide variance in the gas
        // costs of these last opcodes due to the variable cost of SSTORE. Also, gas refunds might
        // be contributing to the difficulty of getting a good estimate. For now, we err on the side
        // of safety by adding a larger value. TODO: Get a better estimate than 152778.
        uint256 gasUsed = 152778 + initialGasLeft - gasleft();

        console.log('z');

        // Calculate the executor's payment and add it to the debt owed to the executor.
        uint256 executorPayment;
        if (block.chainid != 10 && block.chainid != 420) {
            // Use the gas price for any network that isn't Optimism.
            executorPayment = (tx.gasprice * gasUsed * (100 + executorPaymentPercentage)) / 100;
        } else if (block.chainid == 10) {
            // Optimism mainnet does not include `tx.gasprice` in the transaction, so we hardcode
            // its value here.
            executorPayment = (1000000 * gasUsed * (100 + executorPaymentPercentage)) / 100;
        } else {
            // Optimism mainnet does not include `tx.gasprice` in the transaction, so we hardcode
            // its value here.
            executorPayment = (gasUsed * (100 + executorPaymentPercentage)) / 100;
        }

        debt += executorPayment;
    }

    /**
     * @notice Completes the bundle by executing all SetImplementation actions. This occurs in a
     *         single transaction to ensure that all contracts are initialized at the same time.
     *         Note that this function will revert if it is called before all of the SetCode and
     *         DeployImplementation actions have been executed in `executeChugSplashAction`.
     *         Only callable by the executor.
     *
     * @param _actions       Array of ChugSplashActions, where each action type must be
     *                       `SET_IMPLEMENTATION`.
     * @param _actionIndexes Array of action indexes.
     * @param _proofs        Array of Merkle proofs.
     */
    function completeChugSplashBundle(
        ChugSplashAction[] memory _actions,
        uint256[] memory _actionIndexes,
        bytes32[][] memory _proofs
    ) public onlyExecutor {
        uint256 initialGasLeft = gasleft();

        require(
            activeBundleId != bytes32(0),
            "ChugSplashManager: no bundle has been approved for execution"
        );

        ChugSplashBundleState storage bundle = _bundles[activeBundleId];

        for (uint256 i = 0; i < _actions.length; i++) {
            ChugSplashAction memory action = _actions[i];
            uint256 actionIndex = _actionIndexes[i];
            bytes32[] memory proof = _proofs[i];

            require(
                bundle.executions[actionIndex] == false,
                "ChugSplashManager: action has already been executed"
            );

            require(
                MerkleTree.verify(
                    bundle.merkleRoot,
                    keccak256(abi.encode(action.referenceName, action.actionType, action.data)),
                    actionIndex,
                    proof,
                    bundle.executions.length
                ),
                "ChugSplashManager: invalid bundle action proof"
            );

            // Mark the action as executed and update the total number of executed actions.
            bundle.actionsExecuted++;
            bundle.executions[actionIndex] = true;

            // Get the implementation address using the salt as its key.
            address implementation = implementations[
                keccak256(abi.encode(activeBundleId, bytes(action.referenceName)))
            ];

            // Get the proxy type and adapter for this reference name.
            bytes32 proxyType = proxyTypes[action.referenceName];
            address adapter = registry.adapters(proxyType);

            // Get the address of the proxy.
            address payable proxy;
            if (proxyType == bytes32(0)) {
                proxy = getDefaultProxyAddress(action.referenceName);
            } else {
                // Use the non-standard proxy assigned to this reference name by the owner.
                proxy = proxies[action.referenceName];
            }

            // Upgrade the proxy's implementation contract.
            _upgradeProxyTo(proxy, adapter, implementation);

            emit ChugSplashActionExecuted(activeBundleId, proxy, msg.sender, actionIndex);
            registry.announceWithData("ChugSplashActionExecuted", abi.encodePacked(proxy));
        }

        require(
            bundle.actionsExecuted == bundle.executions.length,
            "ChugSplashManager: bundle was not completed"
        );

        // If all actions have been executed, then we can complete the bundle. Mark the bundle as
        // completed and reset the active bundle hash so that a new bundle can be executed.
        bundle.status = ChugSplashBundleStatus.COMPLETED;
        bytes32 completedBundleId = activeBundleId;
        activeBundleId = bytes32(0);

        emit ChugSplashBundleCompleted(completedBundleId, msg.sender, bundle.actionsExecuted);
        registry.announce("ChugSplashBundleCompleted");

        // See the explanation in `executeChugSplashAction`.
        uint256 gasUsed = 152778 + initialGasLeft - gasleft();

        // Calculate the executor's payment.
        uint256 executorPayment;
        if (block.chainid != 10 && block.chainid != 420) {
            // Use the gas price for any network that isn't Optimism.
            executorPayment = (tx.gasprice * gasUsed * (100 + executorPaymentPercentage)) / 100;
        } else if (block.chainid == 10) {
            // Optimism mainnet does not include `tx.gasprice` in the transaction, so we hardcode
            // its value here.
            executorPayment = (1000000 * gasUsed * (100 + executorPaymentPercentage)) / 100;
        } else {
            // Optimism mainnet does not include `tx.gasprice` in the transaction, so we hardcode
            // its value here.
            executorPayment = (gasUsed * (100 + executorPaymentPercentage)) / 100;
        }

        // Add the executor's payment to the debt.
        debt += executorPayment;
    }

    /**
     * @notice **WARNING**: Cancellation is a potentially dangerous action and should not be
     *         executed unless in an emergency.
     *
     *         Cancels an active ChugSplash bundle. If an executor has not claimed the bundle,
     *         the owner is simply allowed to withdraw their bond via a subsequent call to
     *         `withdrawOwnerETH`. Otherwise, cancelling a bundle will cause the project owner to
     *         forfeit their bond to the executor, and will also allow the executor to refund their
     *         own bond.
     */
    function cancelActiveChugSplashBundle() public onlyOwner {
        require(activeBundleId != bytes32(0), "ChugSplashManager: no bundle is currently active");

        ChugSplashBundleState storage bundle = _bundles[activeBundleId];

        if (bundle.timeClaimed + executionLockTime >= block.timestamp) {
            // Give the owner's bond to the executor if the bundle is cancelled within the
            // `executionLockTime` window.
            debt += ownerBondAmount;
        }

        bytes32 cancelledBundleId = activeBundleId;
        activeBundleId = bytes32(0);
        bundle.status = ChugSplashBundleStatus.CANCELLED;

        emit ChugSplashBundleCancelled(cancelledBundleId, msg.sender, bundle.actionsExecuted);
        registry.announce("ChugSplashBundleCancelled");
    }

    /**
     * @notice Allows the executor to claim their ETH payments and bond. The executor may only
     *         withdraw ETH that is owed to it by this contract.
     */
    function claimExecutorPayment() external onlyExecutor {
        require(debt > 0, "ChugSplashManager: no debt to withdraw");

        uint256 amountToWithdraw = debt;
        debt = 0;

        (bool success, ) = payable(msg.sender).call{ value: amountToWithdraw }(new bytes(0));
        require(success, "ChugSplashManager: call to withdraw executor funds failed");

        emit ExecutorPaymentClaimed(msg.sender, amountToWithdraw);
        registry.announce("ExecutorPaymentClaimed");
    }

    /**
     * @notice Transfers ownership of a proxy from this contract to the project owner.
     *
     * @param _referenceName Reference name that corresponds to the proxy.
     * @param _newOwner      Address of the project owner that is receiving ownership of the proxy.
     */
    function transferProxyOwnership(
        string memory _referenceName,
        address _newOwner
    ) public onlyOwner {
        require(activeBundleId == bytes32(0), "ChugSplashManager: bundle is currently active");

        // Get the proxy type that corresponds to this reference name.
        bytes32 proxyType = proxyTypes[_referenceName];
        address payable proxy;
        if (proxyType == bytes32(0)) {
            // Use a default proxy if no proxy type has been set by the project owner.
            proxy = getDefaultProxyAddress(_referenceName);
        } else {
            proxy = proxies[_referenceName];

            // Set the `proxyTypes` and `proxies` mappings back to their default values.
            proxyTypes[_referenceName] = bytes32(0);
            proxies[_referenceName] = payable(address(0));
        }

        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(proxyType);

        // Delegatecall the adapter to change ownership of the proxy.
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.changeProxyAdmin, (proxy, _newOwner))
        );
        require(success, "ChugSplashManager: delegatecall to change proxy admin failed");

        emit ProxyOwnershipTransferred(_referenceName, proxy, proxyType, _newOwner, _referenceName);
        registry.announce("ProxyOwnershipTransferred");
    }

    /**
     * @notice Assigns a custom proxy to the specified reference name to replace the default proxy
     *         used by ChugSplash. This allows project owners to plug their existing proxies into
     *         ChugSplash in a fully opt-in manner. Only callable by this contract's owner.
     *
     * @param _referenceName String reference name.
     * @param _proxy         Address of the non-standard proxy.
     * @param _proxyType     The proxy's type.
     */
    function setProxyToReferenceName(
        string memory _referenceName,
        address payable _proxy,
        bytes32 _proxyType
    ) external onlyOwner {
        require(
            activeBundleId == bytes32(0),
            "ChugSplashManager: cannot change proxy while bundle is active"
        );
        require(_proxy != address(0), "ChugSplashManager: proxy cannot be address(0)");

        proxies[_referenceName] = _proxy;
        proxyTypes[_referenceName] = _proxyType;

        emit ProxySetToReferenceName(_referenceName, _proxy, _proxyType, _referenceName);
        registry.announceWithData("ProxySetToReferenceName", abi.encodePacked(_proxy));
    }

    /**
     * @notice Allows the project owner to withdraw all funds in this contract minus the debt
     *         owed to the executor. Cannot be called when there is an active bundle.
     */
    function withdrawOwnerETH() external onlyOwner {
        require(
            activeBundleId == bytes32(0),
            "ChugSplashManager: cannot withdraw funds while bundle is active"
        );

        uint256 amount = address(this).balance - debt;
        (bool success, ) = payable(msg.sender).call{ value: amount }(new bytes(0));
        require(success, "ChugSplashManager: call to withdraw owner funds failed");

        emit OwnerWithdrewETH(msg.sender, amount);
        registry.announce("OwnerWithdrewETH");
    }

    /**
     * @notice Allows the owner of this contract to add a proposer.
     *
     * @param _proposer Address of the proposer to add.
     */
    function addProposer(address _proposer) external onlyOwner {
        require(proposers[_proposer] == false, "ChugSplashManager: proposer was already added");

        proposers[_proposer] = true;

        emit ProposerAdded(_proposer, msg.sender);
        registry.announce("ProposerAdded");
    }

    /**
     * @notice Allows the owner of this contract to remove a proposer.
     *
     * @param _proposer Address of the proposer to remove.
     */
    function removeProposer(address _proposer) external onlyOwner {
        require(proposers[_proposer] == true, "ChugSplashManager: proposer was already removed");

        proposers[_proposer] = false;

        emit ProposerRemoved(_proposer, msg.sender);
        registry.announce("ProposerRemoved");
    }

    /**
     * @notice Allows anyone to send ETH to this contract.
     */
    receive() external payable {
        emit ETHDeposited(msg.sender, msg.value);
        registry.announce("ETHDeposited");
    }

    /**
     * @notice Deploys an implementation contract, which will later be set as the proxy's
     *         implementation address. Note that we wait to set the proxy's implementation address
     *         until the very last call of the bundle to avoid a situation where end-users are
     *         interacting with a proxy whose storage has not fully been initialized.
     *
     * @param _referenceName Reference name that corresponds to the implementation.
     * @param _code          Creation bytecode of the implementation contract.
     */
    function _deployImplementation(string memory _referenceName, bytes memory _code) internal {
        // Calculate the salt for the Create2 call. This salt ensures that there are no address
        // collisions since each bundle ID can only be executed once, and each reference name is
        // unique within that bundle.
        bytes32 salt = keccak256(abi.encode(activeBundleId, bytes(_referenceName)));

        // Get the expected address of the implementation contract.
        address expectedImplementation = Create2.compute(address(this), salt, _code);

        address implementation;
        assembly {
            implementation := create2(0x0, add(_code, 0x20), mload(_code), salt)
        }

        // Could happen if insufficient gas is supplied to this transaction, should not happen
        // otherwise. If there's a situation in which this could happen other than a standard OOG,
        // then this would halt the entire contract. TODO: Make sure this cannot happen in any case
        // other than OOG.
        require(
            expectedImplementation == implementation,
            "ChugSplashManager: implementation was not deployed correctly"
        );

        // Map the implementation's salt to its newly deployed address.
        implementations[salt] = implementation;

        emit ImplementationDeployed(_referenceName, implementation, activeBundleId, _referenceName);
        registry.announce("ImplementationDeployed");
    }

    /**
     * @notice Modifies a storage slot within the proxy contract.
     *
     * @param _proxy   Address of the proxy.
     * @param _adapter Address of the adapter for this proxy.
     * @param _key     Storage key to modify.
     * @param _value   New value for the storage key.
     */
    function _setProxyStorage(
        address payable _proxy,
        address _adapter,
        bytes32 _key,
        bytes32 _value
    ) internal {
        // Delegatecall the adapter to upgrade the proxy's implementation to be the ProxyUpdater,
        // and call `setStorage` on the proxy.
        console.log('g');
        _upgradeProxyToAndCall(
            _proxy,
            _adapter,
            proxyUpdater,
            abi.encodeCall(ProxyUpdater.setStorage, (_key, _value))
        );

        console.log(registry.reverter());
        console.log('h');
        // Delegatecall the adapter to set the proxy's implementation back to the Reverter.
        _upgradeProxyTo(_proxy, _adapter, registry.reverter());
    }

    /**
     * @notice Delegatecalls an adapter to get the address of the proxy's implementation contract.
     *
     * @param _proxy   Address of the proxy.
     * @param _adapter Address of the adapter to use for the proxy.
     */
    function _getProxyImplementation(
        address payable _proxy,
        address _adapter
    ) internal returns (address) {
        (bool success, bytes memory implementationBytes) = _adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.getProxyImplementation, (_proxy))
        );
        require(success, "ChugSplashManager: delegatecall to get proxy implementation failed");

        // Convert the implementation's type from bytes to address.
        address implementation;
        assembly {
            implementation := mload(add(implementationBytes, 32))
        }
        return implementation;
    }

    /**
     * @notice Delegatecalls an adapter to upgrade a proxy's implementation contract.
     *
     * @param _proxy          Address of the proxy to upgrade.
     * @param _adapter        Address of the adapter to use for the proxy.
     * @param _implementation Address to set as the proxy's new implementation contract.
     */
    function _upgradeProxyTo(
        address payable _proxy,
        address _adapter,
        address _implementation
    ) internal {
        (bool success, ) = _adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.upgradeProxyTo, (_proxy, _implementation))
        );
        require(success, "ChugSplashManager: delegatecall to upgrade proxy failed");
    }

    /**
     * @notice Upgrade a proxy's implementation contract and delegatecall the proxy with encoded
     *         function data via an adapter.
     *
     * @param _proxy          Address of the proxy to upgrade.
     * @param _adapter        Address of the adapter to use for the proxy.
     * @param _implementation Address to set as the proxy's new implementation contract.
     * @param _data           Calldata to delegatecall the new implementation with.
     */
    function _upgradeProxyToAndCall(
        address payable _proxy,
        address _adapter,
        address _implementation,
        bytes memory _data
    ) internal {
        (bool success, ) = _adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.upgradeProxyToAndCall, (_proxy, _implementation, _data))
        );
        require(success, "ChugSplashManager: delegatecall to upgrade proxy with data failed");
    }

    /**
     * @notice Gets the code hash for a given account.
     *
     * @param _account Address of the account to get a code hash for.
     *
     * @return Code hash for the account.
     */
    function _getAccountCodeHash(address _account) internal view returns (bytes32) {
        bytes32 codeHash;
        assembly {
            codeHash := extcodehash(_account)
        }
        return codeHash;
    }
}
