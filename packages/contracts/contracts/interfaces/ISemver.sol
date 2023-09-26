// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { Version } from "../SphinxDataTypes.sol";

interface ISemver {
    function version() external view returns (Version memory);
}