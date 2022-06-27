// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Owned } from "@rari-capital/solmate/src/auth/Owned.sol";
import { ChugSplashProxy } from "./ChugSplashProxy.sol";
import { Create2 } from "./libraries/Create2.sol";
import { MerkleTree } from "./libraries/MerkleTree.sol";
import { EthUtils } from "./libraries/EthUtils.sol";

/**
 * @title ChugSplashManager
 * @notice The ChugSplashManager contract is responsible for managing a given ChugSplash project
 * deployment. The ChugSplashManager has a single owner address, which can then be implemented to
 * restrict access to specific functions within this contract.
 */
contract ChugSplashManager is Owned {
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
        string target;
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
     * Emitted when a ChugSplash bundle is proposed.
     */
    event ChugSplashBundleProposed(
        bytes32 indexed bundleHash,
        uint256 bundleSize,
        string configUri
    );

    /**
     * Emitted when a ChugSplash action is executed.
     */
    event ChugSplashActionExecuted(
        bytes32 indexed bundleHash,
        address indexed executor,
        uint256 actionIndex
    );

    /**
     * Emitted when a ChugSplash bundle is completed.
     */
    event ChugSplashBundleCompleted(
        bytes32 indexed bundleHash,
        address indexed executor,
        uint256 total
    );

    /**
     * Mapping of bundle hashes to ChugSplash bundle states.
     */
    mapping(bytes32 => ChugSplashBundleState) public bundles;

    /**
     * Current active bundle hash.
     */
    bytes32 public activeBundleHash;

    /**
     * @param _owner Initial owner for this contract.
     */
    constructor(address _owner) Owned(_owner) {}

    /**
     * Allows a user to propose a new ChugSplash bundle to be executed.
     *
     * @param _bundleHash Hash of the bundle to execute.
     * @param _bundleSize Total number of actions in the bundle.
     * @param _configUri URI pointing to the config file for the bundle.
     */
    function proposeChugSplashBundle(
        bytes32 _bundleHash,
        uint256 _bundleSize,
        string memory _configUri
    ) public onlyOwner {
        require(
            bundles[_bundleHash].status == ChugSplashBundleStatus.EMPTY,
            "ChugSplashManager: bundle already exists"
        );

        bundles[_bundleHash] = ChugSplashBundleState({
            status: ChugSplashBundleStatus.PROPOSED,
            executions: new bool[](_bundleSize),
            total: 0
        });

        emit ChugSplashBundleProposed(_bundleHash, _bundleSize, _configUri);
    }

    /**
     * Approves a bundle to be executed. Note that the bundle can be executed as oon as the bundle
     * is approved.
     *
     * @param _bundleHash Hash of the bundle to approve.
     */
    function approveChugSplashBundle(bytes32 _bundleHash) public onlyOwner {
        require(
            bundles[_bundleHash].status == ChugSplashBundleStatus.PROPOSED,
            "ChugSplashManager: bundle either does not exist or has already been approved or completed"
        );

        require(
            isUpgrading() == false,
            "ChugSplashManager: another bundle has been approved and not yet completed"
        );

        activeBundleHash = _bundleHash;
        bundles[_bundleHash].status = ChugSplashBundleStatus.APPROVED;
    }

    /**
     * Executes a specific action within the current active bundle. Actions can only be executed
     * once. If executing this action would complete the bundle, will mark the bundle as completed
     * and make it possible for a new bundle to be approved.
     *
     * @param _action Action to execute.
     * @param _actionIndex Index of the action in the bundle.
     * @param _proof Merkle proof of the action within the bundle.
     */
    function executeChugSplashBundleAction(
        ChugSplashAction memory _action,
        uint256 _actionIndex,
        bytes32[] memory _proof
    ) public {
        require(
            isUpgrading() == true,
            "ChugSplashManager: no bundle has been approved for execution"
        );

        ChugSplashBundleState storage bundle = bundles[activeBundleHash];

        // TODO: Confirm that this will do out-of-bounds checks.
        require(
            bundle.executions[_actionIndex] == false,
            "ChugSplashManager: action has already been executed"
        );

        require(
            MerkleTree.verify(
                activeBundleHash,
                keccak256(abi.encode(_action.actionType, _action.target, _action.data)),
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
        if (EthUtils.hasCode(address(proxy)) == false) {
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
        emit ChugSplashActionExecuted(activeBundleHash, msg.sender, _actionIndex);

        // If all actions have been executed, then we can complete the bundle. Mark the bundle as
        // completed and reset the active bundle hash so that a new bundle can be executed.
        if (bundle.total == bundle.executions.length) {
            emit ChugSplashBundleCompleted(activeBundleHash, msg.sender, bundle.total);
            bundles[activeBundleHash].status = ChugSplashBundleStatus.COMPLETED;
            activeBundleHash = bytes32(0);
        }
    }

    /**
     * @return True if the contract currently has an active bundle.
     */
    function isUpgrading() public view returns (bool) {
        return activeBundleHash != bytes32(0);
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
