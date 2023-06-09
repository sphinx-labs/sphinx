// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ChugSplash } from "../../foundry-contracts/ChugSplash.sol";
import { SimpleStorage } from "../../contracts/SimpleStorage.sol";
import { Storage } from "../../contracts/Storage.sol";
import { ComplexConstructorArgs } from "../../contracts/ComplexConstructorArgs.sol";
import { Stateless } from "../../contracts/Stateless.sol";

contract ChugSplashScript is ChugSplash {
    function run() public {
        deploy("./chugsplash/foundry/deploy.t.js", vm.rpcUrl("anvil"));
    }
}
