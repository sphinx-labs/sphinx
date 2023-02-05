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
     * @param _implementation Address of the new implementation.
     */
    function upgradeProxyTo(address payable _proxy, address _implementation) external;

    /**
     * @notice Set the proxy's implementation and call a function in a single transaction.
     *
     * @param _implementation Address of the implementation contract.
     * @param _data           Calldata to delegatecall the new implementation with.
     */
    function upgradeProxyToAndCall(
        address payable _proxy,
        address _implementation,
        bytes calldata _data
    ) external returns (bytes memory);

    /**
     * @notice Changes the admin of the proxy.
     *
     * @param _proxy    Address of the proxy.
     * @param _newAdmin Address of the new admin.
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external;
}
