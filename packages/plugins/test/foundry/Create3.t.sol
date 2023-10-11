// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import { Script } from "forge-std/Script.sol";
import { Test } from "forge-std/Test.sol";
import { SphinxClient, SphinxConfig, Version } from "../../client/SphinxClient.sol";
import { StatelessClient } from "../../client/Stateless.c.sol";
import { Stateless } from "../../contracts/test/Stateless.sol";
import { Network, DeployOptions } from "../../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../../contracts/test/MyContracts.sol";

contract Create3_Script is Script, SphinxClient {
    StatelessClient clientNoSalt;
    StatelessClient clientWithSalt;

    constructor() {
        sphinxConfig.projectName = "Create3";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
    }

    function deploy(Network _network) public override sphinx(_network) {
        clientNoSalt = deployStateless(1, address(1), Version(0, 0, 0));
        clientWithSalt = deployStateless(
            2,
            address(2),
            Version(0, 0, 0),
            DeployOptions({ salt: bytes32(uint(1)), referenceName: "StatelessWithSalt" })
        );
    }
}

contract Create3_Test is Create3_Script, Test {
    Stateless statelessNoSalt;
    Stateless statelessWithSalt;

    function setUp() external {
        deploy(Network.anvil);

        statelessNoSalt = Stateless(address(clientNoSalt));
        statelessWithSalt = Stateless(address(clientWithSalt));
    }

    function test_deploy_success() external {
        assertGt(address(statelessNoSalt).code.length, 0);
        assertEq(statelessNoSalt.immutableUint(), 1);
        assertEq(statelessNoSalt.immutableAddress(), address(1));

        assertGt(address(statelessWithSalt).code.length, 0);
        assertEq(statelessWithSalt.immutableUint(), 2);
        assertEq(statelessWithSalt.immutableAddress(), address(2));
    }

    function test_has_different_create3_address() external {
        assertTrue(address(statelessNoSalt) != address(statelessWithSalt));
    }
}
