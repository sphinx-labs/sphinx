// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { StorageSetter } from "./StorageSetter.sol";

contract HelloChugSplash is StorageSetter {
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;
}
