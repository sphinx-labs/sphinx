// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { ICreate2 } from "./interfaces/ICreate2.sol";

/**
 * @title DefaultCreate2
 */
contract DefaultCreate2 is ICreate2 {
    function computeAddress(
        bytes32 _salt,
        bytes32 _bytecodeHash,
        address _deployer
    ) external pure returns (address) {
        return Create2.computeAddress(_salt, _bytecodeHash, _deployer);
    }
}
