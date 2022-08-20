// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IExecutorSelectionStrategy } from "./IExecutorSelectionStrategy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { ChugSplashManager } from "./ChugSplashManager.sol";
import { ChugSplashBundleState } from "./ChugSplashStructs.sol";
import { ChugSplashBundleStatus } from "./ChugSplashEnums.sol";

/**
 * @notice SimpleLockESS implements the most basic Executor Selection Strategy.
 */
contract SimpleLockESS is IExecutorSelectionStrategy {
    /**
     * @notice Struct representing an upgrade claimed by an executor.
     */
    struct ClaimedUpgrade {
        uint256 timeClaimed;
        address selectedExecutor;
        bool executorBondReturned;
    }

    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @notice Amount in ETH that the executor must send to this contract to claim an upgrade for
     *         `upgradeLockTime`.
     */
    uint256 public immutable executorBondAmount;

    /**
     * @notice Amount of time for an executor to complete an upgrade once they have claimed it.
     *         If the executor fails to complete the upgrade in this amount of time, their bond is
     *         forfeited.
     */
    uint256 public immutable upgradeLockTime;

    /**
     * @notice Mapping of ChugSplashManager addresses to bundle IDs to claimed upgrades.
     */
    mapping(address => mapping(bytes32 => ClaimedUpgrade)) public upgrades;

    /**
     * @param _registry           Address of the ChugSplashRegistry.
     * @param _executorBondAmount Executor bond amount in ETH.
     * @param _upgradeLockTime    Amount of time for an executor to complete an upgrade after
     *                            claiming it.
     */
    constructor(
        ChugSplashRegistry _registry,
        uint256 _executorBondAmount,
        uint256 _upgradeLockTime
    ) {
        registry = _registry;
        executorBondAmount = _executorBondAmount;
        upgradeLockTime = _upgradeLockTime;
    }

    /**
     * @notice Allows an executor to post a bond of `executorBondAmount` to claim the sole right to
     *         execute actions for an upgrade for a period of `upgradeLockTime`. Only the first
     *         executor to post a bond gains this right. If the executor fails to complete the
     *         upgrade within the `upgradeLockTime`, a new executor may post a bond and the original
     *         bond is forfeited and transferred into the wallet of the project’s
     *         `ChugSplashManager` contract. Note that this strategy creates a PGA for the
     *         transaction to claim the upgrade but removes PGAs during the execution process.
     *
     * @param _manager  Address of the ChugSplashManager for the project being claimed.
     * @param _bundleId ID of the bundle being claimed.
     */
    function claim(address _manager, bytes32 _bundleId) external payable {
        require(executorBondAmount == msg.value, "SimpleLockESS: incorrect executor bond amount");
        require(
            registry.managers(ChugSplashManager(_manager)) == true,
            "SimpleLockESS: address is not ChugSplashManager"
        );
        (ChugSplashBundleStatus status, ) = ChugSplashManager(_manager).bundles(_bundleId);
        require(status == ChugSplashBundleStatus.APPROVED, "SimpleLockESS: bundle is not active");

        ClaimedUpgrade storage upgrade = upgrades[_manager][_bundleId];

        uint256 upgradeDeadline = upgrade.timeClaimed + upgradeLockTime;
        require(block.timestamp > upgradeDeadline, "SimpleLockESS: upgrade in progress");

        address prevSelectedExecutor = upgrade.selectedExecutor;

        upgrade.timeClaimed = block.timestamp;
        upgrade.selectedExecutor = msg.sender;

        if (prevSelectedExecutor != address(0)) {
            // If the previously selected executor failed to complete the upgrade, their bond is
            // sent to the address of the ChugSplashManager.
            (bool success, ) = payable(_manager).call{ value: executorBondAmount }(new bytes(0));
            require(success, "SimpleLockESS: call to ChugSplashManager failed");
        }

        emit UpgradeClaimed(_manager, _bundleId, msg.sender, prevSelectedExecutor);
    }

    /**
     * @notice Refunds `executorBondAmount` to the executor if they complete the upgrade within
     *        `upgradeLockTime`, or if the project owner cancels the upgrade. Must be called by the
     *        project's ChugSplashManager.
     *
     * @param _bundleId ID of the bundle that was completed or cancelled by the project owner.
     */
    function returnExecutorBond(bytes32 _bundleId) external {
        ClaimedUpgrade storage upgrade = upgrades[msg.sender][_bundleId];
        require(
            upgrade.selectedExecutor != address(0),
            "SimpleLockESS: upgrade has not been claimed"
        );
        require(!upgrade.executorBondReturned, "SimpleLockESS: bond already returned to executor");

        address executor = upgrade.selectedExecutor;

        upgrade.executorBondReturned = true;
        // Set the other parameters back to their default values.
        upgrade.timeClaimed = 0;
        upgrade.selectedExecutor = address(0);

        (bool success, ) = payable(executor).call{ value: executorBondAmount }(new bytes(0));
        require(success, "SimpleLockESS: call to executor failed");

        emit ExecutorBondReturned(msg.sender, _bundleId, executor);
    }

    /**
     * @inheritdoc IExecutorSelectionStrategy
     */
    function getSelectedExecutor(address _manager, bytes32 _bundleId)
        external
        view
        returns (address)
    {
        ClaimedUpgrade storage upgrade = upgrades[_manager][_bundleId];
        return upgrade.selectedExecutor;
    }
}
