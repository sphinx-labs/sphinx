// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import { CREATE3 } from "solady/utils/CREATE3.sol";
import { Owned } from "./Owned.sol";

contract CHU676 is Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }

    function run() public sphinx {
        address module = sphinxModule();
        new Owned{ salt: 0 }(module);
    }
}

