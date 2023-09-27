// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

type ConflictingType is bool;

struct ConflictingStruct {
    bool a;
}

enum ConflictingEnum {
    First,
    Second,
    Third
}

contract ConflictingTypeNameContractFirst {
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

    function setConflictingTypes(
        ConflictingType _conflictingType,
        ConflictingStruct memory _conflictingStruct,
        ConflictingEnum _conflictingEnum
    ) public {
        conflictingType = _conflictingType;
        conflictingStruct = _conflictingStruct;
        conflictingEnum = _conflictingEnum;
    }

    function pureConflictingTypes()
        public
        pure
        returns (ConflictingType, ConflictingStruct memory, ConflictingEnum)
    {
        return (ConflictingType.wrap(true), ConflictingStruct(true), ConflictingEnum.First);
    }
}
