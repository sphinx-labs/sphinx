// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DeployedInConstructor {
    uint256 public x;

    constructor(uint256 _x) {
        x = _x;
    }
}

contract ConstructorDeploysContract {
    DeployedInConstructor public myContract;

    constructor(uint256 _x) {
        myContract = new DeployedInConstructor(_x);
    }

    function get() public view returns (uint256) {
        return myContract.x();
    }
}
