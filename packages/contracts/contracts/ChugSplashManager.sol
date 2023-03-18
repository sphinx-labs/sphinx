// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {
    ChugSplashBundleState,
    ChugSplashAction,
    ChugSplashTarget,
    ChugSplashActionType,
    ChugSplashBundleStatus
} from "./ChugSplashDataTypes.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Proxy } from "./libraries/Proxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { ChugSplashRecorder } from "./ChugSplashRecorder.sol";
import { IProxyAdapter } from "./interfaces/IProxyAdapter.sol";
import { IProxyUpdater } from "./interfaces/IProxyUpdater.sol";
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
     * @param actionRoot Root of the proposed bundle's merkle tree.
     * @param numActions Number of steps in the proposed bundle.
     * @param configUri  URI of the config file that can be used to re-generate the bundle.
     */
    event ChugSplashBundleProposed(
        bytes32 indexed bundleId,
        bytes32 actionRoot,
        bytes32 targetRoot,
        uint256 numActions,
        uint256 numTargets,
        string configUri,
        address proposer
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
     * @param executor    Address of the executor that executed the action.
     * @param actionIndex Index within the bundle hash of the action that was executed.
     */
    event ChugSplashActionExecuted(
        bytes32 indexed bundleId,
        address indexed proxy,
        address indexed executor,
        uint256 actionIndex
    );

    /**
     * @notice Emitted when a ChugSplash bundle is initiated.
     *
     * @param bundleId        Unique ID for the bundle.
     * @param executor        Address of the executor that initiated the bundle.
     */
    event ChugSplashBundleInitiated(bytes32 indexed bundleId, address indexed executor);

    /**
     * @notice Emitted when a ChugSplash bundle is completed.
     *
     * @param bundleId        Unique ID for the bundle.
     * @param executor        Address of the executor that completed the bundle.
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
     * @param proxy     Address of the proxy that is the subject of the ownership transfer.
     * @param proxyTypeHash The proxy type.
     * @param newOwner  Address of the project owner that is receiving ownership of the
     *                  proxy.
     */
    event ProxyOwnershipTransferred(
        address indexed proxy,
        bytes32 indexed proxyTypeHash,
        address newOwner
    );

    /**
     * @notice Emitted when a bundle is claimed by an executor.
     *
     * @param bundleId ID of the bundle that was claimed.
     * @param executor Address of the executor that claimed the bundle ID for the project.
     */
    event ChugSplashBundleClaimed(bytes32 indexed bundleId, address indexed executor);

    /**
     * @notice Emitted when a custom proxy is assigned to a reference name.
     *
     * @param referenceNameHash Hash of the reference name.
     * @param proxy             Address of the proxy.
     * @param proxyTypeHash         The proxy type.
     * @param referenceName     String reference name.
     */
    event ProxySetToReferenceName(
        string indexed referenceNameHash,
        address indexed proxy,
        bytes32 indexed proxyTypeHash,
        string referenceName
    );

    /**
     * @notice Emitted when an executor claims a payment.
     *
     * @param executor The executor being paid.
     * @param amount   The ETH amount sent to the executor.
     */
    event ExecutorPaymentClaimed(address indexed executor, uint256 amount);

    event ProtocolPaymentClaimed(address indexed recipient, uint256 amount);

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

    event ToggledManagedProposals(bool isManaged, address indexed owner);

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
     * @notice Address of the ChugSplashRecorder.
     */
    ChugSplashRecorder public immutable recorder;

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
     *         it. If the owner cancels an active bundle within this time period, their bond is
     *         forfeited to the executor. This prevents users from trolling executors by immediately
     *         cancelling active bundles.
     */
    uint256 public immutable executionLockTime;

    /**
     * @notice Amount that the executor is paid, denominated as a percentage of the cost of
     *         execution. For example: if a bundle costs 1 gwei to execute and the
     *         executorPaymentPercentage is 10, then the executor will profit 0.1 gwei.
     */
    uint256 public immutable executorPaymentPercentage;

    uint256 public immutable protocolPaymentPercentage;

    /**
     * @notice Mapping of executor addresses to the ETH amount stored in this contract that is
     *         owed to them.
     */
    mapping(address => uint256) public executorDebt;

    /**
     * @notice Maps an address to a boolean indicating if the address is allowed to propose bundles.
     */
    mapping(address => bool) public proposers;

    /**
     * @notice Mapping of bundle IDs to bundle state.
     */
    mapping(bytes32 => ChugSplashBundleState) internal _bundles;

    /**
     * @notice ID of the project this contract is managing.
     */
    bytes32 public projectID;

    /**
     * @notice ID of the currently active bundle.
     */
    bytes32 public activeBundleId;

    /**
     * @notice ETH amount that is owed to the executor.
     */
    uint256 public totalExecutorDebt;

    uint256 public totalProtocolDebt;

    bool public allowManagedProposals;

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
     * @param _recorder                  Address of the ChugSplashRecorder.
     * @param _executionLockTime         Amount of time for an executor to completely execute a
     *                                   bundle after claiming it.
     * @param _ownerBondAmount           Amount that must be deposited in this contract in order to
     *                                   execute a bundle.
     * @param _executorPaymentPercentage Amount that an executor will earn from completing a bundle,
     *                                   denominated as a percentage.
     */
    constructor(
        ChugSplashRegistry _registry,
        ChugSplashRecorder _recorder,
        uint256 _executionLockTime,
        uint256 _ownerBondAmount,
        uint256 _executorPaymentPercentage,
        uint256 _protocolPaymentPercentage
    ) {
        registry = _registry;
        recorder = _recorder;
        executionLockTime = _executionLockTime;
        ownerBondAmount = _ownerBondAmount;
        executorPaymentPercentage = _executorPaymentPercentage;
        protocolPaymentPercentage = _protocolPaymentPercentage;
    }

    /**
     * @param _projectID ID of the project this contract is managing.
     * @param _owner     Initial owner of this contract.
     */
    function initialize(
        bytes32 _projectID,
        address _owner,
        bool _allowManagedProposals
    ) public initializer {
        allowManagedProposals = _allowManagedProposals;
        projectID = _projectID;

        __Ownable_init();
        _transferOwnership(_owner);
    }

    /**
     * @notice Computes the bundle ID from the bundle parameters.
     *
     * @param _actionRoot Root of the bundle's merkle tree.
     * @param _numActions Number of elements in the bundle's tree.
     * @param _configUri  URI pointing to the config file for the bundle.
     *
     * @return Unique ID for the bundle.
     */
    function computeBundleId(
        bytes32 _actionRoot,
        bytes32 _targetRoot,
        uint256 _numActions,
        uint256 _numTargets,
        string memory _configUri
    ) public pure returns (bytes32) {
        return
            keccak256(abi.encode(_actionRoot, _targetRoot, _numActions, _numTargets, _configUri));
    }

    function totalDebt() public view returns (uint256) {
        return totalExecutorDebt + totalProtocolDebt;
    }

    /**
     * @notice Queries the selected executor for a given project/bundle.
     *
     * @param _bundleId ID of the bundle currently being executed.
     *
     * @return Address of the selected executor.
     */
    function getSelectedExecutor(bytes32 _bundleId) public view returns (address) {
        ChugSplashBundleState storage bundle = _bundles[_bundleId];
        return bundle.selectedExecutor;
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
     * @param _actionRoot Root of the bundle's merkle tree.
     * @param _numActions Number of elements in the bundle's tree.
     * @param _configUri  URI pointing to the config file for the bundle.
     */
    function proposeChugSplashBundle(
        bytes32 _actionRoot,
        bytes32 _targetRoot,
        uint256 _numActions,
        uint256 _numTargets,
        string memory _configUri
    ) public {
        require(isProposer(msg.sender), "ChugSplashManager: caller must be proposer");

        bytes32 bundleId = computeBundleId(
            _actionRoot,
            _targetRoot,
            _numActions,
            _numTargets,
            _configUri
        );
        ChugSplashBundleState storage bundle = _bundles[bundleId];

        require(
            bundle.status == ChugSplashBundleStatus.EMPTY,
            "ChugSplashManager: bundle already exists"
        );

        bundle.status = ChugSplashBundleStatus.PROPOSED;
        bundle.actionRoot = _actionRoot;
        bundle.targetRoot = _targetRoot;
        bundle.actions = new bool[](_numActions);
        bundle.targets = _numTargets;

        emit ChugSplashBundleProposed(
            bundleId,
            _actionRoot,
            _targetRoot,
            _numActions,
            _numTargets,
            _configUri,
            msg.sender
        );
        recorder.announceWithData("ChugSplashBundleProposed", abi.encodePacked(msg.sender));
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
            address(this).balance - totalDebt() >= ownerBondAmount,
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
        recorder.announce("ChugSplashBundleApproved");
    }

    /**
     * @notice Initiate the execution of a bundle.
     *
     * @param _targets Array of ChugSplashTarget objects.
     * @param _proofs  Array of Merkle proofs.
     */
    function initiateBundleExecution(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) public {
        uint256 initialGasLeft = gasleft();

        require(
            getSelectedExecutor(activeBundleId) == msg.sender,
            "ChugSplashManager: caller is not approved executor for active bundle ID"
        );

        ChugSplashBundleState storage bundle = _bundles[activeBundleId];

        require(
            bundle.status == ChugSplashBundleStatus.APPROVED,
            "ChugSplashManager: execution has already been initiated"
        );

        uint256 numTargets = _targets.length;
        require(numTargets == bundle.targets, "ChugSplashManager: incorrect number of targets");

        ChugSplashTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            require(
                MerkleTree.verify(
                    bundle.targetRoot,
                    keccak256(
                        abi.encode(
                            target.referenceName,
                            target.proxy,
                            target.implementation,
                            target.proxyTypeHash
                        )
                    ),
                    i,
                    proof,
                    bundle.targets
                ),
                "ChugSplashManager: invalid bundle target proof"
            );

            // Get the proxy type and adapter for this reference name.
            address adapter = recorder.adapters(target.proxyTypeHash);

            if (target.proxyTypeHash == bytes32(0)) {
                // Make sure the proxy has code in it and deploy the proxy if it doesn't. Since
                // we're deploying via CREATE2, we can always correctly predict what the proxy
                // address *should* be and can therefore easily check if it's already populated.
                address proxy = getDefaultProxyAddress(target.referenceName);
                if (proxy.code.length == 0) {
                    bytes32 salt = keccak256(bytes(target.referenceName));
                    Proxy created = new Proxy{ salt: salt }(address(this));

                    // Could happen if insufficient gas is supplied to this transaction, should not
                    // happen otherwise. If there's a situation in which this could happen other
                    // than a standard OOG, then this would halt the entire contract.
                    require(
                        address(created) == proxy,
                        "ChugSplashManager: Proxy was not created correctly"
                    );

                    emit DefaultProxyDeployed(
                        target.referenceName,
                        proxy,
                        activeBundleId,
                        target.referenceName
                    );
                    recorder.announceWithData("DefaultProxyDeployed", abi.encodePacked(proxy));
                }
            }

            // Upgrade the proxy's implementation contract to the adapter.
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(IProxyAdapter.initiateExecution, (target.proxy))
            );
            require(success, "ChugSplashManger: failed to initiate execution");
        }

        // Mark the bundle as initiated.
        bundle.status = ChugSplashBundleStatus.INITIATED;

        emit ChugSplashBundleInitiated(activeBundleId, msg.sender);
        recorder.announce("ChugSplashBundleInitiated");

        _payExecutorAndProtocol(initialGasLeft);
    }

    /**
     * @notice Executes multiple ChugSplash actions within the current active bundle for a project.
     *         Actions can only be executed once. A re-entrancy guard is added to prevent an
     *         implementation contract's constructor from calling another contract which in turn
     *         calls back into this function. Only callable by the executor.
     *
     * @param _actions       Array of SetStorage/DeployImplementation actions to execute.
     * @param _actionIndexes Array of action indexes.
     * @param _proofs        Array of Merkle proofs for each action.
     */
    function executeActions(
        ChugSplashAction[] memory _actions,
        uint256[] memory _actionIndexes,
        bytes32[][] memory _proofs
    ) public nonReentrant {
        uint256 initialGasLeft = gasleft();

        require(
            getSelectedExecutor(activeBundleId) == msg.sender,
            "ChugSplashManager: caller is not approved executor for active bundle ID"
        );

        ChugSplashBundleState storage bundle = _bundles[activeBundleId];

        uint256 numActions = _actions.length;
        ChugSplashAction memory action;
        uint256 actionIndex;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numActions; i++) {
            action = _actions[i];
            actionIndex = _actionIndexes[i];
            proof = _proofs[i];

            require(
                bundle.actions[actionIndex] == false,
                "ChugSplashManager: action has already been executed"
            );

            require(
                MerkleTree.verify(
                    bundle.actionRoot,
                    keccak256(
                        abi.encode(
                            action.referenceName,
                            action.proxy,
                            action.actionType,
                            action.proxyTypeHash,
                            action.data
                        )
                    ),
                    actionIndex,
                    proof,
                    bundle.actions.length
                ),
                "ChugSplashManager: invalid bundle action proof"
            );

            // Get the adapter for this reference name.
            address adapter = recorder.adapters(action.proxyTypeHash);

            require(adapter != address(0), "ChugSplashManager: proxy type has no adapter");

            // Set the proxy's implementation to be a ProxyUpdater. Updaters ensure that only the
            // ChugSplashManager can interact with a proxy that is in the process of being updated.
            // Note that we use the Updater contract to provide a generic interface for updating a
            // variety of proxy types.
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(IProxyAdapter.initiateExecution, (action.proxy))
            );
            require(success, "ChugSplashManager: failed to set implementation to an updater");

            // Mark the action as executed and update the total number of executed actions.
            bundle.actionsExecuted++;
            bundle.actions[actionIndex] = true;

            // Next, we execute the ChugSplash action by calling deployImplementation/setStorage.
            if (action.actionType == ChugSplashActionType.DEPLOY_IMPLEMENTATION) {
                _deployImplementation(action.referenceName, action.data);
            } else if (action.actionType == ChugSplashActionType.SET_STORAGE) {
                (bytes32 key, uint8 offset, bytes memory val) = abi.decode(
                    action.data,
                    (bytes32, uint8, bytes)
                );
                _setProxyStorage(action.proxy, adapter, key, offset, val);
            } else {
                revert("ChugSplashManager: unknown action type");
            }

            emit ChugSplashActionExecuted(activeBundleId, action.proxy, msg.sender, actionIndex);
            recorder.announceWithData("ChugSplashActionExecuted", abi.encodePacked(action.proxy));
        }

        _payExecutorAndProtocol(initialGasLeft);
    }

    /**
     * @notice Completes the bundle by upgrading all proxies to their new implementations. This
     *         occurs in a single transaction to ensure that all proxies are initialized at the same
     *         time. Note that this function will revert if it is called before all of the SetCode
     *         and DeployImplementation actions have been executed in `executeChugSplashAction`.
     *         Only callable by the executor.
     *
     * @param _targets Array of ChugSplashTarget objects.
     * @param _proofs  Array of Merkle proofs.
     */
    function completeBundleExecution(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) public {
        uint256 initialGasLeft = gasleft();

        require(
            getSelectedExecutor(activeBundleId) == msg.sender,
            "ChugSplashManager: caller is not approved executor for active bundle ID"
        );

        require(
            activeBundleId != bytes32(0),
            "ChugSplashManager: no bundle has been approved for execution"
        );

        ChugSplashBundleState storage bundle = _bundles[activeBundleId];

        require(
            bundle.actionsExecuted == bundle.actions.length,
            "ChugSplashManager: bundle was not executed completely"
        );

        uint256 numTargets = _targets.length;
        require(numTargets == bundle.targets, "ChugSplashManager: incorrect number of targets");

        ChugSplashTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            require(
                MerkleTree.verify(
                    bundle.targetRoot,
                    keccak256(
                        abi.encode(
                            target.referenceName,
                            target.proxy,
                            target.implementation,
                            target.proxyTypeHash
                        )
                    ),
                    i,
                    proof,
                    bundle.targets
                ),
                "ChugSplashManager: invalid bundle target proof"
            );

            // Get the proxy type and adapter for this reference name.
            address adapter = recorder.adapters(target.proxyTypeHash);

            // Upgrade the proxy's implementation contract.
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(
                    IProxyAdapter.completeExecution,
                    (target.proxy, target.implementation)
                )
            );
            require(success, "ChugSplashManger: failed to complete execution");
        }

        // Mark the bundle as completed and reset the active bundle hash so that a new bundle can be
        // executed.
        bundle.status = ChugSplashBundleStatus.COMPLETED;
        bytes32 completedBundleId = activeBundleId;
        activeBundleId = bytes32(0);

        emit ChugSplashBundleCompleted(completedBundleId, msg.sender, bundle.actionsExecuted);
        recorder.announce("ChugSplashBundleCompleted");

        _payExecutorAndProtocol(initialGasLeft);
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
            totalExecutorDebt += ownerBondAmount;
        }

        bytes32 cancelledBundleId = activeBundleId;
        activeBundleId = bytes32(0);
        bundle.status = ChugSplashBundleStatus.CANCELLED;

        emit ChugSplashBundleCancelled(cancelledBundleId, msg.sender, bundle.actionsExecuted);
        recorder.announce("ChugSplashBundleCancelled");
    }

    /**
     * @notice Allows an executor to post a bond of `executorBondAmount` to claim the sole right to
     *         execute actions for a bundle over a period of `executionLockTime`. Only the first
     *         executor to post a bond gains this right. Executors must finish executing the bundle
     *         within `executionLockTime` or else another executor may claim the bundle. Note that
     *         this strategy creates a PGA for the transaction to claim the bundle but removes PGAs
     *         during the execution process.
     */
    function claimBundle() external onlyExecutor {
        require(activeBundleId != bytes32(0), "ChugSplashManager: no bundle is currently active");

        ChugSplashBundleState storage bundle = _bundles[activeBundleId];

        require(
            block.timestamp > bundle.timeClaimed + executionLockTime,
            "ChugSplashManager: bundle is currently claimed by an executor"
        );

        bundle.timeClaimed = block.timestamp;
        bundle.selectedExecutor = msg.sender;

        emit ChugSplashBundleClaimed(activeBundleId, msg.sender);
        recorder.announce("ChugSplashBundleClaimed");
    }

    /**
     * @notice Allows executors to claim their ETH payments and bond. Executors may only withdraw
     *         ETH that is owed to them by this contract.
     */
    function claimExecutorPayment() external onlyExecutor {
        uint256 amount = executorDebt[msg.sender];

        executorDebt[msg.sender] -= amount;
        totalExecutorDebt -= amount;

        (bool success, ) = payable(msg.sender).call{ value: amount }(new bytes(0));
        require(success, "ChugSplashManager: call to withdraw executor funds failed");

        emit ExecutorPaymentClaimed(msg.sender, amount);
        recorder.announce("ExecutorPaymentClaimed");
    }

    function claimProtocolPayment() external {
        require(
            registry.protocolPaymentRecipients(msg.sender) == true,
            "ChugSplashManager: caller is not a protocol payment recipient"
        );

        uint256 amount = totalProtocolDebt;
        totalProtocolDebt = 0;

        (bool success, ) = payable(msg.sender).call{ value: amount }(new bytes(0));
        require(success, "ChugSplashManager: call to withdraw protocol funds failed");

        emit ProtocolPaymentClaimed(msg.sender, amount);
        recorder.announce("ProtocolPaymentClaimed");
    }

    /**
     * @notice Transfers ownership of a proxy from this contract to the project owner.
     *
     * @param _newOwner  Address of the project owner that is receiving ownership of the proxy.
     */
    function claimProxyOwnership(
        address payable _proxy,
        bytes32 _proxyTypeHash,
        address _newOwner
    ) public onlyOwner {
        require(activeBundleId == bytes32(0), "ChugSplashManager: bundle is currently active");

        // Get the adapter that corresponds to this proxy type.
        address adapter = recorder.adapters(_proxyTypeHash);

        // Delegatecall the adapter to change ownership of the proxy.
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.changeProxyAdmin, (_proxy, _newOwner))
        );
        require(success, "ChugSplashManager: delegatecall to change proxy admin failed");

        emit ProxyOwnershipTransferred(_proxy, _proxyTypeHash, _newOwner);
        recorder.announce("ProxyOwnershipTransferred");
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

        uint256 amount = address(this).balance - totalDebt();
        (bool success, ) = payable(msg.sender).call{ value: amount }(new bytes(0));
        require(success, "ChugSplashManager: call to withdraw owner funds failed");

        emit OwnerWithdrewETH(msg.sender, amount);
        recorder.announce("OwnerWithdrewETH");
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
        recorder.announce("ProposerAdded");
    }

    function isProposer(address _addr) public view returns (bool) {
        return
            (allowManagedProposals && registry.managedProposers(_addr) == true) ||
            proposers[_addr] == true ||
            _addr == owner();
    }

    function toggleAllowManagedProposals() external onlyOwner {
        allowManagedProposals = !allowManagedProposals;

        emit ToggledManagedProposals(allowManagedProposals, msg.sender);
        recorder.announceWithData(
            "ToggledManagedProposals",
            abi.encodePacked(allowManagedProposals)
        );
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
        recorder.announce("ProposerRemoved");
    }

    /**
     * @notice Allows anyone to send ETH to this contract.
     */
    receive() external payable {
        emit ETHDeposited(msg.sender, msg.value);
        recorder.announce("ETHDeposited");
    }

    function _payExecutorAndProtocol(uint256 _initialGasLeft) internal {
        uint256 gasPrice;
        if (block.chainid != 10 && block.chainid != 420) {
            // Use the gas price for any network that isn't Optimism.
            gasPrice = tx.gasprice;
        } else if (block.chainid == 10) {
            // Optimism mainnet does not include `tx.gasprice` in the transaction, so we hardcode
            // its value here.
            gasPrice = 1000000;
        } else {
            // Optimism Goerli does not include `tx.gasprice` in the transaction, so we hardcode
            // its value here.
            gasPrice = 1;
        }

        // Estimate the amount of gas used in this call by subtracting the current gas left from the
        // initial gas left. We add 152778 to this amount to account for the intrinsic gas cost
        // (21k), the calldata usage, and the subsequent opcodes that occur when we add the
        // executorPayment to the debt and total debt. Unfortunately, there is a wide variance in
        // the gas costs of these last opcodes due to the variable cost of SSTORE. Also, gas refunds
        // might be contributing to the difficulty of getting a good estimate. For now, we err on
        // the side of safety by adding a larger value.
        uint256 gasUsed = 152778 + _initialGasLeft - gasleft();

        uint256 executorPayment = (gasPrice * gasUsed * (100 + executorPaymentPercentage)) / 100;
        uint256 protocolPayment = gasPrice * gasUsed * protocolPaymentPercentage;

        // Add the executor's payment to the executor debt.
        totalExecutorDebt += executorPayment;
        executorDebt[msg.sender] += executorPayment;

        // Add the protocol's payment to the protocol debt.
        totalProtocolDebt += protocolPayment;
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
        // Calculate the salt for the Create2 call. Note that there can be address collisions
        // between implementations if their reference names are the same, but this is avoided with
        // off-chain tooling by skipping implementations that have the same reference name and
        // creation bytecode.
        bytes32 salt = keccak256(bytes(_referenceName));

        // Get the expected address of the implementation contract.
        address expectedImplementation = Create2.compute(address(this), salt, _code);

        address implementation;
        assembly {
            implementation := create2(0x0, add(_code, 0x20), mload(_code), salt)
        }

        // Could happen if insufficient gas is supplied to this transaction, should not happen
        // otherwise. If there's a situation in which this could happen other than a standard OOG,
        // then this would halt the entire contract.
        require(
            expectedImplementation == implementation,
            "ChugSplashManager: implementation was not deployed correctly"
        );

        emit ImplementationDeployed(_referenceName, implementation, activeBundleId, _referenceName);
        recorder.announce("ImplementationDeployed");
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
        uint8 _offset,
        bytes memory _value
    ) internal {
        // Delegatecall the adapter to call `setStorage` on the proxy.
        (bool success, ) = _adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.setStorage, (_proxy, _key, _offset, _value))
        );
        require(success, "ChugSplashManager: delegatecall to set storage failed");
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
