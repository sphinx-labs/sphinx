// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashManager } from "./ChugSplashManager.sol";
import { ChugSplashManagerProxy } from "./ChugSplashManagerProxy.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Proxy } from "./libraries/Proxy.sol";
import { IChugSplashRegistry } from "./interfaces/IChugSplashRegistry.sol";

/**
 * @title ChugSplashRegistry
 * @notice The ChugSplashRegistry is the root contract for the ChugSplash deployment system. All
 *         deployments must be first registered with this contract, which allows clients to easily
 *         find and index these deployments. Deployment names are unique and are reserved on a
 *         first-come, first-served basis.
 */
contract ChugSplashRegistry is Initializable, OwnableUpgradeable, IChugSplashRegistry {
    /**
     * @notice Emitted whenever a new project is registered.
     *
     * @param projectNameHash Hash of the project name. Without this parameter, we
     *                        won't be able to recover the unhashed project name in
     *                        events, since indexed dynamic types like strings are hashed.
     *                        For further explanation:
     *                        https://github.com/ethers-io/ethers.js/issues/243
     * @param creator         Address of the creator of the project.
     * @param manager         Address of the ChugSplashManager for this project.
     * @param owner           Address of the initial owner of the project.
     * @param projectName     Name of the project that was registered.
     */
    event ChugSplashProjectRegistered(
        string indexed projectNameHash,
        address indexed creator,
        address indexed manager,
        address owner,
        string projectName
    );

    /**
     * @notice Emitted whenever a ChugSplashManager contract wishes to announce an event on the
     *         registry. We use this to avoid needing a complex indexing system when we're trying
     *         to find events emitted by the various manager contracts.
     *
     * @param eventNameHash Hash of the name of the event being announced.
     * @param manager       Address of the ChugSplashManager announcing an event.
     * @param eventName     Name of the event being announced.
     */
    event EventAnnounced(string indexed eventNameHash, address indexed manager, string eventName);

    /**
     * @notice Emitted whenever a ChugSplashManager contract wishes to announce an event on the
     *         registry, including a field for arbitrary data. We use this to avoid needing a
     *         complex indexing system when we're trying to find events emitted by the various
     *         manager contracts.
     *
     * @param eventNameHash Hash of the name of the event being announced.
     * @param manager       Address of the ChugSplashManager announcing an event.
     * @param dataHash      Hash of the extra data.
     * @param eventName     Name of the event being announced.
     * @param data          The extra data.
     */
    event EventAnnouncedWithData(
        string indexed eventNameHash,
        address indexed manager,
        bytes indexed dataHash,
        string eventName,
        bytes data
    );

    /**
     * @notice Emitted whenever a new proxy type is added.
     *
     * @param proxyType Hash representing the proxy type.
     * @param adapter   Address of the adapter for the proxy.
     */
    event ProxyTypeAdded(bytes32 proxyType, address adapter);

    /**
     * @notice Emitted when an executor is added.
     *
     * @param executor Address of the added executor.
     */
    event ExecutorAdded(address indexed executor);

    /**
     * @notice Emitted when an executor is removed.
     *
     * @param executor Address of the removed executor.
     */
    event ExecutorRemoved(address indexed executor);

    /**
     * @notice Mapping of project names to ChugSplashManager contracts.
     */
    mapping(string => ChugSplashManager) public projects;

    /**
     * @notice Mapping of created manager contracts.
     */
    mapping(ChugSplashManager => bool) public managers;

    /**
     * @notice Mapping of proxy types to adapters.
     */
    mapping(bytes32 => address) public adapters;

    /**
     * @notice Mapping of proxy types to updaters.
     */
    mapping(bytes32 => address) public updaters;

    /**
     * @notice Addresses that can execute bundles.
     */
    mapping(address => bool) public executors;

    /**
     * @notice Amount that must be deposited in the ChugSplashManager in order to execute a bundle.
     */
    uint256 public immutable ownerBondAmount;

    /**
     * @notice Amount of time for an executor to completely execute a bundle after claiming it.
     */
    uint256 public immutable executionLockTime;

    /**
     * @notice Amount that executors are paid, denominated as a percentage of the cost of execution.
     */
    uint256 public immutable executorPaymentPercentage;

    /**
     * @notice Address of the ChugSplashManager implementation contract.
     */
    // TODO: Remove once this contract is not upgradeable anymore.
    address public immutable managerImplementation;

    /**
     * @param _ownerBondAmount           Amount that must be deposited in the ChugSplashManager in
     *                                   order to execute a bundle.
     * @param _executionLockTime         Amount of time for an executor to completely execute a
     *                                   bundle after claiming it.
     * @param _executorPaymentPercentage Amount that an executor will earn from completing a bundle,
     *                                   denominated as a percentage.
     * @param _managerImplementation     Address of the ChugSplashManager implementation contract.
     */
    constructor(
        uint256 _ownerBondAmount,
        uint256 _executionLockTime,
        uint256 _executorPaymentPercentage,
        address _managerImplementation
    ) {
        ownerBondAmount = _ownerBondAmount;
        executionLockTime = _executionLockTime;
        executorPaymentPercentage = _executorPaymentPercentage;
        managerImplementation = _managerImplementation;
    }

    /**
     * @param _owner Initial owner of this contract.
     * @param _executors Array of executors to add.
     */
    function initialize(address _owner, address[] memory _executors) public initializer {
        __Ownable_init();
        _transferOwnership(_owner);

        for (uint i = 0; i < _executors.length; i++) {
            _setExecutor(_executors[i], true);
        }
    }

    /**
     * @notice Registers a new project.
     *
     * @param _name  Name of the new ChugSplash project.
     * @param _owner Initial owner for the new project.
     */
    function register(string memory _name, address _owner) public {
        require(
            address(projects[_name]) == address(0),
            "ChugSplashRegistry: name already registered"
        );

        // Deploy the ChugSplashManager's proxy.
        ChugSplashManagerProxy manager = new ChugSplashManagerProxy{
            salt: keccak256(bytes(_name))
        }(
            this, // This will be the Registry's proxy address since the Registry will be
            // delegatecalled by the proxy.
            address(this)
        );
        // Initialize the proxy. Note that we initialize it in a different call from the deployment
        // because this makes it easy to calculate the Create2 address off-chain before it is
        // deployed.
        manager.upgradeToAndCall(
            managerImplementation,
            abi.encodeCall(ChugSplashManager.initialize, (_name, _owner))
        );

        projects[_name] = ChugSplashManager(payable(address(manager)));
        managers[ChugSplashManager(payable(address(manager)))] = true;

        emit ChugSplashProjectRegistered(_name, msg.sender, address(manager), _owner, _name);
    }

    /**
     * @notice Allows ChugSplashManager contracts to announce events.
     *
     * @param _event Name of the event to announce.
     */
    function announce(string memory _event) public {
        require(
            managers[ChugSplashManager(payable(msg.sender))] == true,
            "ChugSplashRegistry: events can only be announced by ChugSplashManager contracts"
        );

        emit EventAnnounced(_event, msg.sender, _event);
    }

    /**
     * @notice Allows ChugSplashManager contracts to announce events, including a field for
     *         arbitrary data.
     *
     * @param _event Name of the event to announce.
     * @param _data  Arbitrary data to include in the announced event.
     */
    function announceWithData(string memory _event, bytes memory _data) public {
        require(
            managers[ChugSplashManager(payable(msg.sender))] == true,
            "ChugSplashRegistry: events can only be announced by ChugSplashManager contracts"
        );

        emit EventAnnouncedWithData(_event, msg.sender, _data, _event, _data);
    }

    /**
     * @notice Adds a new proxy type with a corresponding adapter and updater, which
     *         can be used to upgrade a custom proxy.
     *
     * @param _proxyType Hash representing the proxy type
     * @param _adapter   Address of the adapter for this proxy type.
     * @param _updater   Address of the updater for this proxy type.
     */
    function addProxyType(bytes32 _proxyType, address _adapter, address _updater) external {
        require(
            adapters[_proxyType] == address(0),
            "ChugSplashRegistry: proxy type has an existing adapter"
        );
        require(
            updaters[_proxyType] == address(0),
            "ChugSplashRegistry: proxy type has an existing updater"
        );
        adapters[_proxyType] = _adapter;
        updaters[_proxyType] = _updater;

        emit ProxyTypeAdded(_proxyType, _adapter);
    }

    /**
     * @notice Add an executor, which can execute bundles on behalf of users. Only callable by the
     *         owner of this contract.
     *
     * @param _executor Address of the executor to add.
     */
    function addExecutor(address _executor) external onlyOwner {
        require(executors[_executor] == false, "ChugSplashRegistry: executor already added");
        _setExecutor(_executor, true);
        emit ExecutorAdded(_executor);
    }

    /**
     * @notice Remove an executor. Only callable by the owner of this contract.
     *
     * @param _executor Address of the executor to remove.
     */
    function removeExecutor(address _executor) external onlyOwner {
        require(executors[_executor] == true, "ChugSplashRegistry: executor already removed");
        _setExecutor(_executor, false);
        emit ExecutorRemoved(_executor);
    }

    /**
     * @notice Internal function that adds or removes an executor.
     *
     * @param _executor   Address of the executor to add or remove.
     * @param _isExecutor Boolean indicating if the executor is being added or removed.
     */
    function _setExecutor(address _executor, bool _isExecutor) internal {
        executors[_executor] = _isExecutor;
    }
}
