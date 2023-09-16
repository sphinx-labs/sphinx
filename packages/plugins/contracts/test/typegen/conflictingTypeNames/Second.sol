// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

type ConflictingType is uint;

struct ConflictingStruct {
    uint a;
}

enum ConflictingEnum {
    First,
    Second
}

contract ConflictingTypeNameContractSecond {
    ConflictingType public conflictingType;
    ConflictingStruct public conflictingStruct;
    ConflictingEnum public conflictingEnum;

    constructor(
        ConflictingType _conflictingType,
        ConflictingStruct memory _conflictingStruct,
        ConflictingEnum _conflictingEnum
    ) {
        conflictingType = _conflictingType;
        conflictingStruct = _conflictingStruct;
        conflictingEnum = _conflictingEnum;
    }
}
