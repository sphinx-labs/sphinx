// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloSphinx {
    string public greeting;
    string public name;
    uint public number;

    constructor(string memory _greeting, string memory _name, uint _number) {
        greeting = _greeting;
        name = _name;
        number = _number;
    }

    function add(uint _add) public {
        number += _add;
    }
}
