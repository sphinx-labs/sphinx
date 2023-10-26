// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./D.sol";
import "./A.sol";

contract B {
    bool public boolean;

    constructor(bool _boolean) {
        boolean = _boolean;
    }

    function toggle() public {
        boolean = !boolean;
    }
}
