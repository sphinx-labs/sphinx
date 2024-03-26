// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { MyLargeContract } from "../../../contracts/test/MyContracts.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";

contract Simple is Script, Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "test_project";
        sphinxConfig.owners = [0x4856e043a1F2CAA8aCEfd076328b4981Aca91000];
        sphinxConfig.threshold = 1;
        sphinxConfig.orgId = "clksrkg1v0001l00815670lu8";
        sphinxConfig.saltNonce = 213222412;
        sphinxConfig.testnets = [
            'sepolia',
            // 'arbitrum_sepolia',
            // 'bnb_testnet',
            // 'linea_goerli',
            // 'avalanche_fuji',
            // 'base_sepolia',
            'moonbase_alpha',
            // 'kava_testnet',
            'rootstock_testnet',
            // 'rari_sepolia',
            'optimism_sepolia'
            // 'polygon_mumbai',
            // 'gnosis_chiado',
            // 'polygon_zkevm_goerli',
            // 'fantom_testnet',
            // 'celo_alfajores',
            // 'evmos_testnet',
            // 'scroll_sepolia',
            // 'zora_sepolia',
            // 'blast_sepolia'
        ];
    }

    function deploy(uint256 _numDeployments) public sphinx {
        for (uint256 i = 0; i < _numDeployments; i++) {
            new MyLargeContract{ salt: bytes32(i) }();
        }
    }
}
