// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Script, console } from "sphinx-forge-std/Script.sol";
import { Sphinx } from "../contracts/foundry/Sphinx.sol";
import { SphinxConfig, Version } from "../client/SphinxClient.sol";
import { Network, Label } from "../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../contracts/test/MyContracts.sol";
import { CREATE3 } from "solady/utils/CREATE3.sol";

contract Sample is Sphinx {

    MyContract1 myContract;

    function setUp() public {
        sphinxConfig.projectName = "My Project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
        sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.testnets = [Network.goerli, Network.arbitrum_goerli];
        sphinxConfig.orgId = "asdf";
    }

    function run() public override sphinx {
        new MyContract1{ salt: bytes32(uint(1)) }(
            -1,
            2,
            address(1),
            address(2)
        );
        new MyContract1{ salt: bytes32(uint(2)) }(
            -1,
            2,
            address(1),
            address(2)
        );
        new MyContract1{ salt: bytes32(uint(3)) }(
            -1,
            2,
            address(1),
            address(2)
        );

        bytes memory initCode = abi.encodePacked(type(MyContract1).creationCode, abi.encode(1, 2, address(1), address(2)));
        address deployed = CREATE3.deploy(bytes32(0), initCode, 0);
        sphinxLabel(deployed, "contracts/test/MyContracts.sol:MyContract1");
    }
}
