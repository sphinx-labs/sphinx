// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import { CREATE3 } from "solady/utils/CREATE3.sol";
import { Owned } from "./Owned.sol";

contract CHU676 is Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "CHU-676";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
        sphinxConfig.orgId = "test-org-id";
    }

    function run() public sphinx {
        address module = sphinxModule();
        new Owned{ salt: 0 }(module);
    }
}

