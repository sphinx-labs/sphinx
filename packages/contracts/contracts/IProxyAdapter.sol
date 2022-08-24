// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IProxyAdapter {
    function getProxyImplementation(address payable _proxy) external returns (address);

    function upgradeProxyTo(address payable _proxy, address _implementation) external;
}
