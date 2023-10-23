// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Script, console } from "sphinx-forge-std/Script.sol";
import { SphinxClient, SphinxConfig, Version } from "../client/SphinxClient.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../contracts/test/MyContracts.sol";

contract Sample is Script, SphinxClient {

    MyContract1 myContract;

    function setUp() public {
        sphinxConfig.projectName = "My Project";
        sphinxConfig.owners = [0x9fd58Bf0F2E6125Ffb0CBFa9AE91893Dbc1D5c51];
        sphinxConfig.threshold = 1;
        sphinxConfig.proposers = [0x9fd58Bf0F2E6125Ffb0CBFa9AE91893Dbc1D5c51];
        sphinxConfig.testnets = [
            Network.optimism_goerli,
            Network.goerli,
            Network.arbitrum_goerli,
            Network.bnb_testnet,
            Network.linea_goerli,
            Network.polygon_mumbai,
            Network.polygon_zkevm_goerli,
            Network.gnosis_chiado,
            Network.base_goerli,
            Network.avalanche_fuji,
            Network.fantom_testnet
        ];
        sphinxConfig.orgId = "clo1oz1dl00009m6hcvop9wc1";
    }

    function deploy(Network _network) public override sphinx(_network) {
        myContract = deployMyContract1(
            -1,
            2,
            address(1),
            address(2)
        );
        MyContract1.MyStruct memory myStruct = myContract.myPureFunction();
        console.logInt(myStruct.a);
        myContract.set(myStruct.a);
        myContract.incrementUint();
        myContract.incrementUint();
        myContract.incrementUint();
    }

    function run() public {
        deploy(Network.anvil);
        console.logInt(myContract.intArg());
    }
}
