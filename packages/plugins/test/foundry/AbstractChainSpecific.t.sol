// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import { ISphinxAuthFactory } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuthFactory.sol";

import { AllNetworks, OnlyArbitrum } from "../../contracts/test/ChainSpecific.sol";
import { ChainSpecificConfiguration } from "../../script/ChainSpecificConfiguration.s.sol";
import { Network, NetworkInfo } from "../../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "./SphinxTestUtils.sol";
import { SphinxConstants } from "../../contracts/foundry/SphinxConstants.sol";

// TODO(refactor): split these contracts into separate files

abstract contract AbstractChainSpecific_Test is Test, ChainSpecificConfiguration, SphinxTestUtils {

    ISphinxAuth auth;
    ISphinxManager manager;

    function testChainSpecificActionsExecuted() external virtual;

    function testOtherNetworkActionsNotExecuted() external virtual;

    // TODO(docs): since the visibility of this function is `external` and it's prefixed with `test`,
    // it will automatically be run for every contract that inherits from this contract.
    function testDeployAllNetworkContract() external {
        assertTrue(
            address(allNetworks) != address(0)
        );
        assertGt(address(allNetworks).code.length, 0);
    }

    function initializeBroadcastTests(Network _network) internal {
        setupVariables();

        auth = ISphinxAuth(sphinxUtils.getSphinxAuthAddress(
            sphinxConfig.owners,
            sphinxConfig.threshold,
            sphinxConfig.projectName
        ));
        manager = ISphinxManager(sphinxUtils.getSphinxManagerAddress(
                sphinxConfig.owners,
                sphinxConfig.threshold,
                sphinxConfig.projectName
            ));

        NetworkInfo memory networkInfo = sphinxUtils.getNetworkInfo(_network);
        string memory rpcUrl = vm.rpcUrl(networkInfo.name);
        vm.createSelectFork(rpcUrl);

        // Sanity check that the chain ID is correct.
        assertEq(block.chainid, networkInfo.chainId);
    }

    // TODO(docs): point to the place where we explain why the
    // authFactory.deploy call isn't broadcasted.
    function assertBroadcastSuccess(uint256 _expectedNumTxns) internal {
        string memory broadcastFilePath = string.concat(vm.projectRoot(), "/broadcast/ChainSpecificConfiguration.s.sol/", vm.toString(block.chainid), "/sphinxDeployTask-latest.json");
        AnvilBroadcastedTxn[] memory broadcastedTxns = readAnvilBroadcastedTxns(broadcastFilePath);

        vm.rollFork(broadcastedTxns[0].hash);

        assertFalse(auth.firstProposalOccurred());

        // The `setFee` function is called once on all networks.
        vm.expectCall(address(allNetworks), abi.encodePacked(allNetworks.setFee.selector), 1);
        // Check that the correct number of functions are called on the Sphinx contracts.
        vm.expectCall(address(auth), abi.encodePacked(auth.setup.selector), 1);
        vm.expectCall(address(auth), abi.encodePacked(auth.propose.selector), 1);
        vm.expectCall(address(auth), abi.encodePacked(auth.approveDeployment.selector), 1);
        vm.expectCall(address(manager), abi.encodePacked(manager.executeInitialActions.selector), 1);

        for (uint256 i = 0; i < broadcastedTxns.length; i++) {
            AnvilBroadcastedTxn memory txn = broadcastedTxns[i];
            uint256 gas = bytesToUint(txn.txDetail.gas);
            uint256 value = bytesToUint(txn.txDetail.value);
            vm.prank(txn.txDetail.from);
            (bool success, ) = txn.txDetail.to.call{ gas: gas, value: value }(txn.txDetail.data);
            assertTrue(success);
        }

        assertTrue(auth.firstProposalOccurred());

        // Check that the broadcasted transactions are only sent to the SphinxManager or SphinxAuth
        // contract. This ensures that we don't accidentally broadcast transactions to contracts
        // like SphinxUtils.
        for (uint256 i = 0; i < broadcastedTxns.length; i++) {
            address to = broadcastedTxns[i].txDetail.to;
            assertTrue(to == address(auth) || to == address(manager));
        }

        assertEq(broadcastedTxns.length, _expectedNumTxns);
    }

    function assertDeployWithCorrectConstructorArg(Network _network) internal {
        address constructorArg = chainSpecificConstructorArgs[_network];
        assertTrue(constructorArg != address(0));
        assertEq(allNetworks.someOtherProtocolAddress(), constructorArg);
    }

    function assertSetFeeCorrectly(Network _network) internal {
        uint256 fee = chainSpecificFee[_network];
        assertGt(fee, 0);
        assertEq(allNetworks.feePercent(), fee);
    }

    function assertArbitrumGoerliNotExecuted() internal {
        assertTrue(address(onlyArbitrumGoerliOne) != address(0));
        assertTrue(address(onlyArbitrumGoerliTwo) != address(0));
        assertEq(address(onlyArbitrumGoerliOne).code.length, 0);
        assertEq(address(onlyArbitrumGoerliTwo).code.length, 0);
    }

    function assertArbitrumMainnetNotExecuted() internal {
        assertTrue(address(onlyArbitrum) != address(0));
        assertEq(address(onlyArbitrum).code.length, 0);
    }

    function assertOptimismMainnetActionsExecuted() internal {
        // Sanity check that the `OnlyOptimism` contract is deployed.
        assertGt(address(onlyOptimism).code.length, 0);

        // Check that `decrementTwice` is called twice.
        assertEq(onlyOptimism.number(), -4);
    }

    function assertOptimismGoerliActionsExecuted() internal {
        // Sanity check that the `OnlyOptimism` contract is deployed.
        assertGt(address(onlyOptimismGoerli).code.length, 0);

        // Check that `incrementTwice` is called twice.
        assertEq(onlyOptimism.number(), 4);
    }

    function assertArbitrumMainnetActionsExecuted() internal {
        // Check that `OnlyArbitrum` is deployed.
        assertTrue(
            address(onlyArbitrum) != address(0)
        );
        assertGt(address(onlyArbitrum).code.length, 0);
        // Check that `increment` is called twice.
        assertEq(onlyArbitrum.number(), 2);
    }

    function assertArbitrumGoerliActionsExecuted() internal {
        assertTrue(
            address(onlyArbitrumGoerliOne) != address(0)
        );
        assertTrue(
            address(onlyArbitrumGoerliTwo) != address(0)
        );
        assertGt(address(onlyArbitrumGoerliOne).code.length, 0);
        assertGt(address(onlyArbitrumGoerliTwo).code.length, 0);
        // Check that `decrement` is called twice on the first contract.
        assertEq(onlyArbitrumGoerliOne.number(), 8);
        // Check that `increment was not called on the second contract.
        assertEq(onlyArbitrumGoerliTwo.number(), 20);
    }
}
