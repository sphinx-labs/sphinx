// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import {
    PreconditionResult
} from "../SphinxDataTypes.sol";

interface IPreconditionChecker {
    function check(bytes memory _data) external returns (PreconditionResult);
}
