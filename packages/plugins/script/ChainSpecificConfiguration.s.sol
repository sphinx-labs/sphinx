// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {
    SphinxConfig,
    Network,
    DeployOptions,
    DefineOptions,
    Version
} from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxClient } from "../client/SphinxClient.sol";
import { AllNetworks, OnlyArbitrum } from "../contracts/test/ChainSpecific.sol";
import {
    AllNetworksClient,
    OnlyArbitrumClient
} from "../client/ChainSpecific.c.sol";

/**
 * @title ChainSpecificConfiguration
 * @dev Configuration script testing a more complex multi-network configurations.
 *      See ChainSpecificConfiguration.t.sol for corresponding tests.
 * Tests:
 *      - Deploying a contract to all networks with a different address on each network
 *      - Calling a function with a different value on each network
 *      - Deploying a contract on a specific network
 *      - Calling a function on a specific network
 */
contract ChainSpecificConfiguration is SphinxClient {
    AllNetworks allNetworks;
    OnlyArbitrum onlyArbitrum;

    mapping(Network => address) public chainSpecificAddresses;
    mapping(Network => uint) public chainSpecificFee;

    constructor() {
        sphinxConfig.projectName = "ChainSpecific";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.mainnets = [Network.ethereum, Network.optimism, Network.arbitrum];
        sphinxConfig.testnets = [Network.goerli, Network.optimism_goerli, Network.arbitrum_goerli];
        sphinxConfig.threshold = 1;
    }

    function setupVariables() internal {
        chainSpecificAddresses[Network.ethereum] = address(1);
        chainSpecificAddresses[Network.optimism] = address(2);
        chainSpecificAddresses[Network.arbitrum] = address(3);
        chainSpecificAddresses[Network.goerli] = address(4);
        chainSpecificAddresses[Network.optimism_goerli] = address(5);
        chainSpecificAddresses[Network.arbitrum_goerli] = address(6);

        chainSpecificFee[Network.ethereum] = 1;
        chainSpecificFee[Network.optimism] = 2;
        chainSpecificFee[Network.arbitrum] = 3;
        chainSpecificFee[Network.goerli] = 4;
        chainSpecificFee[Network.optimism_goerli] = 5;
        chainSpecificFee[Network.arbitrum_goerli] = 6;
    }

    function deploy(Network _network) public override sphinx(_network) {
        setupVariables();

        AllNetworksClient allNetworksClient = deployAllNetworks(chainSpecificAddresses[_network]);
        allNetworksClient.setFee(chainSpecificFee[_network]);
        allNetworks = AllNetworks(address(allNetworksClient));

        if (_network == Network.arbitrum || _network == Network.arbitrum_goerli) {
            OnlyArbitrumClient onlyArbitrumClient = deployOnlyArbitrum(0);
            onlyArbitrumClient.increment();
            onlyArbitrumClient.increment();
            onlyArbitrum = OnlyArbitrum(address(onlyArbitrumClient));
        }
    }
}
