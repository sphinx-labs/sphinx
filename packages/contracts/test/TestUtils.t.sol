// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { SphinxUtils } from "../contracts/foundry/SphinxUtils.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";

contract TestUtils is SphinxUtils {
    function getOwnerSignatures(Wallet[] memory _owners, bytes32 _root) internal returns (bytes memory) {
        bytes[] memory signatures = new bytes[](_owners.length);
        for (uint256 i = 0; i < _owners.length; i++) {
            signatures[i] = signMetaTxnForAuthRoot(_owners[i].privateKey, _root);
        }
        return packBytes(signatures);
    }
}
