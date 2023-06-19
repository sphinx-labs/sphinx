// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

// import { ChugSplash } from "../contracts/foundry/ChugSplash.sol";
import { ChugSplashDeploy } from "../contracts/foundry/ChugSplashDeploy.sol";
import "forge-std/Script.sol";

contract ChugSplashScript is ChugSplashDeploy, Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        deploy("./chugsplash/Storage.config.ts", vm.rpcUrl("anvil"));
        vm.stopBroadcast();

    }
}
