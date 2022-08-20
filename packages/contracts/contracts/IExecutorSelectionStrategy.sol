// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";

/**
 * @notice Interface for the Executor Selection Strategy (ESS).
 */
interface IExecutorSelectionStrategy {
    /**
     * @notice Emitted when an upgrade is claimed by an executor.
     *
     * @param project      Address of the ChugSplashManager that mananges the project.
     * @param bundleId     ID of the bundle that was claimed.
     * @param executor     Address of the executor that claimed the bundle ID for the project.
     * @param prevExecutor Address of the executor that previously claimed the bundle ID for the
     *                     project. This is address(0) if there was no previous executor.
     */
    event UpgradeClaimed(
        address indexed project,
        bytes32 indexed bundleId,
        address indexed executor,
        address prevExecutor
    );

    /**
     * @notice Emitted when an executor is refunded the bond that they originally posted to claim an
     *         upgrade.
     *
     * @param project  Address of the ChugSplashManager that mananges the project.
     * @param bundleId ID of the bundle that was claimed.
     * @param executor Address of the executor that posted the bond.
     */
    event ExecutorBondReturned(
        address indexed project,
        bytes32 indexed bundleId,
        address indexed executor
    );

    /**
     * @notice Allows an executor to claim the sole right to execute actions for an upgrade.
     *
     * @param _project  Address of the ChugSplashManager for the project being claimed.
     * @param _bundleId ID of the bundle being claimed.
     */
    function claim(address _project, bytes32 _bundleId) external payable;

    /**
     * @notice Refunds the bond to the executor after an upgrade is successfully completed, or after
     *         a project owner cancels an upgrade. Must be called by the ChugSplashManager for the
     *         project.
     *
     * @param _bundleId ID of the bundle that was completed or cancelled by the project owner.
     */
    function returnExecutorBond(bytes32 _bundleId) external;

    /**
     * @notice Queries the selected executor for a given project/bundle.
     *
     * @param _project  Address of the ChugSplashManager that mananges the project.
     * @param _bundleId ID of the bundle currently being executed.
     *
     * @return Address of the selected executor.
     */
    function getSelectedExecutor(address _project, bytes32 _bundleId)
        external
        view
        returns (address);
}
