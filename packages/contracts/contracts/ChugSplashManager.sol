// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { IProxyAdapter } from "./IProxyAdapter.sol";
import { ProxyUpdater } from "./ProxyUpdater.sol";
import { Create2 } from "./libraries/Create2.sol";
import { MerkleTree } from "./libraries/MerkleTree.sol";

/**
 * @title ChugSplashManager
 */
contract ChugSplashManager is OwnableUpgradeable {
    /**
     * @notice Enum representing possible ChugSplash action types.
     */
    enum ChugSplashActionType {
        SET_CODE,
        SET_STORAGE
    }

    /**
     * @notice Enum representing the status of a given ChugSplash action.
     */
    enum ChugSplashBundleStatus {
        EMPTY,
        PROPOSED,
        APPROVED,
        COMPLETED,
        CANCELLED
    }

    /**
     * @notice Struct representing a ChugSplash action.
     */
    struct ChugSplashAction {
        string target;
        ChugSplashActionType actionType;
        bytes data;
    }

    /**
     * @notice Struct representing the state of a ChugSplash bundle.
     */
    struct ChugSplashBundleState {
        ChugSplashBundleStatus status;
        bool[] executions;
        uint256 total;
        uint256 timeClaimed;
        address selectedExecutor;
        bool executorBondReturned;
    }

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
     * @param executor    Address of the executor.
     * @param actionIndex Index within the bundle hash of the action that was executed.
     */
    event ChugSplashActionExecuted(
        bytes32 indexed bundleId,
        address indexed executor,
        uint256 actionIndex
    );

    /**
     * @notice Emitted when a ChugSplash bundle is completed.
     *
     * @param bundleId Unique ID for the bundle.
     * @param executor Address of the executor.
     * @param total    Total number of completed actions.
     */
    event ChugSplashBundleCompleted(
        bytes32 indexed bundleId,
        address indexed executor,
        uint256 total
    );

    /**
     * @notice Emitted when an active ChugSplash bundle is cancelled.
     *
     * @param bundleId Bundle ID that was cancelled.
     * @param owner    Owner of the ChugSplashManager.
     * @param total    Total number of completed actions.
     */
    event ChugSplashBundleCancelled(bytes32 indexed bundleId, address indexed owner, uint256 total);

    /**
     * @notice Emitted when a non-standard proxy is assigned to a target.
     *
     * @param targetNameHash Hash of the target's string name.
     * @param proxy          Address of the proxy.
     * @param proxyType      The proxy type.
     * @param targetName     String name of the target.
     */
    event ProxySetToTarget(
        string indexed targetNameHash,
        address indexed proxy,
        bytes32 indexed proxyType,
        string targetName
    );

    /**
     * @notice Emitted when the project owner transfers ownership of a proxy away from the
     *         ChugSplashManager.
     *
     * @param targetNameHash Hash of the target's string name.
     * @param proxy          Address of the proxy that is the subject of the ownership transfer.
     * @param proxyType      The proxy type.
     * @param newOwner       Address of the project owner that is receiving ownership of the proxy.
     * @param targetName     String name of the target.
     */
    event ProxyOwnershipTransferred(
        string indexed targetNameHash,
        address indexed proxy,
        bytes32 indexed proxyType,
        address newOwner,
        string targetName
    );

    /**
     * @notice Emitted when a bundle is claimed by an executor.
     *
     * @param bundleId ID of the bundle that was claimed.
     * @param executor Address of the executor that claimed the bundle ID for the project.
     */
    event ChugSplashBundleClaimed(bytes32 indexed bundleId, address indexed executor);

    /**
     * @notice Emitted when an executor is refunded the bond that they originally posted to claim a
     *         bundle.
     *
     * @param bundleId ID of the bundle that was claimed.
     * @param executor Address of the executor that posted the bond.
     */
    event ExecutorBondReturned(bytes32 indexed bundleId, address indexed executor);

    /**
     * @notice Emitted when a new executor bond amount is set.
     *
     * @param executorBondAmount New executor bond amount.
     */
    event ExecutorBondAmountSet(uint256 executorBondAmount);

    /**
     * @notice Emitted when ETH is withdrawn from this contract.
     *
     * @param from   Address that initiated the withdrawal.
     * @param to     Address that received the ETH.
     * @param amount ETH amount withdrawn.
     */
    event ETHWithdrawn(address indexed from, address indexed to, uint256 amount);

    /**
     * @notice Emitted when ETH is deposited in this contract
     */
    event ETHDeposited(address indexed from, uint256 indexed amount);

    /**
     * @notice "Magic" prefix. When prepended to some arbitrary bytecode and used to create a
     *         contract, the appended bytecode will be deployed as given.
     */
    bytes13 internal constant DEPLOY_CODE_PREFIX = 0x600D380380600D6000396000f3;

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
     *         necessary to prevent owners from trolling executors by immediately cancelling and
     *         withdrawing funds.
     */
    uint256 public immutable ownerBondAmount;

    /**
     * @notice Name of the project this contract is managing.
     */
    string public name;

    /**
     * @notice ID of the currently active bundle.
     */
    bytes32 public activeBundleId;

    /**
     * @notice Amount in ETH that the executor must send to this contract to claim a bundle for
     *         `executionLockTime`.
     */
    uint256 public executorBondAmount;

    /**
     * @notice Amount of time for an executor to finish executing a bundle once they have claimed
     *         it. If the executor fails to completely execute the bundle in this amount of time,
     *         their bond is forfeited to the ChugSplashManager.
     */
    uint256 public immutable executionLockTime;

    /**
     * @notice Mapping of bundle IDs to bundle state.
     */
    mapping(bytes32 => ChugSplashBundleState) public bundles;

    /**
     * @notice Mapping of target names to proxy addresses. If a target is using the default
     *         proxy, then its value in this mapping is the zero-address.
     */
    mapping(string => address payable) public proxies;

    /**
     * @notice Mapping of target names to proxy types. If a target is using the default proxy,
     *         then its value in this mapping is bytes32(0).
     */
    mapping(string => bytes32) proxyTypes;

    /**
     * @param _registry           Address of the ChugSplashRegistry.
     * @param _name               Name of the project this contract is managing.
     * @param _owner              Initial owner of this contract.
     * @param _proxyUpdater       Address of the ProxyUpdater.
     * @param _executorBondAmount Executor bond amount in ETH.
     * @param _executionLockTime  Amount of time for an executor to completely execute a bundle
     *                            after claiming it.
     * @param _ownerBondAmount    Amount that must be deposited in this contract in order to execute
     *                            a bundle.
     */
    constructor(
        ChugSplashRegistry _registry,
        string memory _name,
        address _owner,
        address _proxyUpdater,
        uint256 _executorBondAmount,
        uint256 _executionLockTime,
        uint256 _ownerBondAmount
    ) {
        registry = _registry;
        proxyUpdater = _proxyUpdater;
        executionLockTime = _executionLockTime;
        ownerBondAmount = _ownerBondAmount;

        initialize(_name, _owner, _executorBondAmount);
    }

    /**
     * @param _name               Name of the project this contract is managing.
     * @param _owner              Initial owner of this contract.
     * @param _executorBondAmount Executor bond amount in ETH.
     */
    function initialize(
        string memory _name,
        address _owner,
        uint256 _executorBondAmount
    ) public initializer {
        name = _name;
        executorBondAmount = _executorBondAmount;

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
     * @notice Allows the owner to propose a new ChugSplash bundle to be executed.
     *
     * @param _bundleRoot Root of the bundle's merkle tree.
     * @param _bundleSize Number of elements in the bundle's tree.
     * @param _configUri  URI pointing to the config file for the bundle.
     */
    function proposeChugSplashBundle(
        bytes32 _bundleRoot,
        uint256 _bundleSize,
        string memory _configUri
    ) public onlyOwner {
        bytes32 bundleId = computeBundleId(_bundleRoot, _bundleSize, _configUri);
        ChugSplashBundleState storage bundle = bundles[bundleId];

        require(
            bundle.status == ChugSplashBundleStatus.EMPTY,
            "ChugSplashManager: bundle already exists"
        );

        bundle.status = ChugSplashBundleStatus.PROPOSED;
        bundle.executions = new bool[](_bundleSize);

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
            address(this).balance >= ownerBondAmount,
            "ChugSplashManager: insufficient balance in manager"
        );

        ChugSplashBundleState storage bundle = bundles[_bundleId];

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
     * @notice Executes a specific action within the current active bundle for a project. Actions
     *         can only be executed once. If executing this action would complete the bundle, will
     *         mark the bundle as completed and make it possible for a new bundle to be approved.
     *
     * @param _action      Action to execute.
     * @param _actionIndex Index of the action in the bundle.
     * @param _proof       Merkle proof of the action within the bundle.
     */
    function executeChugSplashBundleAction(
        ChugSplashAction memory _action,
        uint256 _actionIndex,
        bytes32[] memory _proof
    ) public {
        require(
            activeBundleId != bytes32(0),
            "ChugSplashManager: no bundle has been approved for execution"
        );

        ChugSplashBundleState storage bundle = bundles[activeBundleId];

        require(
            bundle.status == ChugSplashBundleStatus.APPROVED,
            "ChugSplashManager: bundle is not approved"
        );

        require(
            bundle.executions[_actionIndex] == false,
            "ChugSplashManager: action has already been executed"
        );

        address executor = getSelectedExecutor(activeBundleId);
        require(
            executor == msg.sender,
            "ChugSplashManager: caller is not approved executor for active bundle ID"
        );

        require(
            MerkleTree.verify(
                activeBundleId,
                keccak256(abi.encode(_action.target, _action.actionType, _action.data)),
                _actionIndex,
                _proof,
                bundle.executions.length
            ),
            "ChugSplashManager: invalid bundle action proof"
        );

        // Get the proxy type for the proxy that is being used for this target.
        bytes32 proxyType = proxyTypes[_action.target];

        // Get the proxy to use for this target. The proxy can either be the default proxy used by
        // ChugSplash or a non-standard proxy that has previously been set by the project owner.
        address payable proxy;
        if (proxyType == bytes32(0)) {
            // Use a default proxy if this target has no proxy type assigned to it.

            // Make sure the proxy has code in it and deploy the proxy if it doesn't. Since we're
            // deploying via CREATE2, we can always correctly predict what the proxy address
            // *should* be and can therefore easily check if it's already populated.
            // TODO: See if there's a better way to handle this case because it messes with the gas
            // cost of SET_CODE/SET_STORAGE operations in a somewhat unpredictable way.
            proxy = getProxyByName(_action.target);
            if (proxy.code.length == 0) {
                bytes32 salt = keccak256(bytes(_action.target));
                Proxy created = new Proxy{ salt: salt }(address(this));

                // Could happen if insufficient gas is supplied to this transaction, should not
                // happen otherwise. If there's a situation in which this could happen other than a
                // standard OOG, then this would halt the entire contract.
                // TODO: Make sure this cannot happen in any case other than OOG.
                require(
                    address(created) == proxy,
                    "ChugSplashManager: Proxy was not created correctly"
                );
            }
        } else {
            // Use the non-standard proxy assigned to this target by the owner.
            proxy = proxies[_action.target];
        }

        // Next, we execute the ChugSplash action by calling setCode/setStorage.
        if (_action.actionType == ChugSplashActionType.SET_CODE) {
            _setProxyCode(proxy, proxyType, _action.data);
        } else {
            (bytes32 key, bytes32 val) = abi.decode(_action.data, (bytes32, bytes32));
            _setProxyStorage(proxy, proxyType, key, val);
        }

        // Mark the action as executed and update the total number of executed actions.
        bundle.total++;
        bundle.executions[_actionIndex] = true;

        emit ChugSplashActionExecuted(activeBundleId, msg.sender, _actionIndex);
        registry.announce("ChugSplashActionExecuted");

        // If all actions have been executed, then we can complete the bundle. Mark the bundle as
        // completed and reset the active bundle hash so that a new bundle can be executed.
        if (bundle.total == bundle.executions.length) {
            bundle.status = ChugSplashBundleStatus.COMPLETED;
            bytes32 completedBundleId = activeBundleId;
            activeBundleId = bytes32(0);

            emit ChugSplashBundleCompleted(completedBundleId, msg.sender, bundle.total);
            registry.announce("ChugSplashBundleCompleted");

            // Refund the executor's bond
            _returnExecutorBond(completedBundleId);
        }
    }

    /**
     * @notice **WARNING**: Cancellation is a potentially dangerous action and should not be
     *         executed unless in an emergency.
     *
     *         Cancels an active ChugSplash bundle. This causes the project owner to forfeit their
     *         bond to the executor, and also refunds the executor's bond.
     */
    function cancelActiveChugSplashBundle() public onlyOwner {
        require(activeBundleId != bytes32(0), "ChugSplashManager: no bundle is currently active");

        ChugSplashBundleState storage bundle = bundles[activeBundleId];

        bytes32 cancelledBundleId = activeBundleId;
        activeBundleId = bytes32(0);
        bundle.status = ChugSplashBundleStatus.CANCELLED;

        emit ChugSplashBundleCancelled(cancelledBundleId, msg.sender, bundle.total);
        registry.announce("ChugSplashBundleCancelled");

        _returnExecutorBond(cancelledBundleId);

        // Send the project owner's bond to the executor
        address executor = getSelectedExecutor(activeBundleId);
        (bool success, ) = payable(executor).call{ value: ownerBondAmount }(new bytes(0));
        require(success, "ChugSplashManager: failed to send owner's bond to the executor");
    }

    /**
     * @notice Allows an executor to post a bond of `executorBondAmount` to claim the sole right to
     *         execute actions for a bundle over a period of `executionLockTime`. Only the first
     *         executor to post a bond gains this right. Executors must finish executing the bundle
     *         within `executionLockTime` or else their bond is forfeited to this contract and
     *         another executor may claim the bundle. Note that this strategy creates a PGA for the
     *         transaction to claim the bundle but removes PGAs during the execution process.
     *
     * @param _bundleId ID of the bundle being claimed.
     */
    function claim(bytes32 _bundleId) external payable {
        require(
            executorBondAmount == msg.value,
            "ChugSplashManager: incorrect executor bond amount"
        );
        ChugSplashBundleStatus status = bundles[_bundleId].status;
        require(
            status == ChugSplashBundleStatus.APPROVED,
            "ChugSplashManager: bundle is not active"
        );

        ChugSplashBundleState storage bundle = bundles[_bundleId];

        require(
            block.timestamp > bundle.timeClaimed + executionLockTime,
            "ChugSplashManager: bundle already claimed by an executor"
        );

        bundle.timeClaimed = block.timestamp;
        bundle.selectedExecutor = msg.sender;

        emit ChugSplashBundleClaimed(_bundleId, msg.sender);
        registry.announce("ChugSplashBundleClaimed");
    }

    /**
     * @notice Assigns a non-standard proxy to the specified target to replace the default proxy
     *         used by ChugSplash. This allows project owners to plug their existing proxies into
     *         ChugSplash in a fully opt-in manner. Only callable by this contract's owner.
     *
     * @param _name      String name of the target.
     * @param _proxy     Address of the non-standard proxy.
     * @param _proxyType The proxy's type.
     */
    function setProxyToTarget(
        string memory _name,
        address payable _proxy,
        bytes32 _proxyType
    ) external onlyOwner {
        require(
            activeBundleId == bytes32(0),
            "ChugSplashManager: cannot change proxy while bundle is active"
        );
        require(_proxy != address(0), "ChugSplashManager: proxy cannot be address(0)");
        require(_proxyType != bytes32(0), "ChugSplashManager: proxy must have a proxy type");

        proxies[_name] = _proxy;
        proxyTypes[_name] = _proxyType;

        emit ProxySetToTarget(_name, _proxy, _proxyType, _name);
    }

    /**
     * @notice Allows the project owner to change the bond amount that an executor must pay to claim
     *         a bundle. Can only be called when there is no active bundle.
     *
     * @param _executorBondAmount The new executor bond amount.
     */
    function setExecutorBondAmount(uint256 _executorBondAmount) external onlyOwner {
        require(activeBundleId == bytes32(0), "ChugSplashManager: bundle is currently active");
        executorBondAmount = _executorBondAmount;

        emit ExecutorBondAmountSet(_executorBondAmount);
        registry.announce("ExecutorBondAmountSet");
    }

    /**
     * @notice Transfers ownership of a proxy from this contract to an address selected by the
     *         project owner.
     *
     * @param _name     String name of the target that corresponds to the proxy.
     * @param _newOwner Address of the project owner that is receiving ownership of the proxy.
     */
    function transferProxyOwnership(string memory _name, address _newOwner) public onlyOwner {
        // Get the proxy type that corresponds to this target.
        bytes32 proxyType = proxyTypes[_name];
        address payable proxy;
        if (proxyType == bytes32(0)) {
            // Use a default proxy if no proxy type has been set by the project owner.
            proxy = getProxyByName(_name);
        } else {
            // We revert here since we currently do not support custom proxy types.
            revert("ChugSplashManager: invalid proxy type, must be default proxy");
            // proxy = proxies[_name];
        }

        require(proxy.code.length != 0, "ChugSplashManager: proxy is not deployed");

        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(proxyType);
        require(adapter != address(0), "ChugSplashManager: proxy type has no adapter");

        // Delegatecall the adapter to change ownership of the proxy.
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.changeProxyAdmin, (proxy, _newOwner))
        );
        require(success, "ChugSplashManager: delegatecall to change proxy admin failed");

        emit ProxyOwnershipTransferred(_name, proxy, proxyType, _newOwner, _name);
    }

    /**
     * @notice Queries the selected executor for a given project/bundle.
     *
     * @param _bundleId ID of the bundle currently being executed.
     *
     * @return Address of the selected executor.
     */
    function getSelectedExecutor(bytes32 _bundleId) public view returns (address) {
        ChugSplashBundleState storage bundle = bundles[_bundleId];
        return bundle.selectedExecutor;
    }

    /**
     * @notice Computes the address of an ERC-1967 proxy that would be created by this contract
     *         given the target's name. This proxy is the default proxy used by ChugSplash. Uses
     *         CREATE2 to guarantee that this address will be correct.
     *
     * @param _name Name of the target to get the corresponding proxy address of.
     *
     * @return Address of the proxy for the given name.
     */
    function getProxyByName(string memory _name) public view returns (address payable) {
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
     * @notice Allows the project owner to withdraw funds to any recipient address. Cannot be called
     *         when there is an active bundle.
     *
     * @param _recipient Address to receive the funds.
     * @param _amount    Amount to withdraw.
     */
    function withdrawETH(address payable _recipient, uint256 _amount) external onlyOwner {
        require(
            activeBundleId != bytes32(0),
            "ChugSplashManager: cannot withdraw funds while bundle is active"
        );
        (bool success, ) = _recipient.call{ value: _amount }(new bytes(0));
        require(success, "ChugSplashManager: call to withdraw funds failed");

        emit ETHWithdrawn(msg.sender, _recipient, _amount);
    }

    /**
     * @notice Allows anyone to send ETH to this contract.
     */
    function depositETH() external payable {
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Allows anyone to send ETH to this contract without calling a function.
     */
    receive() external payable {
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Refunds `executorBondAmount` to the executor if they complete the bundle within
     *        `executionLockTime`, or if the project owner cancels the bundle.
     *
     * @param _bundleId ID of the bundle that was completed or cancelled by the project owner.
     */
    function _returnExecutorBond(bytes32 _bundleId) internal {
        ChugSplashBundleState memory bundle = bundles[_bundleId];
        require(
            bundle.status == ChugSplashBundleStatus.COMPLETED ||
                bundle.status == ChugSplashBundleStatus.CANCELLED,
            "ChugSplashManager: bundle is not completed or cancelled"
        );
        require(
            bundle.selectedExecutor != address(0),
            "ChugSplashManager: bundle has not been claimed"
        );
        require(
            !bundle.executorBondReturned,
            "ChugSplashManager: bond already returned to executor"
        );

        bundle.executorBondReturned = true;

        (bool success, ) = payable(bundle.selectedExecutor).call{ value: executorBondAmount }(
            new bytes(0)
        );
        require(success, "ChugSplashManager: call to executor failed");

        emit ExecutorBondReturned(_bundleId, bundle.selectedExecutor);
        registry.announce("ExecutorBondReturned");
    }

    /**
     * @notice Sets new code for the proxy contract's implementation. Note that this scheme is a bit
     *         different from the standard proxy scheme where one would typically deploy the code
     *         separately and then set the implementation address. We're doing it this way because
     *         it gives us a lot more freedom on the client side.
     *
     * @param _proxy     Address of the proxy to upgrade.
     * @param _proxyType The proxy's type. This is the zero-address for default proxies.
     * @param _code      Creation bytecode to be deployed.
     */
    function _setProxyCode(
        address payable _proxy,
        bytes32 _proxyType,
        bytes memory _code
    ) internal {
        // TODO: Add a re-entrancy guard to this function if we move away from using
        // `DEPLOY_CODE_PREFIX`. There is currently no risk of re-entrancy because the prefix
        // guarantees that no sub-calls can be made in the implementation contract's constructor. In
        // the future, we might want to move away from the prefix to add support for constructors
        // that can run arbitrary creation bytecode. It will then become become necessary to add a
        // re-entrancy guard to prevent a constructor from calling another contract which in turn
        // calls back into setCode or setStorage.

        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(_proxyType);
        require(adapter != address(0), "ChugSplashManager: proxy type has no adapter");

        // Get the address of the current implementation for the proxy.
        address implementation = _getProxyImplementation(_proxy, adapter);

        // If the code hash matches the code hash of the new implementation then we return early.
        if (keccak256(_code) == _getAccountCodeHash(implementation)) {
            return;
        }

        // Create the deploycode by prepending the magic prefix.
        bytes memory deploycode = abi.encodePacked(DEPLOY_CODE_PREFIX, _code);

        // Deploy the code and set the new implementation address.
        address newImplementation;
        assembly {
            newImplementation := create(0x0, add(deploycode, 0x20), mload(deploycode))
        }

        // Check that the code was actually deployed correctly. It might be impossible to fail this
        // check. Should only happen if the contract creation from above runs out of gas but this
        // parent execution thread does NOT run out of gas. Seems like we should be doing this check
        // anyway though.
        require(
            _getAccountCodeHash(newImplementation) == keccak256(_code),
            "ProxyUpdater: code was not correctly deployed"
        );

        // Delegatecall the adapter to upgrade the proxy's implementation contract.
        _upgradeProxyTo(_proxy, adapter, implementation);
    }

    /**
     * @notice Modifies a storage slot within the proxy contract.
     *
     * @param _proxy     Address of the proxy to upgrade.
     * @param _proxyType The proxy's type. This is the zero-address for default proxies.
     * @param _key       Storage key to modify.
     * @param _value     New value for the storage key.
     */
    function _setProxyStorage(
        address payable _proxy,
        bytes32 _proxyType,
        bytes32 _key,
        bytes32 _value
    ) internal {
        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(_proxyType);
        require(adapter != address(0), "ChugSplashManager: proxy type has no adapter");

        // Get the address of the current implementation for the proxy. The ChugSplashManager will
        // set the proxy's implementation back to this address after setting it to be the
        // ProxyUpdater and calling `setStorage`.
        address implementation = _getProxyImplementation(_proxy, adapter);

        // Delegatecall the adapter to upgrade the proxy's implementation to be the ProxyUpdater,
        // which has the `setStorage` function.
        _upgradeProxyTo(_proxy, adapter, proxyUpdater);

        // Call the `setStorage` action on the proxy.
        (bool success, ) = _proxy.call(abi.encodeCall(ProxyUpdater.setStorage, (_key, _value)));
        require(success, "ChugSplashManager: call to set proxy storage failed");

        // Delegatecall the adapter to set the proxy's implementation back to its original address.
        _upgradeProxyTo(_proxy, adapter, implementation);
    }

    /**
     * @notice Delegatecalls an adapter to get the address of the proxy's implementation contract.
     *
     * @param _proxy   Address of the proxy.
     * @param _adapter Address of the adapter to use for the proxy.
     */
    function _getProxyImplementation(address payable _proxy, address _adapter)
        internal
        returns (address)
    {
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
