// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title IProxyUpdater
 * @notice Interface that must be inherited by each adapter.
 */
interface IProxyUpdater {
    /**
     * @notice Replaces a segment of a proxy's storage slot value at a given key and offset. The
     *         storage value outside of this segment remains the same.
     *
     * @param _key     Storage key to modify.
     * @param _offset  Bytes offset of the new segment from the right side of the storage slot.
     * @param _segment New value for the segment of the storage slot.
     */
    function setStorage(bytes32 _key, uint8 _offset, bytes memory _segment) external;
}
