// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { Sphinx } from "./Sphinx.sol";
import { Script } from "forge-std/Script.sol";

contract Deploy is Sphinx, Script {
    string private configPath = vm.envString("SPHINX_INTERNAL_CONFIG_PATH");
    string private rpcUrl = vm.envString("SPHINX_INTERNAL_RPC_URL");
    bool broadcast = vm.envBool("SPHINX_INTERNAL_BROADCAST");
    uint256 deployerPrivateKey = vm.envUint("SPHINX_INTERNAL_PRIVATE_KEY");

    function run() public {
        if (broadcast) vm.startBroadcast(deployerPrivateKey);
        deployVerbose(configPath, rpcUrl);
        if (broadcast) vm.stopBroadcast();
    }
}
