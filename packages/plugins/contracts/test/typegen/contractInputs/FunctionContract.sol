// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { MyImportContract } from "./ImportContract.sol";

contract LocalContract {
    uint256 public number;

    constructor(uint256 _number) {
        number = _number;
    }
}

contract FunctionContract {
    MyImportContract public importContract;
    LocalContract public localContract;

    constructor(MyImportContract _importContract, LocalContract _localContract) {
        importContract = _importContract;
        localContract = _localContract;
    }

    function setImportContract(MyImportContract _importContract) public {
        importContract = _importContract;
    }

    function setLocalContract(LocalContract _localContract) public {
        localContract = _localContract;
    }

    function fetchImportContract() public pure returns (MyImportContract) {
        return MyImportContract(address(10));
    }

    function fetchLocalContract() public pure returns (LocalContract) {
        return LocalContract(address(11));
    }
}
