// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract SimpleStorage {
    uint8 internal number;
    bool internal stored;
    string internal storageName;
    address internal otherStorage;

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
