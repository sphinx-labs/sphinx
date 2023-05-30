// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "hardhat/console.sol";

    error He(string msg);


struct Hi {
    bool idk;
}

import "hardhat/console.sol";

contract HelloChugSplash {

    Hi public thing;
    Logic public logic;

    constructor() {
        logic = new Logic();
    }

    function hi() external returns (uint) {
        (bool success, bytes memory retdata) = address(logic).delegatecall(abi.encodeCall(Logic.t, ()));
        console.logBytes(retdata);
    }

    function _hi(Hi storage _thing) internal {

    }

    function get() external view returns (bool) {
        return thing.idk;
    }
}

contract Logic {
    function t() external {
        revert He("hi");
    }
}
