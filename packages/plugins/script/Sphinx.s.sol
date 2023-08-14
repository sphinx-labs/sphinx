// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Sphinx } from "../contracts/foundry/Sphinx.sol";
import { Script } from "forge-std/Script.sol";

contract SphinxScript is Sphinx, Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        deployVerbose("sphinx/Storage.config.ts", vm.rpcUrl("anvil"));
        vm.stopBroadcast();
    }
}
