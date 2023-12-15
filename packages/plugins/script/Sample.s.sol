// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "sphinx-forge-std/Script.sol";
import {Sphinx} from "../contracts/foundry/Sphinx.sol";
import {Network, Label} from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import {MyContract1} from "../contracts/test/MyContracts.sol";
import {CREATE3} from "solady/utils/CREATE3.sol";

contract Sample is Sphinx {
    MyContract1 myContract;

// TODO: undo entire file

    function setUp() public {
        sphinxConfig.projectName = "11/10";
        sphinxConfig.owners = [0x1A3DAA6F487A480c1aD312b90FD0244871940b66];
        sphinxConfig.threshold = 1;
        sphinxConfig.testnets = [Network.sepolia];
        sphinxConfig.mainnets = [Network.ethereum, Network.arbitrum];
        sphinxConfig.orgId = "clo6byksj0001cbld6lelntej";
        sphinxConfig.saltNonce = 0;
    }

    function run() public override sphinx {
        new MyContract1{ salt: bytes32(uint(1123213)) }(
            -1,
            2,
            address(1),
            address(2)
        );
        new MyContract1{ salt: bytes32(uint(212323)) }(
            -1,
            2,
            address(1),
            address(2)
        );
        new MyContract1{ salt: bytes32(uint(32133)) }(
            -1,
            2,
            address(1),
            address(2)
        );

        // bytes memory initCode =
        //     abi.encodePacked(type(MyContract1).creationCode, abi.encode(1, 2, address(1), address(2)));
        // address deployed = CREATE3.deploy(bytes32(0), initCode, 0);
        // sphinxLabel(deployed, "contracts/test/MyContracts.sol:MyContract1");
    }
}
