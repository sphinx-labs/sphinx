// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { console } from "sphinx-forge-std/console.sol";
import "sphinx-forge-std/Test.sol";
import { StdUtils } from "sphinx-forge-std/StdUtils.sol";
import { SphinxModuleFactory } from "../contracts/SphinxModuleFactory.sol";
import { SphinxModule } from "../contracts/SphinxModule.sol";
import {
    GnosisSafeProxyFactory
} from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
import { SimulateTxAccessor } from "@gnosis.pm/safe-contracts/accessors/SimulateTxAccessor.sol";
import {
    DefaultCallbackHandler
} from "@gnosis.pm/safe-contracts/handler/DefaultCallbackHandler.sol";
import {
    CompatibilityFallbackHandler
} from "@gnosis.pm/safe-contracts/handler/CompatibilityFallbackHandler.sol";
import { CreateCall } from "@gnosis.pm/safe-contracts/libraries/CreateCall.sol";
import { MultiSend } from "@gnosis.pm/safe-contracts/libraries/MultiSend.sol";
import { MultiSendCallOnly } from "@gnosis.pm/safe-contracts/libraries/MultiSendCallOnly.sol";
import { GnosisSafeL2 } from "@gnosis.pm/safe-contracts/GnosisSafeL2.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";
import { SphinxMerkleTree, SphinxLeafWithProof, SphinxTransaction } from "../contracts/SphinxDataTypes.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { TestUtils } from "./TestUtils.sol";

contract MyContract {

    uint public value;

    function myFunction(uint _value) external {
        value = _value;
    }
}

contract SphinxModule_Test is Test, Enum, TestUtils {

    SphinxModule module;
    GnosisSafe safe;

    Wallet[] ownerWallets;
    address[] owners;
    uint256 threshold = 3;
    address executor = address(0x1000);
    string sampleDeploymentUri = "ipfs://Qm1234";
    MyContract myContract = new MyContract();

    function setUp() public {
        // Deploy all Gnosis Safe contracts
        new SimulateTxAccessor();
        GnosisSafeProxyFactory safeProxyFactory = new GnosisSafeProxyFactory();
        // Deploy handlers
        new DefaultCallbackHandler();
        CompatibilityFallbackHandler compatibilityFallbackHandler = new CompatibilityFallbackHandler();
        // Deploy libraries
        new CreateCall();
        MultiSend multiSend = new MultiSend();
        new MultiSendCallOnly();
        // Deploy singletons
        new GnosisSafeL2();
        GnosisSafe gnosisSafeSingleton = new GnosisSafe();

        SphinxModuleFactory moduleFactory = new SphinxModuleFactory();

        Wallet[] memory wallets = getSphinxWalletsSortedByAddress(5);
        // We can't assign the wallets directly to the `owners` array because Solidity throws an
        // error if we try to assign a memory array to a storage array. So, instead, we have to
        // iterate over the memory array and push each element to the storage array.
        for (uint256 i = 0; i < wallets.length; i++) {
            ownerWallets.push(wallets[i]);
            owners.push(wallets[i].addr);
        }

        bytes memory encodedDeployModuleCall = abi.encodeWithSelector(moduleFactory.deploySphinxModuleFromSafe.selector, bytes32(0));
        bytes memory firstMultiSendData = abi.encodePacked(uint8(Operation.Call), moduleFactory, uint256(0), encodedDeployModuleCall.length, encodedDeployModuleCall);
        bytes memory encodedEnableModuleCall = abi.encodeWithSelector(moduleFactory.enableSphinxModule.selector, bytes32(0));
        bytes memory secondMultiSendData = abi.encodePacked(uint8(Operation.DelegateCall), moduleFactory, uint256(0), encodedEnableModuleCall.length, encodedEnableModuleCall);

        bytes memory multiSendData = abi.encodeWithSelector(multiSend.multiSend.selector, abi.encodePacked(firstMultiSendData, secondMultiSendData));

        bytes memory safeInitializerData = abi.encodePacked(
            gnosisSafeSingleton.setup.selector,
            abi.encode(
                owners,
                threshold,
                address(multiSend),
                multiSendData,
                address(compatibilityFallbackHandler),
                address(0),
                0,
                address(0)
            )
        );

        GnosisSafeProxy safeProxy = safeProxyFactory.createProxyWithNonce(
                address(gnosisSafeSingleton),
                safeInitializerData,
                0
            );

        safe = GnosisSafe(payable(address(safeProxy)));
        module = SphinxModule(moduleFactory.computeSphinxModuleAddress(address(safe), bytes32(0)));
    }

    function test_TODO_success() external {
        SphinxTransaction[] memory txs = new SphinxTransaction[](1);
        txs[0] =
            SphinxTransaction({
                to: address(myContract),
                value: 0,
                txData: abi.encodePacked(myContract.myFunction.selector, abi.encode(123)),
                operation: Operation.Call,
                gas: 1_000_000
            });

        SphinxMerkleTree memory tree = getMerkleTreeFFI(txs);
        bytes memory signatures = getOwnerSignatures(ownerWallets, tree.root);

        vm.startPrank(executor);
        module.approve(tree.root, tree.leafs[0].leaf, tree.leafs[0].proof, signatures);
        SphinxLeafWithProof[] memory executionLeafs = new SphinxLeafWithProof[](1);
        executionLeafs[0] = tree.leafs[1];
        module.execute(executionLeafs);
        vm.stopPrank();
        assertEq(myContract.value(), 123);
    }

    // TODO: mv
    function getMerkleTreeFFI(SphinxTransaction[] memory _txs) public returns (SphinxMerkleTree memory) {
        string[] memory inputs = new string[](11);
        inputs[0] = "npx";
        inputs[1] = "ts-node";
        inputs[2] = "scripts/output-merkle-tree.ts";
        inputs[3] = vm.toString(block.chainid);
        inputs[4] = vm.toString(module.currentNonce());
        inputs[5] = vm.toString(executor);
        inputs[6] = vm.toString(address(safe));
        inputs[7] = vm.toString(address(module));
        inputs[8] = sampleDeploymentUri;
        inputs[9] = vm.toString(abi.encode(_txs));
        inputs[10] = "--swc"; // Speeds up ts-node considerably
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (SphinxMerkleTree));
    }

    function sphinxMerkleTreeType() external returns (SphinxMerkleTree memory) {}
    function sphinxTransactionArrayType() external returns (SphinxTransaction[] memory) {}
}
