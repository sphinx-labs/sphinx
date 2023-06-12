// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ChugSplash } from "../contracts/foundry/ChugSplash.sol";
import { SimpleStorage } from "../contracts/test/SimpleStorage.sol";
import { Storage } from "../contracts/test/Storage.sol";
import { ComplexConstructorArgs } from "../contracts/test/ComplexConstructorArgs.sol";
import { Stateless } from "../contracts/test/Stateless.sol";

contract ChugSplashScript is ChugSplash {
    function run() public {
        // ensureChugSplashInitialized(vm.rpcUrl("anvil"));

        deploy("./chugsplash/Storage.consfig.ts", vm.rpcUrl("anvil"));
    }
}
