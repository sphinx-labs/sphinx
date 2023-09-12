// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MyOwnableContract is Ownable {
    uint256 public myOwnableValue;

    constructor(address _sphinxManager) {
        _transferOwnership(_sphinxManager);
    }

    function myOwnableFunction(uint256 _value) external onlyOwner {
        myOwnableValue = _value;
    }
}
