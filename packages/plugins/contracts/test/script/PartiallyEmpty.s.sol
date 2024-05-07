// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { MyContract2 } from "../../../contracts/test/MyContracts.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";

contract PartiallyEmpty is Script, Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }

    function run() public sphinx {
        // Deploy a contract on Ethereum and don't deploy anything on Optimism.
        if (block.chainid == 1) {
            new MyContract2{ salt: 0 }();
        }
    }
}
