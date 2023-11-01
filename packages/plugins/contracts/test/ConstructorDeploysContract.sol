// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DeployedInConstructor {
    uint public x;

    constructor(uint _x) {
        x = _x;
    }
}

contract ConstructorDeploysContract {
    DeployedInConstructor public myContract;

    constructor(uint _x) {
        myContract = new DeployedInConstructor(_x);
    }

    function get() public view returns (uint) {
        return myContract.x();
    }
}
