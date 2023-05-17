// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ComplexConstructorArgs {
    type UserDefinedType is uint256;

    struct ComplexStruct { bytes32 a; uint128 b; uint128 c; uint64[2] d; uint[][] e; }

    string public str;
    bytes public dynamicBytes;
    uint64[5] public uint64FixedArray;
    int64[] public int64DynamicArray;
    uint64[5][6] public uint64FixedNestedArray;
    uint64[][][] public uint64DynamicMultiNestedArray;
    ComplexStruct public complexStruct;

    constructor(
        string memory _str,
        bytes memory _dynamicBytes,
        uint64[5] memory _uint64FixedArray,
        int64[] memory _int64DynamicArray,
        uint64[5][6] memory _uint64FixedNestedArray,
        uint64[][][] memory _uint64DynamicMultiNestedArray,
        ComplexStruct memory _complexStruct
    ) {
        str = _str;
        dynamicBytes = _dynamicBytes;
        uint64FixedArray = _uint64FixedArray;
        int64DynamicArray = _int64DynamicArray;
        uint64FixedNestedArray = _uint64FixedNestedArray;
        uint64DynamicMultiNestedArray = _uint64DynamicMultiNestedArray;
        complexStruct = _complexStruct;
    }

    function getComplexStruct() external view returns (ComplexStruct memory) {
        return complexStruct;
    }
}
