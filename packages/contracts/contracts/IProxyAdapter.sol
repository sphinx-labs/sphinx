// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title IProxyAdapter
 * @notice Interface that must be inherited by each adapter.
 */
interface IProxyAdapter {
    /**
     * @notice Upgrade the implementation of the proxy.
     *
     * @param _proxy          Address of the proxy.
     * @param _implementation Address of the updater implementation.
     */
    function initiateExecution(address payable _proxy, address _implementation) external;

    /**
     * @notice Upgrade the implementation of the proxy.
     *
     * @param _proxy          Address of the proxy.
     * @param _implementation Address of the final implementation.
     */
    function completeExecution(address payable _proxy, address _implementation) external;

    /**
     * @notice Modifies some storage slot within the proxy contract. Gives us a lot of power to
     *         perform upgrades in a more transparent way.
     *
     * @param _key   Storage key to modify.
     * @param _value New value for the storage key.
     */
    function setStorage(address payable _proxy, bytes32 _key, bytes32 _value) external;

    /**
     * @notice Changes the admin of the proxy.
     *
     * @param _proxy    Address of the proxy.
     * @param _newAdmin Address of the new admin.
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external;
}
