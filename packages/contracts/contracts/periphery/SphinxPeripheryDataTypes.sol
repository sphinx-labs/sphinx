// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";

struct GnosisSafeTransaction {
    address to;
    uint256 value;
    bytes txData;
    Enum.Operation operation;
}
