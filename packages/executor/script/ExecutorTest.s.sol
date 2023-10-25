// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Script } from "forge-std/Script.sol";
import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxClient } from "../client/SphinxClient.sol";

contract ExecutorTest_Script is Script, SphinxClient {
    constructor() {
        sphinxConfig.projectName = "Executor Test";
        sphinxConfig.owners = [0x70997970C51812dc3A010C7d01b50e0d17dc79C8];
        sphinxConfig.threshold = 1;
    }

    function run() public override sphinx {
        deployExecutorTest(42);
    }
}
