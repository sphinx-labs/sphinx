// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "sphinx-forge-std/Script.sol";
import {Sphinx} from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import {Network} from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import {MyContract1} from "../contracts/test/MyContracts.sol";
import {CREATE3} from "solady/utils/CREATE3.sol";

contract Sample is Sphinx {
    MyContract1 myContract;

    function setUp() public {
        sphinxConfig.projectName = "test_projecddddt";
        sphinxConfig.owners = [0x4856e043a1F2CAA8aCEfd076328b4981Aca91000];
        sphinxConfig.threshold = 1;
        sphinxConfig.testnets = [
            Network.sepolia
            // Network.optimism_sepolia,
            // Network.arbitrum_sepolia,
            // Network.bnb_testnet,
            // Network.gnosis_chiado,
            // Network.linea_goerli,
            // Network.polygon_zkevm_goerli,
            // Network.fantom_testnet,
            // Network.base_sepolia
        ];
        sphinxConfig.mainnets = [Network.ethereum, Network.arbitrum];
        sphinxConfig.orgId = "clksrkg1v0001l00815670lu8";
        sphinxConfig.saltNonce = 943049830843984;
    }

    function run() public sphinx {
        new MyContract1(
            -1,
            2,
            address(1),
            address(2)
        );
        new MyContract1(
            -1,
            2,
            address(1),
            address(2)
        );
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));
        new MyContract1(-1,2,address(1),address(2));

        // bytes memory initCode =
        //     abi.encodePacked(type(MyContract1).creationCode, abi.encode(1, 2, address(1), address(2)));
        // CREATE3.deploy(bytes32(0), initCode, 0);
    }
}
