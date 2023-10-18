// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Vm } from "sphinx-forge-std/Vm.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import {
    SphinxConfig,
    Network,
    DeployOptions,
    DefineOptions,
    Version
} from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxUtils } from "@sphinx-labs/plugins/SphinxUtils.sol";
import { SphinxClient } from "../client/SphinxClient.sol";
import { AllNetworks, OnlyArbitrum, OnlyOptimism } from "../contracts/test/ChainSpecific.sol";
import {
    AllNetworksClient,
    OnlyArbitrumClient,
    OnlyOptimismClient
} from "../client/ChainSpecific.c.sol";

/**
 * @dev A script meant to be inherited by test contracts in order to test multi-chain deployments
 *      that differ between networks. See AbstractChainSpecific.t.sol for corresponding tests.
 */
contract ChainSpecific is SphinxClient {

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address finalOwner = address(0x200);

    SphinxUtils sphinxUtils;
    ISphinxAuth auth;
    ISphinxManager manager;
    AllNetworks allNetworks;
    OnlyArbitrum onlyArbitrum;
    OnlyArbitrum onlyArbitrumGoerliOne;
    OnlyArbitrum onlyArbitrumGoerliTwo;
    OnlyOptimism onlyOptimism = OnlyOptimism(address(0x100));
    OnlyOptimism onlyOptimismGoerli = onlyOptimism;

    mapping(Network => address) public chainSpecificConstructorArgs;
    mapping(Network => uint) public chainSpecificFee;

    constructor() {
        sphinxConfig.projectName = "ChainSpecific";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.mainnets = [Network.ethereum, Network.optimism, Network.arbitrum];
        sphinxConfig.testnets = [Network.goerli, Network.optimism_goerli, Network.arbitrum_goerli];
        sphinxConfig.threshold = 1;

        sphinxUtils = new SphinxUtils();
        vm.makePersistent(address(sphinxUtils));

        auth = ISphinxAuth(sphinxUtils.getSphinxAuthAddress(
            sphinxConfig
        ));
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

        // Get the addresses of the contracts that will be deployed. These need to be set regardless
        // of what network we're executing the deployment on. If we don't do this, we won't be able
        // to, for example, test that Arbitrum-specific contracts weren't deployed to chains other
        // than Arbitrum. This is because the contracts in the `deploy` function are only assigned
        // for the network that the deployment is being executed on.
        allNetworks = AllNetworks(sphinxAddress(
            sphinxConfig, "AllNetworks"
        ));
        onlyArbitrum = OnlyArbitrum(sphinxAddress(
            sphinxConfig, "OnlyArbitrum"
        ));
        onlyArbitrumGoerliOne = OnlyArbitrum(sphinxAddress(
            sphinxConfig, "OnlyArbitrumGoerliOne", bytes32(uint(1))
        ));
        onlyArbitrumGoerliTwo = OnlyArbitrum(sphinxAddress(
            sphinxConfig, "OnlyArbitrumGoerliTwo", bytes32(uint(2))
        ));

        manager = ISphinxManager(sphinxManager(sphinxConfig));
    }

    function deploy(Network _network) public override virtual sphinx(_network) {
        setupVariables();

        AllNetworksClient allNetworksClient = deployAllNetworks(chainSpecificConstructorArgs[_network], address(manager));
        allNetworksClient.setFee(chainSpecificFee[_network]);
        uint256 fee = allNetworksClient.feeToAdd();
        allNetworksClient.incrementFee(fee);
        allNetworksClient.transferOwnership(finalOwner);
        allNetworks = AllNetworks(address(allNetworksClient));

        if (_network == Network.arbitrum) {
            OnlyArbitrumClient onlyArbitrumClient = deployOnlyArbitrum();
            onlyArbitrumClient.increment();
            onlyArbitrumClient.increment();
            onlyArbitrum = OnlyArbitrum(address(onlyArbitrumClient));
        } else if (_network == Network.arbitrum_goerli) {
            OnlyArbitrumClient onlyArbitrumGoerliClientOne = deployOnlyArbitrum(DeployOptions({salt: bytes32(uint(1)), referenceName: "OnlyArbitrumGoerliOne"}));
            onlyArbitrumGoerliClientOne.decrement();
            onlyArbitrumGoerliClientOne.decrement();
            OnlyArbitrumClient onlyArbitrumGoerliClientTwo = deployOnlyArbitrum(DeployOptions({salt: bytes32(uint(2)), referenceName: "OnlyArbitrumGoerliTwo"}));
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
