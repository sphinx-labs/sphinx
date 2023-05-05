// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract HelloChugSplash {
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;

    constructor(uint8 _number, bool _stored, address _otherStorage, string memory _storageName) {
        number = _number;
        stored = _stored;
        otherStorage = _otherStorage;
        storageName = _storageName;
    }
}
