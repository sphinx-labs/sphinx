// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {SphinxClient, SphinxConfig, Version } from "../SphinxClient/SphinxClient.sol";
import { MyContract1Client } from "../SphinxClient/MyContracts.SphinxClient.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../contracts/test/MyContracts.sol";

// TODO(test): you should use `vm.createSelectFork` in one of your tests for the solidity
// config.

// TODO(test): what happens if you startBroadcast with a public key, not private key, on anvil?

    // TODO(md): consider changing the readme so that it focuses on the local deployment experience
    // first, then talks about the devops platform next.


contract MyScript is Script, SphinxClient {

    string projectName = '9/29';
    address[] owners = [0x9fd58Bf0F2E6125Ffb0CBFa9AE91893Dbc1D5c51];
    Version version = Version({major: 0, minor: 2, patch: 5});
    // TODO: we may not need the following fields for the deploy task. in the spirit of keeping the
    // local deployment experience as simple as possible, we may want to consider allowing
    // users to omit them.
    address[] proposers = [0x9fd58Bf0F2E6125Ffb0CBFa9AE91893Dbc1D5c51];
    Network[] mainnets;
    Network[] testnets = [Network.goerli, Network.arbitrum_goerli];
    uint256 threshold = 1;
    string orgId = "clm3tz4xi00009xcb0yky8aix";

    constructor() SphinxClient(SphinxConfig({
        projectName: projectName,
        owners: owners,
        proposers: proposers,
        mainnets: mainnets,
        testnets: testnets,
        threshold: threshold,
        version: version,
        orgId: orgId
    })) {}

    function deploy(Network _network) public override sphinxDeploy(_network) {
        MyContract1Client myContract1 = deployMyContract1(-1, 2, address(1), address(2));
        myContract1.incrementUint();
        myContract1.incrementUint();
        myContract1.incrementUint();
    }

    function run() public {
        // vm.startBroadcast(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        deploy(Network.anvil);
        // vm.stopBroadcast();
        MyContract1 ct = MyContract1(0x381dE02fE95ad4aDca4a9ee3c83a27d9162E4903);
        console.log(ct.uintArg());

        // vm.startBroadcast(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        // deploy(Network.anvil, vm.rpcUrl('anvil'));
        // vm.stopBroadcast();
        // console.log(myContract1.uintArg());
    }
}
