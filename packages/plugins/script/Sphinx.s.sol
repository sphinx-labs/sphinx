// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Sphinx } from "../contracts/foundry/Sphinx.sol";

contract SphinxScript is Sphinx {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        deploy("sphinx/Storage.config.ts", vm.rpcUrl("anvil"));
        vm.stopBroadcast();
    }
}
