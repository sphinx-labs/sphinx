// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract SimpleStorage {
    // Define immutable variables
    uint8 internal number;
    bool internal stored;
    address internal otherStorage;
    // Leave `storageName` unchanged since Solidity doesn't support immutable strings
    string internal storageName;

    // We must instantiate the immutable variables in the constructor so that
    // Solidity doesn't throw an error.
    // constructor(uint8 _number, bool _stored, address _otherStorage) {
    //     number = _number;
    //     stored = _stored;
    //     otherStorage = _otherStorage;
    // }

    function getNumber() external view returns (uint8) {
        return number;
    }

    function isStored() external view returns (bool) {
        return stored;
    }

    function getStorageName() external view returns (string memory) {
        return storageName;
    }

    function getOtherStorage() external view returns (address) {
        return otherStorage;
    }
}
