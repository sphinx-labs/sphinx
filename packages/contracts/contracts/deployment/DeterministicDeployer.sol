// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

library DeterministicDeployer {
    function deploy(bytes memory creationCode, string memory name) internal returns (address) {
        address DeterministicDeploymentProxy = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
        address addr = Create2.computeAddress(
            bytes32(0),
            keccak256(creationCode),
            DeterministicDeploymentProxy
        );

        if (addr.code.length == 0) {
            bytes memory code = bytes.concat(bytes32(0), creationCode);
            (bool success, ) = DeterministicDeploymentProxy.call(code);
            require(success, string.concat(name, " deployment failed"));
        }

        return addr;
    }
}
