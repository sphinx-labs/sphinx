// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { MyContract1, MyContract2 } from "../../../contracts/test/MyContracts.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";

contract Simple1 is Script, Sphinx {
    constructor() {
        sphinxConfig.projectName = "Simple_Project_1";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        sphinxConfig.mainnets = [Network.ethereum, Network.optimism];
        sphinxConfig.testnets = [Network.sepolia];
        sphinxConfig.orgId = "test-org-id";
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
    constructor() {
        sphinxConfig.projectName = "Simple_Project_2";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        sphinxConfig.testnets = [Network.sepolia];
        sphinxConfig.orgId = "test-org-id";
    }

    function run() public sphinx {
        new MyContract2{ salt: bytes32(uint(2)) }();
    }
}
