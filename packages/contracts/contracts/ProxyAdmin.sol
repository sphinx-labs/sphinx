// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ProxyAdmin {
    function getProxyImplementation(address _proxy, bytes32 _proxyType)
        public
        returns (address implementation)
    {}

    function upgrade(
        address _proxy,
        bytes32 _proxyType,
        address _implementation
    ) public {}

    function setProxyCode(
        address _proxy,
        bytes32 _proxyType,
        bytes memory _data
    ) public {}

    function setProxyStorage(
        address _proxy,
        bytes32 _proxyType,
        bytes32 _key,
        bytes32 _value
    ) public {}
}
