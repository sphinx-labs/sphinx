// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { MyContract1, MyContract2 } from "../../../contracts/test/MyContracts.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";

contract Simple1 is Script, Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
        sphinxConfig.mainnets = ["ethereum", "optimism_mainnet"];
    }

    function run() public sphinx {
        MyContract2 myContract;
        Network network = getSphinxNetwork(block.chainid);
        if (network == Network.ethereum || network == Network.sepolia) {
            myContract = new MyContract2{ salt: 0 }();
        } else if (network == Network.optimism) {
            myContract = new MyContract2{ salt: bytes32(uint(1)) }();
        }
        myContract.incrementMyContract2(2);
    }
}

contract Simple2 is Script, Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }

    function run() public sphinx {
        new MyContract2{ salt: bytes32(uint(2)) }();
    }
}

contract Simple3 is Script, Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }

    function run() public sphinx {
        MyContract2 myContract = new MyContract2();
        myContract.incrementMyContract2(2);
    }
}
