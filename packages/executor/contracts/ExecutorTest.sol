// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract ExecutorProxyTest {
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;
}

contract ExecutorNonProxyTest {
    uint8 public val;

    constructor(uint8 _val) {
        val = _val;
    }
}
