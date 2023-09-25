// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {SphinxClient, SphinxConfig } from "../contracts/SphinxClient.sol";
import { MyContract1Client } from "../contracts/MyContractsClient.sol";
import { Version } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../contracts/test/MyContracts.sol";

// TODO: we should probably prevent users from doing `vm.broadcast` and `vm.prank` immediately
// before calling `deploy`. potentially vm.startPrank too. instead, they should do
// `vm.startBroadcast` because we may always perform more than one transaction in the `deploy`
// function.

// TODO(test): you should use `vm.createSelectFork` in one of your tests for the solidity
// config.

// TODO(test): what happens if you startBroadcast with a public key, not private key, on anvil?

    // TODO(md): consider changing the readme so that it focuses on the local deployment experience
    // first, then talks about the devops platform next.

    // TODO: you should probably require that the user define the owners, proposers etc via
    // inheritance. actually, read the next todo before you do that.

  // TODO: i don't think the mainnets and testnets arrays serve any purpose for the deploy task.

contract CounterScript is Script, SphinxClient {

    string projectName = 'My Project';
    address[] owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
    Version version = Version({major: 0, minor: 2, patch: 4});
    // don't need for deploy task:
    address[] proposers;
    Network[] mainnets;
    Network[] testnets;
    uint256 threshold = 1;
    string orgId;

    constructor() SphinxClient(SphinxConfig({
        projectName: projectName,
        owners: owners,
        proposers: proposers,
        mainnets: mainnets,
        testnets: testnets,
        threshold: threshold,
        version: version,
        orgId: ""
    })) {}

    function deploy(Network _network) public override sphinxDeploy(_network) {
        MyContract1Client myContract1 = deployMyContract1(-1, 2, address(1), address(2));
        myContract1.incrementUint();
        myContract1.incrementUint();
        myContract1.incrementUint();
    }

    function run() public {
        vm.startBroadcast(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        deploy(Network.anvil);
        vm.stopBroadcast();
        MyContract1 ct = MyContract1(0x381dE02fE95ad4aDca4a9ee3c83a27d9162E4903);
        console.log(ct.uintArg());

        // vm.startBroadcast(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        // deploy(Network.anvil, vm.rpcUrl('anvil'));
        // vm.stopBroadcast();
        // console.log(myContract1.uintArg());
    }
}
