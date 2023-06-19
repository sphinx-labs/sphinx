// // SPDX-License-Identifier: MIT
// pragma solidity >=0.6.2 <0.9.0;

// import { ChugSplash } from "./ChugSplash.sol";

// contract Propose is ChugSplash {
//     string private network = vm.envString("CHUGSPLASH_INTERNAL_NETWORK");
//     string private configPath = vm.envString("CHUGSPLASH_INTERNAL_CONFIG_PATH");
//     bool private silent = vm.envBool("CHUGSPLASH_INTERNAL_SILENT");

//     function run() public {
//         if (silent) silence();

//         string memory rpcUrl = vm.rpcUrl(network);
//         propose(configPath, rpcUrl);
//     }
// }
