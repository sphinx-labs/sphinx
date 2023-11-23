// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { B } from "./D.sol";

contract A is B {
    uint256 public number;

    constructor(uint256 _number, bool _boolean) B(_boolean) {
        number = _number;
    }

    function increment() public {
        number++;
    }
}
