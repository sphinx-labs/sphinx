// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Script, console } from "forge-std/Script.sol";
import { SphinxClient, SphinxConfig, Version } from "../client/SphinxClient.sol";
import { MyContract1Client } from "../client/MyContracts.c.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../contracts/test/MyContracts.sol";

// TODO(test): you should use `vm.createSelectFork` in one of your tests for the solidity
// config.

// TODO(test): what happens if you startBroadcast with a public key, not private key, on anvil?

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
        myContract1.incrementUint();
        myContract1.incrementUint();
    }

    function run() public {
        // vm.startBroadcast(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        MyContract1 ct = MyContract1(0x381dE02fE95ad4aDca4a9ee3c83a27d9162E4903);

        vm.createSelectFork(sphinxUtils.getNetworkInfo(Network.goerli).name);
        vm.startBroadcast(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        deploy(Network.goerli);
        console.log(block.chainid);
        console.log(ct.uintArg());
        vm.stopBroadcast();

        vm.startBroadcast(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        vm.createSelectFork(sphinxUtils.getNetworkInfo(Network.optimism_goerli).name);
        deploy(Network.optimism_goerli);
        console.log(ct.uintArg());
        vm.stopBroadcast();
    }
}
