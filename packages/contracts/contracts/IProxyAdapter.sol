// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IProxyAdapter {
    function getProxyImplementation() external returns (address implementation);

    function upgradeProxyTo(address _proxy, address _implementation) external;

    function setProxyCode(address _proxy, bytes memory _code) external;

    function setProxyStorage(
        address _proxy,
        bytes32 _key,
        bytes32 _value
    ) external;
}
