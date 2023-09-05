// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { Sphinx } from "../../contracts/foundry/Sphinx.sol";
import { Script } from "forge-std/Script.sol";

contract Broadcast is Sphinx, Script {
    string private configPath = vm.envString("SPHINX_INTERNAL_CONFIG_PATH");
    string private rpcUrl = vm.envString("SPHINX_INTERNAL_RPC_URL");
    uint256 deployerPrivateKey = vm.envUint("SPHINX_INTERNAL_PRIVATE_KEY");

    function run() public {
        vm.startBroadcast(deployerPrivateKey);
        deployVerbose(configPath, rpcUrl);
        vm.stopBroadcast();
    }
}
