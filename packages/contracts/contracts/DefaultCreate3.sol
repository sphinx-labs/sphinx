// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { CREATE3 } from "solmate/src/utils/CREATE3.sol";
import { ICreate3 } from "./interfaces/ICreate3.sol";

/**
 * @title DefaultCreate3
 * @notice Default implementation of the ICreate3 interface. The default Create3 formula is used on
           Ethereum and networks that are EVM-equivalent, or close to it.
 */
contract DefaultCreate3 is ICreate3 {
    /**
     * @inheritdoc ICreate3
     */
    function deploy(
        bytes32 _salt,
        bytes memory _creationCode,
        uint256 _value
    ) external returns (address deployed) {
        return CREATE3.deploy(_salt, _creationCode, _value);
    }

    /**
     * @inheritdoc ICreate3
     */
    function getAddress(bytes32 _salt) external view returns (address) {
        return CREATE3.getDeployed(_salt);
    }
}
