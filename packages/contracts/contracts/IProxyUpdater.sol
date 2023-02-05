// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title IProxyUpdater
 * @notice Interface that must be inherited by each adapter.
 */
interface IProxyUpdater {
    /**
     * @notice Modifies some storage slot within the proxy contract. Gives us a lot of power to
     *         perform upgrades in a more transparent way.
     *
     * @param _key   Storage key to modify.
     * @param _value New value for the storage key.
     */
    function setStorage(bytes32 _key, bytes32 _value) external;

    /**
     * @notice Sets up the proxy updater. In this case, there is no setup required.
     */
    function setup() external;

    fallback() external;
}
