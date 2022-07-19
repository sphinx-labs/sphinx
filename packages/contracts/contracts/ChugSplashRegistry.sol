// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashProxy } from "./ChugSplashProxy.sol";
import { Create2 } from "./libraries/Create2.sol";
import { MerkleTree } from "./libraries/MerkleTree.sol";

/**
 * @title ChugSplashRegistry
 * @notice The ChugSplashRegistry is the root contract for the ChugSplash deployment system. All
 * deployments must be first registered with this contract, which allows clients to easily find and
 * index these deployments. Deployment names are unique and are reserved on a first-come,
 * first-served basis. This contract is also responsible for managing each ChugSplash project
 * deployment. Each project has a single manager address, which has sole authority to propose and
 * approve deployments.
 */
contract ChugSplashRegistry {
    /**
     * Enum representing possible ChugSplash action types.
     */
    enum ChugSplashActionType {
        SET_CODE,
        SET_STORAGE
    }

    /**
     * Enum representing the status of a given ChugSplash action.
     */
    enum ChugSplashBundleStatus {
        EMPTY,
        PROPOSED,
        APPROVED,
        COMPLETED
    }

    /**
     * Struct representing a ChugSplash action.
     */
    struct ChugSplashAction {
        ChugSplashActionType actionType;
        bytes data;
    }

    /**
     * Struct representing the state of a ChugSplash bundle.
     */
    struct ChugSplashBundleState {
        ChugSplashBundleStatus status;
        bool[] executions;
        uint256 total;
    }

    /**
     * Struct representing a ChugSplash project. A project can have multiple proposed
     * bundles at once, but only one bundle can be approved and executed at a time.
     */
    struct ChugSplashProject {
        mapping(bytes32 => ChugSplashBundleState) bundles;
        bytes32 activeBundleHash;
        address manager;
    }

    /**
     * Emitted when a ChugSplash bundle is proposed.
     */
    event ChugSplashBundleProposed(
        string indexed projectName,
        bytes32 indexed bundleHash,
        uint256 bundleSize,
        string configUri
    );

    /**
     Emitted when a ChugSplash bundle is approved.
     */
    event ChugSplashBundleApproved(
        string indexed projectName,
        bytes32 indexed activeBundleHash
    );

    /**
     * Emitted when a ChugSplash action is executed.
     */
    event ChugSplashActionExecuted(
        string indexed projectName,
        bytes32 indexed bundleHash,
        address indexed executor,
        uint256 actionIndex
    );

    /**
     * Emitted when a ChugSplash bundle is completed.
     */
    event ChugSplashBundleCompleted(
        string indexed projectName,
        bytes32 indexed bundleHash,
        address indexed executor,
        uint256 total
    );

    // TODO: Remove `nonIndexedProjectName` after demo.
    // This parameter is required for now so that the "list all projects" task works.
    // Without this parameter, we won't be able to recover the unhashed project name
    // in events, since indexed dynamic types like strings are hashed.
    // For further explanation: https://github.com/ethers-io/ethers.js/issues/243
    /**
     * Emitted whenever a new project is registered.
     */
    event ChugSplashProjectRegistered(
        string indexed projectName,
        address indexed creator,
        address indexed manager,
        string nonIndexedProjectName
    );

    /**
     * Emitted whenever there is a new manager for an existing project.
     */
    event ChugSplashManagerUpdated(
        string indexed projectName,
        address indexed previousManager,
        address indexed newManager
    );

    /**
     * Mapping of project names to ChugSplash projects.
     */
    mapping(string => ChugSplashProject) public projects;

    /**
     * Allows only the manager of a project to call the functions.
     */
    modifier onlyManager(string memory _name) {
        require(msg.sender == projects[_name].manager, "ChugSplashRegistry: caller is not manager");
        _;
    }

    /**
     * Registers a new project.
     *
     * @param _name Name of the new ChugSplash project.
     * @param _manager Initial manager for the new project.
     */
    function register(string memory _name, address _manager) public {
        // TODO: Standardize error reporting system.
        require(
            projects[_name].manager == address(0),
            "ChugSplashRegistry: name already registered"
        );

        ChugSplashProject storage project = projects[_name];
        project.manager = _manager;
        emit ChugSplashProjectRegistered(_name, msg.sender, _manager, _name);
    }

    /**
     * Allows a manager to propose a new ChugSplash bundle to be executed.
     *
     * @param _name Name of the ChugSplash project.
     * @param _bundleHash Hash of the bundle to execute.
     * @param _bundleSize Total number of actions in the bundle.
     * @param _configUri URI pointing to the config file for the bundle.
     */
    function proposeChugSplashBundle(
        string memory _name,
        bytes32 _bundleHash,
        uint256 _bundleSize,
        string memory _configUri
    ) public onlyManager(_name) {
        ChugSplashBundleState storage bundle = projects[_name].bundles[_bundleHash];
        require(
            bundle.status == ChugSplashBundleStatus.EMPTY,
            "ChugSplashRegistry: bundle already exists"
        );

        bundle.status = ChugSplashBundleStatus.PROPOSED;
        bundle.executions = new bool[](_bundleSize);

        emit ChugSplashBundleProposed(_name, _bundleHash, _bundleSize, _configUri);
    }

    /**
     * Allows a manager to approve a bundle to be executed. Note that the bundle can be executed
     * as soon as the bundle is approved.
     *
     * @param _name Name of the ChugSplash project.
     * @param _bundleHash Hash of the bundle to approve.
     */
    function approveChugSplashBundle(string memory _name, bytes32 _bundleHash) public onlyManager(_name) {
        ChugSplashProject storage project = projects[_name];
        ChugSplashBundleState storage bundle = project.bundles[_bundleHash];
        require(
            bundle.status == ChugSplashBundleStatus.PROPOSED,
            "ChugSplashRegistry: bundle either does not exist or has already been approved or completed"
        );

        require(
            isUpgrading(_name) == false,
            "ChugSplashRegistry: another bundle has been approved and not yet completed"
        );

        project.activeBundleHash = _bundleHash;
        bundle.status = ChugSplashBundleStatus.APPROVED;

        emit ChugSplashBundleApproved(_name, _bundleHash);
    }

    /**
     * Executes a specific action within the current active bundle for a project. Actions can only be
     * executed once. If executing this action would complete the bundle, will mark the bundle as
     * completed and make it possible for a new bundle to be approved.
     *
     * @param _name Name of the ChugSplash project.
     * @param _action Action to execute.
     * @param _actionIndex Index of the action in the bundle.
     * @param _proof Merkle proof of the action within the bundle.
     */
    function executeChugSplashBundleAction(
        string memory _name,
        ChugSplashAction memory _action,
        uint256 _actionIndex,
        bytes32[] memory _proof
    ) public {
        require(
            isUpgrading(_name) == true,
            "ChugSplashRegistry: no bundle has been approved for execution"
        );

        ChugSplashProject storage project = projects[_name];
        bytes32 activeBundleHash = project.activeBundleHash;
        ChugSplashBundleState storage bundle = project.bundles[activeBundleHash];

        require(
            bundle.executions[_actionIndex] == false,
            "ChugSplashRegistry: action has already been executed"
        );

        require(
            MerkleTree.verify(
                activeBundleHash,
                keccak256(abi.encode(_action.actionType, _name, _action.data)),
                _actionIndex,
                _proof,
                bundle.executions.length
            ),
            "ChugSplashRegistry: invalid bundle action proof"
        );

        // Make sure the proxy has code in it and deploy the proxy if it doesn't. Since we're
        // deploying via CREATE2, we can always correctly predict what the proxy address *should*
        // be and can therefore easily check if it's already populated.
        // TODO: See if there's a better way to handle this case because it messes with the gas
        // cost of SET_CODE/SET_STORAGE operations in a somewhat unpredictable way.
        ChugSplashProxy proxy = getProxyByName(_name);
        if (address(proxy).code.length == 0) {
            bytes32 salt = keccak256(bytes(_name));
            ChugSplashProxy created = new ChugSplashProxy{ salt: salt }(address(this));

            // Could happen if insufficient gas is supplied to this transaction, should not happen
            // otherwise. If there's a situation in which this could happen other than a standard
            // OOG, then this would halt the entire contract.
            // TODO: Make sure this cannot happen in any case other than OOG.
            require(
                address(created) != address(proxy),
                "ChugSplashRegistry: ChugSplashProxy was not created correctly"
            );
        }

        // Actually execute the action.
        if (_action.actionType == ChugSplashActionType.SET_CODE) {
            proxy.setCode(_action.data);
        } else {
            (bytes32 key, bytes32 val) = abi.decode(_action.data, (bytes32, bytes32));
            proxy.setStorage(key, val);
        }

        // Mark the action as executed and update the total number of executed actions.
        bundle.total++;
        bundle.executions[_actionIndex] = true;
        emit ChugSplashActionExecuted(_name, activeBundleHash, msg.sender, _actionIndex);

        // If all actions have been executed, then we can complete the bundle. Mark the bundle as
        // completed and reset the active bundle hash so that a new bundle can be executed.
        if (bundle.total == bundle.executions.length) {
            emit ChugSplashBundleCompleted(_name, activeBundleHash, msg.sender, bundle.total);
            bundle.status = ChugSplashBundleStatus.COMPLETED;
            project.activeBundleHash = bytes32(0);
        }
    }

    /**
     * Sets a new manager for the project.
     *
     * @param _name Name of the ChugSplash project.
     * @param _newManager New manager for the project.
     */
    function setManager(string memory _name, address _newManager) public onlyManager(_name) {
        projects[_name].manager = _newManager;

        emit ChugSplashManagerUpdated(_name, msg.sender, _newManager);
    }

    /**
     * Checks if the project is currently upgrading.
     *
     * @param _name Name of the ChugSplash project.
     * @return True if the contract currently has an active bundle.
     */
    function isUpgrading(string memory _name) public view returns (bool) {
        return projects[_name].activeBundleHash != bytes32(0);
    }

    /**
     * Computes the address of a ChugSplash proxy that would be created by this contract given the
     * proxy's name. Uses CREATE2 to guarantee that this address will be correct.
     *
     * @param _name Name of the ChugSplash proxy to get the address of.
     * @return Address of the ChugSplash proxy for the given name.
     */
    function getProxyByName(string memory _name) public view returns (ChugSplashProxy) {
        return (
            ChugSplashProxy(
                payable(
                    Create2.compute(
                        address(this),
                        keccak256(bytes(_name)),
                        type(ChugSplashProxy).creationCode
                    )
                )
            )
        );
    }
}
