// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { MyLargeContract } from "../../../contracts/test/MyContracts.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";

contract Simple is Script, Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }

    function deploy(uint256 _numDeployments) public sphinx {
        for (uint256 i = 0; i < _numDeployments; i++) {
            new MyLargeContract{ salt: bytes32(i) }();
        }
    }
}
