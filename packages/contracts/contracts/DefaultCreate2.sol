// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { ICreate2 } from "./interfaces/ICreate2.sol";

/**
 * @title DefaultCreate2
 * @notice Default implementation of the ICreate2 interface. The default CREATE2 formula is used on
           Ethereum and networks that are EVM-equivalent, or close to it.
 */
contract DefaultCreate2 is ICreate2 {
    /**
     * @inheritdoc ICreate2
     */
    function computeAddress(
        bytes32 _salt,
        bytes32 _bytecodeHash,
        address _deployer
    ) external pure returns (address) {
        return Create2.computeAddress(_salt, _bytecodeHash, _deployer);
    }
}
