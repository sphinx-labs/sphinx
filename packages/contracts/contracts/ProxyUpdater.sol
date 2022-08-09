// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ProxyUpdater {
    function setCode(bytes32 _implementationKey, bytes memory _data) public {}

    function setStorage(bytes32 _key, bytes32 _value) public {}
}
