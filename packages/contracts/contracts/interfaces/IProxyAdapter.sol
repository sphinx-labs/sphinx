// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title IProxyAdapter
 * @notice Interface that must be inherited by each adapter.
 */
interface IProxyAdapter {
    /**
     * @notice Update the proxy to be in a state where it can be upgraded by ChugSplash.
     *
     * @param _proxy Address of the proxy.
     */
    function initiateExecution(address payable _proxy) external;

    /**
     * @notice Upgrade the implementation of the proxy.
     *
     * @param _proxy          Address of the proxy.
     * @param _implementation Address of the final implementation.
     */
    function completeExecution(address payable _proxy, address _implementation) external;

    /**
     * @notice Replaces a segment of a proxy's storage slot value at a given key and offset. The
     *         storage value outside of this segment remains the same.
     *
     * @param _proxy   Address of the proxy to modify.
     * @param _key     Storage key to modify.
     * @param _offset  Bytes offset of the new segment from the right side of the storage slot.
     * @param _segment New value for the segment of the storage slot.
     */
    function setStorage(
        address payable _proxy,
        bytes32 _key,
        uint8 _offset,
        bytes memory _segment
    ) external;

    /**
     * @notice Changes the admin of the proxy.
     *
     * @param _proxy    Address of the proxy.
     * @param _newAdmin Address of the new admin.
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external;
}
