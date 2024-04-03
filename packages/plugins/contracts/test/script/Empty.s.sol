// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";

contract Empty is Script, Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }

    function run() public sphinx {}
}
