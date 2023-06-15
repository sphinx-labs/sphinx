// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ChugSplash } from "../contracts/foundry/ChugSplash.sol";

contract ChugSplashScript is ChugSplash {
    function run() public {
        vm.startBroadcast();
        deploy("./chugsplash/Storage.config.ts", vm.rpcUrl("anvil"));
        vm.stopBroadcast();
    }
}
