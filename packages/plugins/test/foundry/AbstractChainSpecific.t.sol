// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.0;

// TODO: uncomment

// import "sphinx-forge-std/Test.sol";

// import { AllNetworks, OnlyArbitrum, OnlyOptimism } from "../../contracts/test/ChainSpecific.sol";
// import { ChainSpecific } from "../../script/ChainSpecific.s.sol";
// import { Network, NetworkInfo } from "../../contracts/foundry/SphinxPluginTypes.sol";
// import { SphinxConstants } from "../../contracts/foundry/SphinxConstants.sol";
// import { SphinxManagerEvents } from "@sphinx-labs/contracts/contracts/SphinxManagerEvents.sol";
// import { DeploymentState, DeploymentStatus } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
// import { Sphinx } from "../../contracts/foundry/Sphinx.sol";

// /**
//  * @dev An abstract contract to test multi-chain deployments that differ between networks (e.g.
//  *      deploying a contract on one network, but skipping it on another). This contract is inherited
//  *      by two test suites: one that tests the in-process deployment logic, and another that tests
//  *      the broadcasted deployment logic. The scenarios that are tested in both test suites are:
//  *      - Deploying a contract to all networks with a different constructor arg on each network
//  *      - Calling a function with a different value on each network
//  *      - Deploying a contract on a specific network, with and without `DeployOptions`.
//  *      - Deploying a contract that does not have a constructor (`OnlyOptimism`), a contract that
//  *         has a constructor with arguments (`AllNetworks`), and a contract that has a
//  *         constructorwith no arguments (OnlyArbitrum).
//  *      - Calling functions on specific networks and skipping them on others
//  *
//  *      Additionally, the broadcast test suite tests that the deployment was successfully broadcasted
//  *      onto the target network.
//  */
// abstract contract AbstractChainSpecific_Test is Test, ChainSpecific {

//     function testChainSpecificActionsExecuted() external virtual;

//     function testOtherNetworkActionsNotExecuted() external virtual;

//     /**
//      * @notice Since the visibility of this function is `external` and it's prefixed with `test`,
//      *        it will automatically run for every test contract that inherits from this contract.
//      */
//     function testDeployAllNetworkContract() external {
//         assertTrue(
//             address(allNetworks) != address(0)
//         );
//         assertGt(address(allNetworks).code.length, 0);
//     }

//     function setUpBroadcastTests(Network _network) internal {
//         setupVariables();

//         NetworkInfo memory networkInfo = sphinxUtils.getNetworkInfo(_network);
//         string memory rpcUrl = vm.rpcUrl(networkInfo.name);
//         vm.createSelectFork(rpcUrl);

//         // Sanity check that the chain ID is correct.
//         assertEq(block.chainid, networkInfo.chainId);
//     }

//     /**
//      * @param _expectedNumChainSpecificActions The number of chain-specific actions that were
//      *                                         included in the deployment for the current network.
//      */
//     function assertBroadcastSuccess(uint256 _expectedNumChainSpecificActions) internal {
//         string memory broadcastFilePath = string.concat(
//             vm.projectRoot(),
//             "/broadcast/ChainSpecific.s.sol/",
//             vm.toString(block.chainid),
//             "/",
//             // We have to do this weird slice here b/c the `toString` function returns a packed 32 byte string when the
//             // input type is bytes4 which isn't what we need. We need the hex code for the selector with the `0x` removed.
//             string(this.sliceBytes(bytes(vm.toString(Sphinx.sphinxDeployTask.selector)), 2, 10)),
//             "-latest.json"
//         );
//         AnvilBroadcastedTxn[] memory broadcastedTxns = readAnvilBroadcastedTxns(broadcastFilePath);

//         vm.rollFork(broadcastedTxns[0].hash);

//         assertFalse(auth.firstProposalOccurred());

//         // The `setFee` function is called once on all networks.
//         vm.expectCall(address(allNetworks), abi.encodePacked(allNetworks.setFee.selector), 1);
//         // Check that the correct number of functions are called on the Sphinx contracts.
//         vm.expectCall(address(auth), abi.encodePacked(auth.setup.selector), 1);
//         vm.expectCall(address(auth), abi.encodePacked(auth.propose.selector), 1);
//         vm.expectCall(address(auth), abi.encodePacked(auth.approveDeployment.selector), 1);
//         vm.expectCall(address(manager), abi.encodePacked(manager.executeInitialActions.selector), 1);

//         vm.recordLogs();
//         for (uint256 i = 0; i < broadcastedTxns.length; i++) {
//             AnvilBroadcastedTxn memory txn = broadcastedTxns[i];
//             uint256 gas = bytesToUint(txn.txDetail.gas);
//             uint256 value = bytesToUint(txn.txDetail.value);
//             vm.prank(txn.txDetail.from);
//             (bool success, ) = txn.txDetail.to.call{ gas: gas, value: value }(txn.txDetail.data);
//             assertTrue(success);
//         }

//         bytes32 deploymentId;
//         Vm.Log[] memory logs = vm.getRecordedLogs();
//         for (uint256 i = 0; i < logs.length; i++) {
//             Vm.Log memory log = logs[i];
//             if (log.emitter == address(manager) && log.topics[0] == SphinxManagerEvents.SphinxDeploymentCompleted.selector) {
//                 deploymentId = log.topics[1];
//                 break;
//             }
//         }
//         DeploymentState memory deploymentState = manager.deployments(deploymentId);
//         assertTrue(deploymentState.status == DeploymentStatus.COMPLETED);

//         // Four actions were executed for the 'AllNetworks' contract, which is executed on all networks.
//         uint256 numAllNetworksActions = 4;
//         // Check that the correct number of `DEPLOY_CONTRACT` and `CALL` actions were executed on
//         // the SphinxManager contract.
//         assertEq(deploymentState.numInitialActions, _expectedNumChainSpecificActions + numAllNetworksActions);

//         assertTrue(auth.firstProposalOccurred());

//         // Check that the broadcasted transactions are only sent to the SphinxManager or SphinxAuth
//         // contract. This ensures that we don't accidentally broadcast transactions to contracts
//         // like SphinxUtils.
//         for (uint256 i = 0; i < broadcastedTxns.length; i++) {
//             address to = broadcastedTxns[i].txDetail.to;
//             assertTrue(to == address(auth) || to == address(manager));
//         }

//         assertEq(broadcastedTxns.length, 6);
//     }

//     function assertAllNetworksContractSuccess(Network _network) internal {
//         // Check that the constructor arg is set correctly.
//         address constructorArg = chainSpecificConstructorArgs[_network];
//         assertTrue(constructorArg != address(0));
//         assertEq(allNetworks.someOtherProtocolAddress(), constructorArg);

//         // Check that the fee is set correctly.
//         uint256 fee = chainSpecificFee[_network];
//         assertGt(fee, 0);
//         // The final fee is the initial fee plus the returned value of `AllNetworks.feeToAdd`.
//         assertEq(allNetworks.feePercent(), fee + allNetworks.feeToAdd());

//         assertEq(allNetworks.owner(), finalOwner);
//     }

//     function assertArbitrumGoerliNotExecuted() internal {
//         assertTrue(address(onlyArbitrumGoerliOne) != address(0));
//         assertTrue(address(onlyArbitrumGoerliTwo) != address(0));
//         assertEq(address(onlyArbitrumGoerliOne).code.length, 0);
//         assertEq(address(onlyArbitrumGoerliTwo).code.length, 0);
//     }

//     function assertArbitrumMainnetNotExecuted() internal {
//         assertTrue(address(onlyArbitrum) != address(0));
//         assertEq(address(onlyArbitrum).code.length, 0);
//     }

//     function assertOptimismMainnetActionsExecuted() internal {
//         // Sanity check that the `OnlyOptimism` contract is deployed.
//         assertGt(address(onlyOptimism).code.length, 0);

//         // Check that `decrementTwice` is called twice.
//         assertEq(onlyOptimism.number(), -4);
//     }

//     function assertOptimismGoerliActionsExecuted() internal {
//         // Sanity check that the `OnlyOptimism` contract is deployed.
//         assertGt(address(onlyOptimismGoerli).code.length, 0);

//         // Check that `incrementTwice` is called twice.
//         assertEq(onlyOptimism.number(), 4);
//     }

//     function assertArbitrumMainnetActionsExecuted() internal {
//         // Check that `OnlyArbitrum` is deployed.
//         assertTrue(
//             address(onlyArbitrum) != address(0)
//         );
//         assertGt(address(onlyArbitrum).code.length, 0);
//         // Check that `increment` is called twice. Its initial value is `42`, so it should be `44`
//         // after the two calls.
//         assertEq(onlyArbitrum.number(), 44);
//     }

//     function assertArbitrumGoerliActionsExecuted() internal {
//         assertTrue(
//             address(onlyArbitrumGoerliOne) != address(0)
//         );
//         assertTrue(
//             address(onlyArbitrumGoerliTwo) != address(0)
//         );
//         assertGt(address(onlyArbitrumGoerliOne).code.length, 0);
//         assertGt(address(onlyArbitrumGoerliTwo).code.length, 0);
//         // Check that `decrement` is called twice on the first contract. Its initial value
//         // is `42`, so it should be `40` after the two calls.
//         assertEq(onlyArbitrumGoerliOne.number(), 40);
//         // Check that `increment` was not called on the second contract. Its initial value
//         // is `42`, so it should still be `42`.
//         assertEq(onlyArbitrumGoerliTwo.number(), 42);
//     }
// }
