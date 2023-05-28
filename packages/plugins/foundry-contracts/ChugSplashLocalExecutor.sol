pragma solidity ^0.8.15;

// SPDX-License-Identifier: MIT
import {
    ChugSplashBundles,
    DeploymentState,
    BundledChugSplashAction,
    RawChugSplashAction,
    DeploymentStatus,
    ChugSplashActionType,
    ChugSplashTarget,
    BundledChugSplashTarget
} from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";
import { ChugSplashManager } from "@chugsplash/contracts/contracts/ChugSplashManager.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract ChugSplashLocalExecutor {

    function inefficientSlice(BundledChugSplashAction[] memory selected, uint start, uint end) public pure returns (BundledChugSplashAction[] memory sliced) {
        for (uint i = start; i < end; i++) {
            sliced[i] = selected[i + 1];
        }
    }

    /**
     * @notice Splits up a bundled action into its components
     */
    function disassembleActions(BundledChugSplashAction[] memory actions) public pure returns (RawChugSplashAction[] memory, uint256[] memory, bytes32[][] memory) {
        RawChugSplashAction[] memory rawActions = new RawChugSplashAction[](actions.length);
        uint256[] memory _actionIndexes = new uint256[](actions.length);
        bytes32[][] memory _proofs = new bytes32[][](actions.length);
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            rawActions[i] = action.action;
            _actionIndexes[i] = action.proof.actionIndex;
            _proofs[i] = action.proof.siblings;
        }

        return (rawActions, _actionIndexes, _proofs);
    }

    /**
     * Helper function that determines if a given batch is executable within the specified gas limit.
     */
    function executable(
        BundledChugSplashAction[] memory selected,
        ChugSplashManager manager,
        uint maxGasLimit
    ) public view returns (bool) {
        (RawChugSplashAction[] memory actions, uint256[] memory _actionIndexes, bytes32[][] memory _proofs) = disassembleActions(selected);
        (bool success, ) = address(manager).staticcall{ gas: maxGasLimit }(abi.encodeCall(ChugSplashManager.executeActions, (actions, _actionIndexes, _proofs)));
        return success;
    }

    /**
     * Helper function for finding the maximum number of batch elements that can be executed from a
     * given input list of actions. This is done by performing a binary search over the possible
     * batch sizes and finding the largest batch size that does not exceed the maximum gas limit.
     */
    function findMaxBatchSize(
        BundledChugSplashAction[] memory actions,
        ChugSplashManager manager,
        uint maxGasLimit
    ) public view returns (uint) {
        // Optimization, try to execute the entire batch at once before doing a binary search
        if (executable(actions, manager, maxGasLimit)) {
            return actions.length;
        }

        // If the full batch isn't executavle, then do a binary search to find the largest executable batch size
        uint min = 0;
        uint max = actions.length;
        while (min < max) {
            uint mid = Math.ceilDiv((min + max), 2);
            BundledChugSplashAction[] memory left = inefficientSlice(actions, 0, mid);
            if (executable(left, manager, maxGasLimit)) {
                min = mid;
            } else {
                max = mid - 1;
            }
        }

        // No possible size works, this is a problem and should never happen
        if (min == 0) {
            revert("Unable to find a batch size that does not exceed the block gas limit");
        }

        return min;
    }

    /**
     * Helper function for executing a list of actions in batches.
     */
    function executeBatchActions(
        BundledChugSplashAction[] memory actions,
        ChugSplashManager manager,
        uint maxGasLimit
    ) public returns (DeploymentStatus) {
        // Pull the deployment state from the contract to make sure we're up to date
        bytes32 activeDeploymentId = manager.activeDeploymentId();
        DeploymentState memory state = manager.deployments(activeDeploymentId);

        // Filter out actions that have already been executed
        uint length = 0;
        BundledChugSplashAction[] memory filteredActions = new BundledChugSplashAction[](length);
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            if (state.actions[action.proof.actionIndex] == false) {
                length += 1;
            }
        }
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            if (state.actions[action.proof.actionIndex] == false) {
                filteredActions[i] = action;
            }
        }

        // Exit early if there are no actions to execute
        if (filteredActions.length == 0) {
            return state.status;
        }

        uint executed = 0;
        while (executed < filteredActions.length) {
            // Figure out the maximum number of actions that can be executed in a single batch
            uint batchSize = findMaxBatchSize(inefficientSlice(filteredActions, executed, filteredActions.length), manager, maxGasLimit);
            BundledChugSplashAction[] memory batch = inefficientSlice(filteredActions, executed, executed + batchSize);

            (RawChugSplashAction[] memory rawActions, uint256[] memory _actionIndexes, bytes32[][] memory _proofs) = disassembleActions(batch);

            manager.executeActions(rawActions, _actionIndexes, _proofs);

            // Return early if the deployment failed
            state = manager.deployments(activeDeploymentId);
            if (state.status == DeploymentStatus.FAILED) {
                return state.status;
            }

            // Move to next batch if necessary
            executed += batchSize;
        }

        // Return the final status
        return state.status;
    }

    function executeDeployment(
        ChugSplashManager manager,
        ChugSplashBundles memory bundles,
        uint256 blockGasLimit
    ) private returns (bool) {
        // We execute all actions in batches to reduce the total number of transactions and reduce the
        // cost of a deployment in general. Approaching the maximum block gas limit can cause
        // transactions to be executed slowly as a result of the algorithms that miners use to select
        // which transactions to include. As a result, we restrict our total gas usage to a fraction of
        // the block gas limit.
        uint maxGasLimit = blockGasLimit / 2;

        // Get number of deploy contract and set state actions
        (uint256 numDeployContractActions, uint256 numSetStorageActions) = getNumActions(actionBundle.actions);

        // Split up the deploy contract and set storage actions
        BundledChugSplashAction[] memory deployContractActions = new BundledChugSplashAction[](numDeployContractActions);
        BundledChugSplashAction[] memory setStorageActions = new BundledChugSplashAction[](numSetStorageActions);
        for (uint i = 0; i < bundles.actionBundle.actions.length; i++) {
            BundledChugSplashAction memory action = bundles.actionBundle.actions[i];
            if (action.action.actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                deployContractActions[i] = action;
            } else {
                setStorageActions[i] = action;
            }
        }

        // Execute all the deploy contract actions and exit early if the deployment failed
        DeploymentStatus status = executeBatchActions(deployContractActions, manager, maxGasLimit);
        if (status == DeploymentStatus.FAILED) {
            return false;
        } else if (status == DeploymentStatus.COMPLETED) {
            return true;
        }

        // Dissemble the set storage actions
        ChugSplashTarget[] memory targets = new ChugSplashTarget[](bundles.targetBundle.targets.length);
        bytes32[][] memory proofs = new bytes32[][](bundles.targetBundle.targets.length);
        for (uint i = 0; i < bundles.targetBundle.targets.length; i++) {
            BundledChugSplashTarget memory target = bundles.targetBundle.targets[i];
            targets[i] = target.target;
            proofs[i] = target.siblings;
        }

        // Start the upgrade
        manager.initiateUpgrade(targets, proofs);

        // Execute all the set storage actions
        executeBatchActions(setStorageActions, manager, maxGasLimit);

        // Complete the upgrade
        manager.finalizeUpgrade(targets, proofs);

        return true;
    }

    function getNumActions(ChugSplashActionBundle memory _actionBundle) private returns (uint numDeployContractActions, uint numSetStorageActions)  {
        uint256 numDeployContractActions = 0;
        uint256 numSetStorageActions = 0;
        for (uint256 i = 0; i < _actionBundle.actions.length; i++) {
            ChugSplashActionType actionType = _actionBundle.actions[i].action.actionType;
            if (actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                numDeployContractActions += 1;
            } else if (actionType == ChugSplashActionType.SET_STORAGE) {
                numSetStorageActions += 1;
            }
        }
        return (numDeployContractActions, numSetStorageActions);
    }
}
