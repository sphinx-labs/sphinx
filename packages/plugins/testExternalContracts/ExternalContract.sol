// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IExternalContract } from './IExternalContract.sol';

contract ExternalContract is IExternalContract {
    uint public number;

    constructor(uint _number) {
        number = _number;
    }

    function setNumber(uint _number) external {
        number = _number;
    }
}
