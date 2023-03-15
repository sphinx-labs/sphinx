// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashRecorder } from "./ChugSplashRecorder.sol";
import { ChugSplashManager } from "./ChugSplashManager.sol";
import { ChugSplashManagerProxy } from "./ChugSplashManagerProxy.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Proxy } from "./libraries/Proxy.sol";

/**
 * @title ChugSplashRegistry
 * @notice The ChugSplashRegistry is the root contract for the ChugSplash deployment system. All
 *         deployments must be first registered with this contract, which allows clients to easily
 *         find and index these deployments. Deployment names are unique and are reserved on a
 *         first-come, first-served basis.
 */
contract ChugSplashRegistry is Initializable, OwnableUpgradeable {
    /**
     * @notice The storage slot that holds the address of the ChugSplashManager implementation.
     *         bytes32(uint256(keccak256('chugsplash.manager.impl')) - 1)
     */
    bytes32 internal constant CHUGSPLASH_MANAGER_IMPL_SLOT_KEY =
        0x7b0358d93596f559fb0a8295e803eca8ad9478a0e8c810ef8867dd1bd7a1cbb1;

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
     * @notice Addresses that can execute bundles.
     */
    mapping(address => bool) public executors;

    ChugSplashRecorder public recorder;

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
     * @param _ownerBondAmount           Amount that must be deposited in the ChugSplashManager in
     *                                   order to execute a bundle.
     * @param _executionLockTime         Amount of time for an executor to completely execute a
     *                                   bundle after claiming it.
     * @param _executorPaymentPercentage Amount that an executor will earn from completing a bundle,
     *                                   denominated as a percentage.
     */
    constructor(
        uint256 _ownerBondAmount,
        uint256 _executionLockTime,
        uint256 _executorPaymentPercentage
    ) {
        ownerBondAmount = _ownerBondAmount;
        executionLockTime = _executionLockTime;
        executorPaymentPercentage = _executorPaymentPercentage;
    }

    /**
     * @param _recorder         Address of the ChugSplashRecorder.
     * @param _owner            Initial owner of this contract.
     * @param _rootManagerProxy Address of the root ChugSplashManagerProxy.
     * @param _executors        Array of executors to add.
     */
    function initialize(
        ChugSplashRecorder _recorder,
        address _owner,
        address _rootManagerProxy,
        address[] memory _executors
    ) public initializer {
        recorder = _recorder;

        __Ownable_init();
        _transferOwnership(_owner);

        // Add the root ChugSplashManager to projects and managers mappings. Will be removed once
        // ChugSplash is non-upgradeable.
        projects["ChugSplash"] = ChugSplashManager(payable(_rootManagerProxy));
        recorder.addManager(_rootManagerProxy);

        uint256 length = _executors.length;
        for (uint256 i; i < length; ) {
            executors[_executors[i]] = true;
            unchecked {
                ++i;
            }
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
            address(this), // This will be the Registry's proxy address since the Registry will be
            // delegatecalled by the proxy.
            address(this)
        );
        // Initialize the proxy. Note that we initialize it in a different call from the deployment
        // because this makes it easy to calculate the Create2 address off-chain before it is
        // deployed.
        manager.upgradeToAndCall(
            _getManagerImpl(),
            abi.encodeCall(ChugSplashManager.initialize, (_name, _owner))
        );

        projects[_name] = ChugSplashManager(payable(address(manager)));
        recorder.addManager(address(manager));

        emit ChugSplashProjectRegistered(_name, msg.sender, address(manager), _owner, _name);
    }

    /**
     * @notice Add an executor, which can execute bundles on behalf of users. Only callable by the
     *         owner of this contract.
     *
     * @param _executor Address of the executor to add.
     */
    function addExecutor(address _executor) external onlyOwner {
        require(executors[_executor] == false, "ChugSplashRegistry: executor already added");
        executors[_executor] = true;
        emit ExecutorAdded(_executor);
    }

    /**
     * @notice Remove an executor. Only callable by the owner of this contract.
     *
     * @param _executor Address of the executor to remove.
     */
    function removeExecutor(address _executor) external onlyOwner {
        require(executors[_executor] == true, "ChugSplashRegistry: executor already removed");
        executors[_executor] = false;
        emit ExecutorRemoved(_executor);
    }

    /**
     * @notice Internal function that gets the ChugSplashManager implementation address. Will only
     *         return a valid value when this contract is delegatecalled by the
     *         ChugSplashRegistryProxy. Note that this will be removed when ChugSplash is
     *         non-upgradeable.
     */
    function _getManagerImpl() internal view returns (address) {
        address impl;
        assembly {
            impl := sload(CHUGSPLASH_MANAGER_IMPL_SLOT_KEY)
        }
        return impl;
    }
}
