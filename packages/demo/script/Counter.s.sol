// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Script.sol";
import "chugsplash/ChugSplash.sol";

contract ChugSplashScript is Script {
    function run() public {
        // Create a ChugSplash instance
        ChugSplash chugsplash = new ChugSplash();

        // Define the path from the project root to your ChugSplash config file.
        string memory chugsplashFilePath = "./chugsplash/hello-chugsplash.json";

        // Deploy all contracts in your ChugSplash config file (in this case, just HelloChugSplash.sol)
        chugsplash.deploy(chugsplashFilePath);
    }
}

// import "forge-std/Script.sol";
// import "../contracts/Counter.sol";

// contract CounterScript is Script {
//     function setUp() public {}

//     function run() public {
//         vm.startBroadcast();

//         new Counter();

//         vm.stopBroadcast();
//     }
// }
