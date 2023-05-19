// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

library DeterministicDeployer {
    function deploy (bytes memory creationCode, string memory name) internal returns (address) {
        address addr = Create2.computeAddress(bytes32(0), keccak256(creationCode));
        if (addr.code.length == 0) {
            Create2.deploy(
                0,
                bytes32(0),
                creationCode
            );
        } else {
            require(keccak256(addr.code) == keccak256(creationCode), string.concat(name, " creation code mismatch"));
        }

        return addr;
    }

}
