// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Script, console } from "forge-std/Script.sol";
import { SphinxClient, SphinxConfig, Version } from "../client/SphinxClient.sol";
import { MyContract1Client } from "../client/MyContracts.c.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../contracts/test/MyContracts.sol";

// TODO(md): consider changing the readme so that it focuses on the local deployment experience
// first, then talks about the devops platform next.

contract Sample is Script, SphinxClient {
    constructor() {
        sphinxConfig.projectName = "My Project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
        sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.testnets = [Network.goerli, Network.arbitrum_goerli];
        sphinxConfig.orgId = "asdf";
    }

    function deploy(Network _network) public override sphinx(_network) {
        MyContract1Client myContract1 = deployMyContract1(
            -1,
            2,
            address(1),
            address(2)
        );
        myContract1.incrementUint();
        myContract1.incrementUint();
        myContract1.incrementUint();

        console.log("MyContract1:", address(myContract1));
    }

    function run() public {
        deploy(Network.anvil);
    }
}
