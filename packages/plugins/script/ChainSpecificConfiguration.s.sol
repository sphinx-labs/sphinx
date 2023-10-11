// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {
    SphinxConfig,
    Network,
    DeployOptions,
    DefineOptions,
    Version
} from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxClient } from "../SphinxClient/SphinxClient.sol";
import { AllNetworks, OnlyArbitrum, OnlyOptimism } from "../contracts/test/ChainSpecific.sol";
import {
    AllNetworksClient,
    OnlyArbitrumClient,
    OnlyOptimismClient
} from "../SphinxClient/ChainSpecific.c.sol";

/**
 * @title ChainSpecificConfiguration
 * @dev Configuration script testing a more complex multi-network deployment.
 *      TODO(docs): See ChainSpecificConfiguration.t.sol for corresponding tests.
 * Tests:
 *      - Deploying a contract to all networks with a different constructor arg on each network
 *      - Calling a function with a different value on each network
 *      - Deploying a contract on a specific network, with and without `DeployOptions`
 *      - Defining a previously deployed contract on a specific network, with and without
          `DefineOptions`
 *      - Calling functions on specific networks
 */
contract ChainSpecificConfiguration is SphinxClient {
    AllNetworks allNetworks;
    OnlyArbitrum onlyArbitrum;
    OnlyArbitrum onlyArbitrumGoerliOne;
    OnlyArbitrum onlyArbitrumGoerliTwo;
    OnlyOptimism onlyOptimism = OnlyOptimism(address(256));
    OnlyOptimism onlyOptimismGoerli = onlyOptimism;

    mapping(Network => address) public chainSpecificConstructorArgs;
    mapping(Network => uint) public chainSpecificFee;

    constructor() {
        sphinxConfig.projectName = "ChainSpecific";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.mainnets = [Network.ethereum, Network.optimism, Network.arbitrum];
        sphinxConfig.testnets = [Network.goerli, Network.optimism_goerli, Network.arbitrum_goerli];
        sphinxConfig.threshold = 1;
    }

    function setupVariables() internal {
        chainSpecificConstructorArgs[Network.ethereum] = address(1);
        chainSpecificConstructorArgs[Network.optimism] = address(2);
        chainSpecificConstructorArgs[Network.arbitrum] = address(3);
        chainSpecificConstructorArgs[Network.goerli] = address(4);
        chainSpecificConstructorArgs[Network.optimism_goerli] = address(5);
        chainSpecificConstructorArgs[Network.arbitrum_goerli] = address(6);

        chainSpecificFee[Network.ethereum] = 1;
        chainSpecificFee[Network.optimism] = 2;
        chainSpecificFee[Network.arbitrum] = 3;
        chainSpecificFee[Network.goerli] = 4;
        chainSpecificFee[Network.optimism_goerli] = 5;
        chainSpecificFee[Network.arbitrum_goerli] = 6;

        // TODO(docs): these need to be defined regardless of what network we're executing the
        // deployment on. if we don't do this, e.g. the arbitrum-specific contracts won't be
        // assigned on any chain besides arbitrum.
        allNetworks = AllNetworks(sphinxUtils.getAddress(
            sphinxConfig, "AllNetworks"
        ));
        onlyArbitrum = OnlyArbitrum(sphinxUtils.getAddress(
            sphinxConfig, "OnlyArbitrum"
        ));
        onlyArbitrumGoerliOne = OnlyArbitrum(sphinxUtils.getAddress(
            sphinxConfig, "OnlyArbitrumGoerliOne", bytes32(uint(1))
        ));
        onlyArbitrumGoerliTwo = OnlyArbitrum(sphinxUtils.getAddress(
            sphinxConfig, "OnlyArbitrumGoerliTwo", bytes32(uint(2))
        ));
    }

    function deploy(Network _network) public override virtual sphinx(_network) {
        setupVariables();

        AllNetworksClient allNetworksClient = deployAllNetworks(chainSpecificConstructorArgs[_network]);
        allNetworksClient.setFee(chainSpecificFee[_network]);
        allNetworks = AllNetworks(address(allNetworksClient));

        if (_network == Network.arbitrum) {
            OnlyArbitrumClient onlyArbitrumClient = deployOnlyArbitrum(0);
            onlyArbitrumClient.increment();
            onlyArbitrumClient.increment();
            onlyArbitrum = OnlyArbitrum(address(onlyArbitrumClient));
        } else if (_network == Network.arbitrum_goerli) {
            OnlyArbitrumClient onlyArbitrumGoerliClientOne = deployOnlyArbitrum(10, DeployOptions({salt: bytes32(uint(1)), referenceName: "OnlyArbitrumGoerliOne"}));
            onlyArbitrumGoerliClientOne.decrement();
            onlyArbitrumGoerliClientOne.decrement();
            OnlyArbitrumClient onlyArbitrumGoerliClientTwo = deployOnlyArbitrum(20, DeployOptions({salt: bytes32(uint(2)), referenceName: "OnlyArbitrumGoerliTwo"}));
            onlyArbitrumGoerliOne = OnlyArbitrum(address(onlyArbitrumGoerliClientOne));
            onlyArbitrumGoerliTwo = OnlyArbitrum(address(onlyArbitrumGoerliClientTwo));
        }

        if (_network == Network.optimism_goerli) {
            OnlyOptimismClient onlyOptimismGoerliClient = defineOnlyOptimism(address(onlyOptimismGoerli));
            onlyOptimismGoerliClient.incrementTwice();
            onlyOptimismGoerliClient.incrementTwice();
        } else if (_network == Network.optimism) {
            OnlyOptimismClient onlyOptimismClient = defineOnlyOptimism(address(onlyOptimism), DefineOptions({ referenceName: "OnlyOptimismMainnet"} ));
            onlyOptimismClient.decrementTwice();
            onlyOptimismClient.decrementTwice();
            onlyOptimism = OnlyOptimism(address(onlyOptimismClient));
        }
    }
}
