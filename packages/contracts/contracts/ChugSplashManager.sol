// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Owned } from "@rari-capital/solmate/src/auth/Owned.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { ChugSplashProxy } from "./ChugSplashProxy.sol";
import { Create2 } from "./libraries/Create2.sol";
import { MerkleTree } from "./libraries/MerkleTree.sol";

/**
 * @title ChugSplashManager
 */
contract ChugSplashManager is Owned {
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
        COMPLETED
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
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @notice Name of the project this contract is managing.
     */
    string public name;

    /**
     * @notice ID of the currently active bundle.
     */
    bytes32 public activebundleId;

    /**
     * @notice Mapping of bundle IDs to bundle state.
     */
    mapping(bytes32 => ChugSplashBundleState) public bundles;

    /**
     * @param _registry Address of the ChugSplashRegistry.
     * @param _name     Name of the project this contract is managing.
     * @param _owner    Initial owner of this contract.
     */
    constructor(
        ChugSplashRegistry _registry,
        string memory _name,
        address _owner
    ) Owned(_owner) {
        registry = _registry;
        name = _name;
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
    function computebundleId(
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
        bytes32 bundleId = computebundleId(_bundleRoot, _bundleSize, _configUri);
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
     * @notice Allows the owner to approve a bundle to be executed. Note that the bundle can be
     *         executed as soon as the bundle is approved.
     *
     * @param _bundleId ID of the bundle to approve
     */
    function approveChugSplashBundle(bytes32 _bundleId) public onlyOwner {
        ChugSplashBundleState storage bundle = bundles[_bundleId];

        require(
            bundle.status == ChugSplashBundleStatus.PROPOSED,
            "ChugSplashManager: bundle does not exist or has already been approved or completed"
        );

        require(
            activebundleId == bytes32(0),
            "ChugSplashManager: another bundle has been approved and not yet completed"
        );

        activebundleId = _bundleId;
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
    function executeChugSplashBundleActions(
        ChugSplashAction memory _action,
        uint256 _actionIndex,
        bytes32[] memory _proof
    ) public {
        require(
            activebundleId != bytes32(0),
            "ChugSplashManager: no bundle has been approved for execution"
        );

        ChugSplashBundleState storage bundle = bundles[activebundleId];

        require(
            bundle.status != ChugSplashBundleStatus.COMPLETED,
            "ChugSplashManager: bundle has already been completed"
        );

        require(
            bundle.executions[_actionIndex] == false,
            "ChugSplashManager: action has already been executed"
        );

        require(
            MerkleTree.verify(
                activebundleId,
                keccak256(abi.encode(_action.target, _action.actionType, _action.data)),
                _actionIndex,
                _proof,
                bundle.executions.length
            ),
            "ChugSplashManager: invalid bundle action proof"
        );

        // Make sure the proxy has code in it and deploy the proxy if it doesn't. Since we're
        // deploying via CREATE2, we can always correctly predict what the proxy address *should*
        // be and can therefore easily check if it's already populated.
        // TODO: See if there's a better way to handle this case because it messes with the gas
        // cost of SET_CODE/SET_STORAGE operations in a somewhat unpredictable way.
        ChugSplashProxy proxy = getProxyByName(_action.target);
        if (address(proxy).code.length == 0) {
            bytes32 salt = keccak256(bytes(_action.target));
            ChugSplashProxy created = new ChugSplashProxy{ salt: salt }(address(this));

            // Could happen if insufficient gas is supplied to this transaction, should not happen
            // otherwise. If there's a situation in which this could happen other than a standard
            // OOG, then this would halt the entire contract.
            // TODO: Make sure this cannot happen in any case other than OOG.
            require(
                address(created) != address(proxy),
                "ChugSplashManager: ChugSplashProxy was not created correctly"
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

        emit ChugSplashActionExecuted(activebundleId, msg.sender, _actionIndex);
        registry.announce("ChugSplashActionExecuted");

        // If all actions have been executed, then we can complete the bundle. Mark the bundle as
        // completed and reset the active bundle hash so that a new bundle can be executed.
        if (bundle.total == bundle.executions.length) {
            bundle.status = ChugSplashBundleStatus.COMPLETED;
            activebundleId = bytes32(0);

            emit ChugSplashBundleCompleted(activebundleId, msg.sender, bundle.total);
            registry.announce("ChugSplashBundleCompleted");
        }
    }

    /**
     * @notice Computes the address of a ChugSplash proxy that would be created by this contract
     *         given the proxy's name. Uses CREATE2 to guarantee that this address will be correct.
     *
     * @param _name Name of the ChugSplash proxy to get the address of.
     *
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
