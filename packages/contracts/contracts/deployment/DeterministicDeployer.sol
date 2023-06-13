// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { toString } from 

library DeterministicDeployer {
    address constant DETERMINISTIC_DEPLOYMENT_PROXY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function deploy(bytes memory creationCode) internal returns (address) {
        address expectedAddr = Create2.computeAddress(
            bytes32(0),
            keccak256(creationCode),
            DETERMINISTIC_DEPLOYMENT_PROXY
        );

        if (expectedAddr.code.length == 0) {
            bytes memory code = bytes.concat(bytes32(0), creationCode);
            (bool success, ) = DETERMINISTIC_DEPLOYMENT_PROXY.call(code);
            require(success, string.concat("failed to deploy contract. expected address: ", vm.toString(expectedAddr)));
        }

        return expectedAddr;
    }
}
