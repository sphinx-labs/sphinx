// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "sphinx-forge-std/Script.sol";
import {Sphinx} from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import {Network} from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import {MyContract1} from "../contracts/test/MyContracts.sol";
import {CREATE3} from "solady/utils/CREATE3.sol";

contract Sample is Sphinx {
    MyContract1 myContract;

    function configureSphinx() public override {
        sphinxConfig.projectName = "my_sphinx";
        sphinxConfig.testnets = [
            "sepolia",
            "arbitrum_sepolia",
            "optimism_sepolia",
            "avalanche_fuji",
            "polygon_mumbai",
            "fantom_testnet",
            "bnb_testnet",
            "gnosis_chiado",
            "base_sepolia",
            "celo_alfajores",
            "moonbase_alpha",
            "evmos_testnet",
            "kava_testnet",
            "scroll_sepolia",
            "zora_sepolia",
            "rari_sepolia"
        ];
        sphinxConfig.mainnets = ["ethereum", "arbitrum"];
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
        new MyContract1(
            -1,
            2,
            address(1),
            address(2)
        );
    }
}
