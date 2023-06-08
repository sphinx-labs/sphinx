// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@chugsplash/contracts/ChugSplash.sol";

contract ChugSplashTest is ChugSplash {

    function setUp() public {
        deploy(deployConfig, vm.rpcUrl("anvil"));
    }
}
