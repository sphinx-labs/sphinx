// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title IProxyAdapter
 * @notice Interface that must be inherited by each proxy adapter. Proxy adapters allow other
   contracts to delegatecall into proxies of different types (e.g. Transparent, UUPS, etc.) through
   a standard interface.
 */
interface IProxyAdapter {
    /**
     * @notice Initiate a deployment or upgrade of a proxy.
     *
     * @param _proxy Address of the proxy.
     */
    function initiateUpgrade(address payable _proxy) external;

    /**
     * @notice Complete a deployment or upgrade of a proxy.
     *
     * @param _proxy          Address of the proxy.
     * @param _implementation Address of the proxy's final implementation.
     */
    function finalizeUpgrade(address payable _proxy, address _implementation) external;

    /**
     * @notice Sets a proxy's storage slot value at a given storage slot key and offset.
     *
     * @param _proxy  Address of the proxy to modify.
     * @param _key     Storage slot key to modify.
     * @param _offset  Bytes offset of the new storage slot value from the right side of the storage
       slot. An offset of 0 means the new value will start at the right-most byte of the storage
       slot.
     * @param _value New value of the storage slot at the given key and offset. The length of the
                     value is in the range [1, 32] (inclusive).
     */
    function setStorage(
        address payable _proxy,
        bytes32 _key,
        uint8 _offset,
        bytes memory _value
    ) external;

    /**
     * @notice Changes the admin of the proxy. Note that this function is not triggered during a
               deployment. Instead, it's only triggered if transferring ownership of the UUPS proxy
               away from the ChugSplashManager, which occurs outside of the deployment process.
     *
     * @param _proxy    Address of the proxy.
     * @param _newAdmin Address of the new admin.
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external;
}
