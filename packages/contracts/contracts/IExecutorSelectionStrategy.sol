// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @notice Interface for the Executor Selection Strategy (ESS).
 */
interface IExecutorSelectionStrategy {
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
