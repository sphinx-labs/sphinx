// // SPDX-License-Identifier: MIT
// pragma solidity >=0.7.4 <0.9.0;

// import { ChugSplashTasks } from "./ChugSplashTasks.sol";

// contract Propose is ChugSplashTasks {
//     string private network = vm.envString("CHUGSPLASH_INTERNAL_NETWORK");
//     string private configPath = vm.envString("CHUGSPLASH_INTERNAL_CONFIG_PATH");
//     bool private isSilent = vm.envBool("CHUGSPLASH_INTERNAL_SILENT");

//     function run() public {
//         if (isSilent) silence();

//         string memory rpcUrl = vm.rpcUrl(network);
//         propose(configPath, rpcUrl);
//     }
// }
