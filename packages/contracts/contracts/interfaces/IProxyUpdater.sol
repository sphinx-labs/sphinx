// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title IProxyUpdater
 * @notice Interface that must be inherited by each proxy updater. Contracts that
           inherit from this interface are meant to be set as the implementation of a proxy during
           an upgrade, then delegatecalled by the proxy's owner to change the value of a storage
           slot within the proxy.
 */
interface IProxyUpdater {
    /**
     * @notice Sets a proxy's storage slot value at a given storage slot key and offset.
     *
     * @param _key     Storage slot key to modify.
     * @param _offset  Bytes offset of the new storage slot value from the right side of the storage
       slot. An offset of 0 means the new value will start at the right-most byte of the storage
       slot.
     * @param _value New value of the storage slot at the given key and offset. The length of the
                     value is in the range [1, 32] (inclusive).
     */
    function setStorage(bytes32 _key, uint8 _offset, bytes memory _value) external;
}
