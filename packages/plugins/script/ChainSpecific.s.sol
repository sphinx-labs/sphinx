// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Vm } from "sphinx-forge-std/Vm.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import {
    SphinxConfig,
    Network,
    DeployOptions,
    Version
} from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxUtils } from "@sphinx-labs/plugins/SphinxUtils.sol";
import { SphinxClient } from "../client/SphinxClient.sol";
import { AllNetworks, OnlyArbitrum, OnlyOptimism } from "../contracts/test/ChainSpecific.sol";
import { SphinxTestUtils } from "../contracts/test/SphinxTestUtils.sol";

/**
 * @dev A script meant to be inherited by test contracts in order to test multi-chain deployments
 *      that differ between networks. See AbstractChainSpecific.t.sol for corresponding tests.
 */
contract ChainSpecific is SphinxClient, SphinxTestUtils {

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

    function run() public override virtual sphinx {
        setupVariables();

        allNetworks = deployAllNetworks(chainSpecificConstructorArgs[getNetwork(block.chainid)], address(manager));
        allNetworks.setFee(chainSpecificFee[getNetwork(block.chainid)]);
        uint256 fee = allNetworks.feeToAdd();
        allNetworks.incrementFee(fee);
        allNetworks.transferOwnership(finalOwner);

        if (getNetwork(block.chainid) == Network.arbitrum) {
            onlyArbitrum = deployOnlyArbitrum();
            onlyArbitrum.increment();
            onlyArbitrum.increment();
        } else if (getNetwork(block.chainid) == Network.arbitrum_goerli) {
            onlyArbitrumGoerliOne = deployOnlyArbitrum(DeployOptions({salt: bytes32(uint(1)), referenceName: "OnlyArbitrumGoerliOne"}));
            onlyArbitrumGoerliOne.decrement();
            onlyArbitrumGoerliOne.decrement();
            onlyArbitrumGoerliTwo = deployOnlyArbitrum(DeployOptions({salt: bytes32(uint(2)), referenceName: "OnlyArbitrumGoerliTwo"}));
        }

        if (getNetwork(block.chainid) == Network.optimism_goerli) {
            onlyOptimismGoerli = OnlyOptimism(onlyOptimismGoerli);
            onlyOptimismGoerli.incrementTwice();
            onlyOptimismGoerli.incrementTwice();
        } else if (getNetwork(block.chainid) == Network.optimism) {
            onlyOptimism = OnlyOptimism(onlyOptimism);
            onlyOptimism.decrementTwice();
            onlyOptimism.decrementTwice();
        }
    }
}
