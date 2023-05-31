// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { CREATE3 } from "solmate/src/utils/CREATE3.sol";
import { Bytes32AddressLib } from "solmate/src/utils/Bytes32AddressLib.sol";
import { ICreate3 } from "./interfaces/ICreate3.sol";

/**
 * @title DefaultCreate3
 * @notice Default implementation of the ICreate3 interface. The default Create3 formula is used on
           Ethereum and networks that are EVM-equivalent, or close to it.
 */
contract DefaultCreate3 is ICreate3 {
    using Bytes32AddressLib for bytes32;

    bytes internal constant PROXY_BYTECODE = hex"67_36_3d_3d_37_36_3d_34_f0_3d_52_60_08_60_18_f3";

    bytes32 internal constant PROXY_BYTECODE_HASH = keccak256(PROXY_BYTECODE);

    /**
     * @inheritdoc ICreate3
     */
    function deploy(
        bytes32 _salt,
        bytes memory _creationCode,
        uint256 _value
    ) public returns (address deployed) {
        return CREATE3.deploy(_salt, _creationCode, _value);
    }

    /**
     * @inheritdoc ICreate3
     */
    function getAddress(bytes32 _salt) external view returns (address) {
        return CREATE3.getDeployed(_salt);
    }

    function getAddressFromDeployer(
        bytes32 _salt,
        address _deployer
    ) public pure returns (address) {
        address proxy = keccak256(
            abi.encodePacked(
                // Prefix:
                bytes1(0xFF),
                // Creator:
                _deployer,
                // Salt:
                _salt,
                // Bytecode hash:
                PROXY_BYTECODE_HASH
            )
        ).fromLast20Bytes();

        return
            keccak256(
                abi.encodePacked(
                    // 0xd6 = 0xc0 (short RLP prefix) + 0x16 (length of: 0x94 ++ proxy ++ 0x01)
                    // 0x94 = 0x80 + 0x14 (0x14 = the length of an address, 20 bytes, in hex)
                    hex"d6_94",
                    proxy,
                    hex"01" // Nonce of the proxy contract (1)
                )
            ).fromLast20Bytes();
    }
}
