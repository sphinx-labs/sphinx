// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// TODO(docs): not meant to be deployed on a live network.
contract GasSpender {
    mapping(uint256 => bool) private myMapping;

    constructor(uint256 _gasToUse) {
        uint256 startGas = gasleft();

        // Perform operations until the specified gas amount is spent
        uint256 count;
        while (startGas - gasleft() < _gasToUse) {
            myMapping[count] = true;
            count += 1;
        }
    }
}
