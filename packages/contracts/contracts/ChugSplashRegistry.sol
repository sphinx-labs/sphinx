// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashManager } from "./ChugSplashManager.sol";
import { ChugSplashManagerProxy } from "./ChugSplashManagerProxy.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { Proxy } from "./libraries/Proxy.sol";

/**
 * @title ChugSplashRegistry
 * @notice The ChugSplashRegistry is the root contract for the ChugSplash deployment system. All
 *         deployments must be first registered with this contract, which allows clients to easily
 *         find and index these deployments. Deployment names are unique and are reserved on a
 *         first-come, first-served basis.
 */
contract ChugSplashRegistry is Initializable {
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
     * @param manager       Address of the manager announcing an event.
     * @param eventName     Name of the event being announced.
     */
    event EventAnnounced(string indexed eventNameHash, address indexed manager, string eventName);

    /**
     * @notice Emitted whenever a new proxy type is added.
     *
     * @param proxyType Hash representing the proxy type.
     * @param adapter   Address of the adapter for the proxy.
     */
    event ProxyTypeAdded(bytes32 proxyType, address adapter);

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
     * @notice Address of the ProxyUpdater.
     */
    address public immutable proxyUpdater;

    /**
     * @notice Amount that must be deposited in the ChugSplashManager in order to execute a bundle.
     */
    uint256 public immutable ownerBondAmount;

    /**
     * @notice Amount that an executor must send to the ChugSplashManager to claim a bundle.
     */
    uint256 public immutable executorBondAmount;

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
     * @param _proxyUpdater              Address of the ProxyUpdater.
     * @param _ownerBondAmount           Amount that must be deposited in the ChugSplashManager in
     *                                   order to execute a bundle.
     * @param _executorBondAmount        Amount that an executor must send to the ChugSplashManager
     *                                   to claim a bundle.
     * @param _executionLockTime         Amount of time for an executor to completely execute a
     *                                   bundle after claiming it.
     * @param _executorPaymentPercentage Amount that an executor will earn from completing a bundle,
     *                                   denominated as a percentage.
     * @param _managerImplementation     Address of the ChugSplashManager implementation contract.
     */
    constructor(
        address _proxyUpdater,
        uint256 _ownerBondAmount,
        uint256 _executorBondAmount,
        uint256 _executionLockTime,
        uint256 _executorPaymentPercentage,
        address _managerImplementation
    ) {
        proxyUpdater = _proxyUpdater;
        ownerBondAmount = _ownerBondAmount;
        executorBondAmount = _executorBondAmount;
        executionLockTime = _executionLockTime;
        executorPaymentPercentage = _executorPaymentPercentage;
        managerImplementation = _managerImplementation;
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
     * @notice Adds a new proxy type with a corresponding adapter, which can be used to upgrade a
     *         custom proxy.
     *
     * @param _proxyType Hash representing the proxy type
     * @param _adapter   Address of the adapter for this proxy type.
     */
    function addProxyType(bytes32 _proxyType, address _adapter) external {
        require(
            adapters[_proxyType] == address(0),
            "ChugSplashRegistry: proxy type has an existing adapter"
        );
        adapters[_proxyType] = _adapter;

        emit ProxyTypeAdded(_proxyType, _adapter);
    }
}
