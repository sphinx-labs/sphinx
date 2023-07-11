// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ChugSplash } from "../contracts/foundry/ChugSplash.sol";

contract ChugSplashScript is ChugSplash {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        deploy("chugsplash/main.config.ts", 'Storage', vm.rpcUrl("anvil"));
        vm.stopBroadcast();
    }
}
