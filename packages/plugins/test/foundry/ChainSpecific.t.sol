// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AbstractChainSpecific_Test } from "./AbstractChainSpecific.t.sol";
import { Network } from "../../contracts/foundry/SphinxPluginTypes.sol";

contract ChainSpecificOptimismMainnet_Test is AbstractChainSpecific_Test {

    Network network = Network.optimism;

    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(
            abi.encodePacked("https://opt-mainnet.g.alchemy.com/v2/", alchemyAPIKey)
        );
        vm.createSelectFork(rpcUrl);

        // Sanity check that the chain ID is correct.
        assertEq(block.chainid, sphinxUtils.getNetworkInfo(network).chainId);

        deployCodeTo("ChainSpecific.sol:OnlyOptimism", hex"", address(onlyOptimism));

        deploy(network);
    }

    function testChainSpecificActionsExecuted() external override {
        assertOptimismMainnetActionsExecuted();
    }

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract ChainSpecificOptimismGoerli_Test is AbstractChainSpecific_Test {

    Network network = Network.optimism_goerli;

    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(
            abi.encodePacked("https://opt-goerli.g.alchemy.com/v2/", alchemyAPIKey)
        );
        vm.createSelectFork(rpcUrl);

        // Sanity check that the chain ID is correct.
        assertEq(block.chainid, sphinxUtils.getNetworkInfo(network).chainId);

        deployCodeTo("ChainSpecific.sol:OnlyOptimism", hex"", address(onlyOptimismGoerli));

        deploy(network);
    }

    function testChainSpecificActionsExecuted() external override {
        assertOptimismGoerliActionsExecuted();
    }

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract ChainSpecificEthereum_Test is AbstractChainSpecific_Test {

    Network network = Network.ethereum;

    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(
            abi.encodePacked("https://eth-mainnet.g.alchemy.com/v2/", alchemyAPIKey)
        );
        vm.createSelectFork(rpcUrl);

        // Sanity check that the chain ID is correct.
        assertEq(block.chainid, sphinxUtils.getNetworkInfo(network).chainId);

        deploy(network);
    }

    // Nothing network-specific on this chain.
    function testChainSpecificActionsExecuted() external override {}

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract ChainSpecificGoerli_Test is AbstractChainSpecific_Test {

    Network network = Network.goerli;

    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(
            abi.encodePacked("https://eth-goerli.g.alchemy.com/v2/", alchemyAPIKey)
        );
        vm.createSelectFork(rpcUrl);

        // Sanity check that the chain ID is correct.
        assertEq(block.chainid, sphinxUtils.getNetworkInfo(network).chainId);

        deploy(network);
    }

    // Nothing network-specific on this chain.
    function testChainSpecificActionsExecuted() external override {}

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract ChainSpecificArbitrum_Test is AbstractChainSpecific_Test {

    Network network = Network.arbitrum;

    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(
            abi.encodePacked("https://arb-mainnet.g.alchemy.com/v2/", alchemyAPIKey)
        );
        vm.createSelectFork(rpcUrl);

        // Sanity check that the chain ID is correct.
        assertEq(block.chainid, sphinxUtils.getNetworkInfo(network).chainId);

        deploy(network);
    }

    function testChainSpecificActionsExecuted() external override {
        assertArbitrumMainnetActionsExecuted();
    }

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumGoerliNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract ChainSpecificArbitrumGoerli_Test is AbstractChainSpecific_Test {

    Network network = Network.arbitrum_goerli;

    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(
            abi.encodePacked("https://arb-goerli.g.alchemy.com/v2/", alchemyAPIKey)
        );
        vm.createSelectFork(rpcUrl);

        // Sanity check that the chain ID is correct.
        assertEq(block.chainid, sphinxUtils.getNetworkInfo(network).chainId);

        deploy(network);
    }

    function testChainSpecificActionsExecuted() external override {
        assertArbitrumGoerliActionsExecuted();
    }

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}
