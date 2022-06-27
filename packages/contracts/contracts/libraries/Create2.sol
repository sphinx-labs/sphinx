// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * Simple library for computing CREATE2 addresses.
 */
library Create2 {
    /**
     * Computes the CREATE2 address for the given parameters.
     *
     * @param _creator Address executing the CREATE2 instruction.
     * @param _salt 32 byte salt passed to the CREATE2 instruction.
     * @param _bytecode Initcode for the contract creation.
     * @return Predicted address of the created contract.
     */
    function compute(
        address _creator,
        bytes32 _salt,
        bytes memory _bytecode
    ) internal pure returns (address) {
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(bytes1(0xff), _creator, _salt, keccak256(_bytecode))
                        )
                    )
                )
            );
    }
}
