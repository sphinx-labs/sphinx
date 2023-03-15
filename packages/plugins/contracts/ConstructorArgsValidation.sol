// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ConstructorArgsValidation {
    bytes32 immutable public immutableBytes;

    constructor(bytes32 _immutableBytes) {
        immutableBytes = _immutableBytes;
    }
}
