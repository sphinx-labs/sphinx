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
        sphinxConfig.projectName = "test_project";
        sphinxConfig.owners = [0x226F14C3e19788934Ff37C653Cf5e24caD198341];
        sphinxConfig.threshold = 1;
        sphinxConfig.testnets = [
            Network.sepolia,
            Network.arbitrum_sepolia,
            Network.optimism_sepolia,
            Network.avalanche_fuji,
            Network.polygon_mumbai,
            Network.fantom_testnet,
            Network.bnb_testnet,
            // Network.gnosis_chiado,
            Network.linea_goerli,
            Network.polygon_zkevm_goerli,
            Network.base_sepolia,
            Network.celo_alfajores,
            // Network.moonbase_alpha,
            Network.evmos_testnet,
            Network.kava_testnet,
            Network.scroll_sepolia,
            Network.zora_sepolia,
            Network.rari_sepolia
        ];
        sphinxConfig.mainnets = [Network.ethereum, Network.arbitrum];
        sphinxConfig.orgId = "clo6byksj0001cbld6lelntej";
        sphinxConfig.saltNonce = 2132412;
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
