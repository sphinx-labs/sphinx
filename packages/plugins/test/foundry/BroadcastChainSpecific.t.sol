// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AbstractChainSpecific_Test } from "./AbstractChainSpecific.t.sol";
import { Network } from "../../contracts/foundry/SphinxPluginTypes.sol";

// TODO(ryan): A few random edge cases related to the typegen logic came to mind over the past few
// days. I haven't tested these myself, but I figured I'd run them by you to see if any of them are
// worthwhile. Feel free to disregard any of them if they seem irrelevant.
// 1. Do overloaded functions work with the typegen logic? e.g. `increment(uint256)` and
//    `increment(uint256, uint256)`
// 2. Does the typegen logic for parent contracts work when the parent contract is defined in the
//    same source file as the child contract?
// 3. The `generate` command works when inheriting from interfaces, but does it also work when
//    inheriting from abstract contracts?
// 4. A few months ago, we were blocked by a bug in Foundry that prevented us from using OZ's
//    storage slot checker, which uses `solidity-ast` under the hood. The issue hasn't been fixed
//    yet, so I'm wondering if it'd be an issue for the typegen logic as well. Here's the link:
//    https://github.com/foundry-rs/foundry/issues/4981.
// 5. Thoughts on removing the third step of the generate command? When building from a clean repo
//    in the plugins package, it compiles all the contracts, which takes ~20 seconds. Forge will
//    automatically compile the necessary contracts when the user runs any Forge command afte
//    `generate`, so the third step may be unnecessary.
// 6. Looks like there's unnecessary spinner output before and after the `forge build` calls in the
//    generate command.

contract BroadcastChainSpecificOptimismMainnet_Test is AbstractChainSpecific_Test {

    Network network = Network.optimism;

    function setUp() public {
        initializeBroadcastTests(network);
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

contract BroadcastChainSpecificOptimismGoerli_Test is AbstractChainSpecific_Test {

    Network network = Network.optimism_goerli;

    function setUp() public {
        initializeBroadcastTests(network);
    }

    function testChainSpecificActionsExecuted() external override {
        assertOptimismGoerliActionsExecuted();
    }

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();
    }

    function testBroadcastSuccess() external {
        assertBroadcastSuccess();
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract BroadcastChainSpecificEthereum_Test is AbstractChainSpecific_Test {

    Network network = Network.ethereum;

    function setUp() public {
        initializeBroadcastTests(network);
    }

    // Nothing network-specific on this chain.
    function testChainSpecificActionsExecuted() external override {}

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testBroadcastSuccess() external {
        assertBroadcastSuccess();
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract BroadcastChainSpecificGoerli_Test is AbstractChainSpecific_Test {

    Network network = Network.goerli;

    function setUp() public {
        initializeBroadcastTests(network);
    }

    // Nothing network-specific on this chain.
    function testChainSpecificActionsExecuted() external override {}

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testBroadcastSuccess() external {
        assertBroadcastSuccess();
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract BroadcastChainSpecificArbitrum_Test is AbstractChainSpecific_Test {

    Network network = Network.arbitrum;

    function setUp() public {
        initializeBroadcastTests(network);
    }

    function testChainSpecificActionsExecuted() external override {
        assertArbitrumMainnetActionsExecuted();
    }

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumGoerliNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testBroadcastSuccess() external {
        assertBroadcastSuccess();
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}

contract BroadcastChainSpecificArbitrumGoerli_Test is AbstractChainSpecific_Test {

    Network network = Network.arbitrum_goerli;

    function setUp() public {
        initializeBroadcastTests(network);
    }

    function testChainSpecificActionsExecuted() external override {
        assertArbitrumGoerliActionsExecuted();
    }

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testBroadcastSuccess() external {
        assertBroadcastSuccess();
    }

    function testAllNetworksContractSuccess() external {
        assertAllNetworksContractSuccess(network);
    }
}
