// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title IProxyAdapter
 * @notice Interface that must be inherited by each adapter.
 */
interface IProxyAdapter {
    /**
     * @notice Returns the current implementation of the proxy.
     *
     * @param _proxy Address of the proxy.
     */
    function getProxyImplementation(address payable _proxy) external returns (address);

    /**
     * @dev Upgrade the implementation of the proxy.
     *
     * @param _proxy          Address of the proxy.
     * @param _implementation Address of the new implementation.
     */
    function upgradeProxyTo(address payable _proxy, address _implementation) external;

    /**
     * @notice Changes the admin of the proxy.
     *
     * @param _proxy    Address of the proxy.
     * @param _newAdmin Address of the new admin.
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external;
}
