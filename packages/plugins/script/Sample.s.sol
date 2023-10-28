// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Script, console } from "sphinx-forge-std/Script.sol";
import { SphinxClient, SphinxConfig, Version } from "../client/SphinxClient.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../contracts/test/MyContracts.sol";

contract Sample is Script, SphinxClient {

    MyContract1 myContract;

    function setUp() public {
        sphinxConfig.projectName = "10/27";
        sphinxConfig.owners = [0x9fd58Bf0F2E6125Ffb0CBFa9AE91893Dbc1D5c51];
        sphinxConfig.threshold = 1;
        sphinxConfig.proposers = [0x9fd58Bf0F2E6125Ffb0CBFa9AE91893Dbc1D5c51];
        sphinxConfig.testnets = [
            Network.goerli,
            Network.arbitrum_goerli,
            Network.base_goerli,
            Network.optimism_goerli,
            Network.polygon_mumbai
        ];
        sphinxConfig.orgId = "clkskjg9t0000zjcb1lri0nvr";
    }

    function run() public override sphinx {
        MyContract1 myClient = deployMyContract1(
            -1,
            2,
            address(1),
            address(2)
        );
        MyContract1.MyStruct memory myStruct = myClient.myPureFunction();
        myClient.set(myStruct.a);
        myClient.incrementUint();
        myClient.incrementUint();
        myClient.incrementUint();

        myContract = MyContract1(address(myClient));
        console.logInt(myContract.intArg());
    }
}
