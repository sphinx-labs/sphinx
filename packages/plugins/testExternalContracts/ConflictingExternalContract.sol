// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IExternalContract } from './IExternalContract.sol';

contract ExternalContract {
    bool public myBool;

    constructor(bool _myBool) {
        myBool = _myBool;
    }

    function setBool(bool _myBool) external {
        myBool = _myBool;
    }
}
