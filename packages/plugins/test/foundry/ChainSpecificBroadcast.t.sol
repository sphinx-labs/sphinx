// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AbstractChainSpecific_Test } from "./AbstractChainSpecific.t.sol";
import { Network } from "../../contracts/foundry/SphinxPluginTypes.sol";

// TODO(test): in your chain specific test suite, you should check that the contracts
// aren't deployed initially.
// TODO(test): when you test for idempotence, you need to check that the second deployment
// has a different deployment ID or else it will be skipped entirely.
// TODO(test): add openzppelin ownable and access control to the deployment test suite
// TODO(test): add openzeppelin ownable to the proposal test suite
// TODO(test): do we have a test anywhere that calls a function with at least one argument?
// same with constructors.
// TODO(test): consider having a third "run" of the broadcast suite that adds to the deployment
// on each chain. this will ensure that things aren't always skipped on subsequent deployments.
// if you do this, you should use different strategies for executing the new transactions. e.g.
// change the salt for one of them.
// TODO(test): you should add a couple `increment()` function calls in your proposal test suite.
// then, in proposal test 2, you should check that the number of increments hasn't changed on the
// initial networks. lastly, you should document that you test this.
// TODO(test): test the other "half" of the MultiChain.spec.ts upgrade leaf in the proposal test suite.
// TODO(ryan): did he test that overloaded functions work? e.g. `increment(uint256)` and `increment(uint256, uint256)`

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

    function testBroadcastSuccess() external {
        assertBroadcastSuccess(6);
    }

    function testDeployWithCorrectConstructorArg() external {
        assertDeployWithCorrectConstructorArg(network);
    }

    function testSetFeeCorrectly() external {
        assertSetFeeCorrectly(network);
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
        assertBroadcastSuccess(6);
    }

    function testDeployWithCorrectConstructorArg() external {
        assertDeployWithCorrectConstructorArg(network);
    }

    function testSetFeeCorrectly() external {
        assertSetFeeCorrectly(network);
    }
}

contract BroadcastChainSpecificEthereum_Test is AbstractChainSpecific_Test {

    Network network = Network.ethereum;

    function setUp() public {
        initializeBroadcastTests(network);
    }

    // TODO(docs): nothing network-specific on this chain.
    function testChainSpecificActionsExecuted() external override {}

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testBroadcastSuccess() external {
        assertBroadcastSuccess(5);
    }

    function testDeployWithCorrectConstructorArg() external {
        assertDeployWithCorrectConstructorArg(network);
    }

    function testSetFeeCorrectly() external {
        assertSetFeeCorrectly(network);
    }
}

contract BroadcastChainSpecificGoerli_Test is AbstractChainSpecific_Test {

    Network network = Network.goerli;

    function setUp() public {
        initializeBroadcastTests(network);
    }

    // TODO(docs): nothing network-specific on this chain.
    function testChainSpecificActionsExecuted() external override {}

    function testOtherNetworkActionsNotExecuted() external override {
        assertArbitrumMainnetNotExecuted();
        assertArbitrumGoerliNotExecuted();

        assertEq(address(onlyOptimism).code.length, 0);
        assertEq(address(onlyOptimismGoerli).code.length, 0);
    }

    function testBroadcastSuccess() external {
        assertBroadcastSuccess(5);
    }

    function testDeployWithCorrectConstructorArg() external {
        assertDeployWithCorrectConstructorArg(network);
    }

    function testSetFeeCorrectly() external {
        assertSetFeeCorrectly(network);
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
        assertBroadcastSuccess(5);
    }

    function testDeployWithCorrectConstructorArg() external {
        assertDeployWithCorrectConstructorArg(network);
    }

    function testSetFeeCorrectly() external {
        assertSetFeeCorrectly(network);
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
        assertBroadcastSuccess(5);
    }

    function testDeployWithCorrectConstructorArg() external {
        assertDeployWithCorrectConstructorArg(network);
    }

    function testSetFeeCorrectly() external {
        assertSetFeeCorrectly(network);
    }
}
