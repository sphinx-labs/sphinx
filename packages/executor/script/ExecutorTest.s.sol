// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Script } from "forge-std/Script.sol";
import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { ExecutorTest } from "../contracts/ExecutorTest.sol";
import { Sphinx } from "@sphinx-labs/plugins/Sphinx.sol";

contract ExecutorTest_Script is Script, Sphinx {
    constructor() {
        sphinxConfig.projectName = "Executor Test";
        sphinxConfig.owners = [0x70997970C51812dc3A010C7d01b50e0d17dc79C8];
        sphinxConfig.threshold = 1;
        sphinxConfig.testnets = [Network.optimism_goerli];
        sphinxConfig.proposers = [0x70997970C51812dc3A010C7d01b50e0d17dc79C8];
        sphinxConfig.orgId = '12345';
    }

    function run() public override sphinx {
        new ExecutorTest{ salt: 0 }(42);
    }
}
