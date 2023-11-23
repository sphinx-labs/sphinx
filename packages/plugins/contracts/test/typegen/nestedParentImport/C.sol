// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./B.sol";

contract NestedImportChild is A {
    string public str;

    constructor(string memory _str, uint256 _number, bool _boolean) A(_number, _boolean) {
        str = _str;
    }

    function setString(string memory _str) public {
        str = _str;
    }
}
