// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { console } from "sphinx-forge-std/console.sol";
import "sphinx-forge-std/Test.sol";
import { StdUtils } from "sphinx-forge-std/StdUtils.sol";
import { SphinxModuleFactory } from "../contracts/core/SphinxModuleFactory.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import { GnosisSafeProxyFactory } from
    "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
import { SimulateTxAccessor } from "@gnosis.pm/safe-contracts/accessors/SimulateTxAccessor.sol";
import { DefaultCallbackHandler } from
    "@gnosis.pm/safe-contracts/handler/DefaultCallbackHandler.sol";
import { CompatibilityFallbackHandler } from
    "@gnosis.pm/safe-contracts/handler/CompatibilityFallbackHandler.sol";
import { CreateCall } from "@gnosis.pm/safe-contracts/libraries/CreateCall.sol";
import { MultiSend } from "@gnosis.pm/safe-contracts/libraries/MultiSend.sol";
import { MultiSendCallOnly } from "@gnosis.pm/safe-contracts/libraries/MultiSendCallOnly.sol";
import { GnosisSafeL2 } from "@gnosis.pm/safe-contracts/GnosisSafeL2.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";
import {
    SphinxMerkleTree,
    SphinxLeafWithProof,
    SphinxTransaction,
    SphinxLeafType,
    Result,
    DeploymentState,
    DeploymentStatus
} from "../contracts/core/SphinxDataTypes.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { TestUtils } from "./TestUtils.t.sol";
import { Reenterer } from "./Reenterer.sol";
import { Common } from "./Common.t.sol";

// TODO: you should test an empty uri in 'approve'.

contract MyContract {
    uint256 public myNum;

    function setMyNum(uint256 _num) external {
        myNum = _num;
    }

    function reverter() external {
        revert("MyContract: reverted");
    }

    function rm() external {
        new MyDelegateCallContract();
        new MyDelegateCallContract();
        new MyDelegateCallContract();
        new MyDelegateCallContract();
        new MyDelegateCallContract();
        new MyDelegateCallContract();
        new MyDelegateCallContract();
        new MyDelegateCallContract();
    }

    function acceptPayment() external payable { }
}

contract MyDelegateCallContract {
    address private immutable CONTRACT_ADDRESS = address(this);

    bool public wasDelegateCalled;

    function onlyDelegateCall() external {
        require(address(this) != CONTRACT_ADDRESS, "MyContract: only delegatecall allowed");
        MyDelegateCallContract(payable(CONTRACT_ADDRESS)).delegateCallOccurred();
    }

    function delegateCallOccurred() external {
        wasDelegateCalled = true;
    }
}

// TODO: after finishing the unit tests in this file, add fuzz tests. then, check if there are any
// fuzz tests to add in the SphinxModuleFactory's unit tests.

// TODO(refactor): inherit from ISphinxModule instead of SphinxModule. do the same with the factory.
contract SphinxModule_Test is Test, Enum, TestUtils, SphinxModule, Common {
    constructor() SphinxModule(address(1)) { }

    bytes internal constant CREATE3_PROXY_BYTECODE = hex"67363d3d37363d34f03d5260086018f3";

    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    SphinxModule module;
    GnosisSafe safe;

    SphinxTransaction[] defaultTxs;
    Wallet[] ownerWallets;
    address[] owners;
    uint256 threshold = 3;
    address executor = address(0x1000);
    string sampleDeploymentUri = "ipfs://Qm1234";
    MyContract myContract = new MyContract();
    MyDelegateCallContract myDelegateCallContract = new MyDelegateCallContract();
    // The following addresses correspond to contracts that will be deployed during execution.
    address deployedViaCreate;
    address deployedViaCreate2;
    address deployedViaCreate3;

    function setUp() public override {
        Common.setUp();

        SphinxModuleFactory moduleFactory = new SphinxModuleFactory();

        Wallet[] memory wallets = getSphinxWalletsSortedByAddress(5);
        // We can't assign the wallets directly to the `owners` array because Solidity throws an
        // error if we try to assign a memory array to a storage array. So, instead, we have to
        // iterate over the memory array and push each element to the storage array.
        for (uint256 i = 0; i < wallets.length; i++) {
            ownerWallets.push(wallets[i]);
            owners.push(wallets[i].addr);
        }

        bytes memory encodedDeployModuleCall =
            abi.encodeWithSelector(moduleFactory.deploySphinxModuleFromSafe.selector, bytes32(0));
        bytes memory firstMultiSendData = abi.encodePacked(
            uint8(Operation.Call),
            moduleFactory,
            uint256(0),
            encodedDeployModuleCall.length,
            encodedDeployModuleCall
        );
        bytes memory encodedEnableModuleCall =
            abi.encodeWithSelector(moduleFactory.enableSphinxModuleFromSafe.selector, bytes32(0));
        bytes memory secondMultiSendData = abi.encodePacked(
            uint8(Operation.DelegateCall),
            moduleFactory,
            uint256(0),
            encodedEnableModuleCall.length,
            encodedEnableModuleCall
        );
        bytes memory multiSendData = abi.encodeWithSelector(
            gnosisSafeContracts.multiSend.multiSend.selector,
            abi.encodePacked(firstMultiSendData, secondMultiSendData)
        );

        bytes memory safeInitializerData = abi.encodePacked(
            gnosisSafeContracts.gnosisSafeSingleton.setup.selector,
            abi.encode(
                owners,
                threshold,
                address(gnosisSafeContracts.multiSend),
                multiSendData,
                address(gnosisSafeContracts.compatibilityFallbackHandler),
                address(0),
                0,
                address(0)
            )
        );

        GnosisSafeProxy safeProxy = gnosisSafeContracts.safeProxyFactory.createProxyWithNonce(
            address(gnosisSafeContracts.gnosisSafeSingleton), safeInitializerData, 0
        );

        safe = GnosisSafe(payable(address(safeProxy)));
        module =
            SphinxModule(moduleFactory.computeSphinxModuleAddress(address(safe), address(safe), 0));
        // Give the Gnosis Safe 2 ether
        vm.deal(address(safe), 2 ether);

        deployedViaCreate = computeCreateAddress(address(safe), vm.getNonce(address(safe)));
        deployedViaCreate2 = computeCreate2Address({
            salt: bytes32(0),
            initcodeHash: keccak256(type(MyContract).creationCode),
            deployer: address(safe)
        });
        deployedViaCreate3 =
            computeCreate3Address({ _deployer: address(safe), _salt: bytes32(uint256(0)) });

        // Standard function call:
        defaultTxs.push(
            SphinxTransaction({
                to: address(myContract),
                value: 0,
                txData: abi.encodePacked(myContract.setMyNum.selector, abi.encode(123)),
                operation: Operation.Call,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Call that returns data:
        defaultTxs.push(
            SphinxTransaction({
                to: address(myContract),
                value: 0,
                txData: abi.encodePacked(myContract.myNum.selector),
                operation: Operation.Call,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Delegatecall transaction:
        defaultTxs.push(
            SphinxTransaction({
                to: address(myDelegateCallContract),
                value: 0,
                txData: abi.encodePacked(myDelegateCallContract.onlyDelegateCall.selector),
                operation: Operation.DelegateCall,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Contract deployment via `CREATE`:
        defaultTxs.push(
            SphinxTransaction({
                to: address(gnosisSafeContracts.createCall),
                value: 0,
                txData: abi.encodePacked(
                    gnosisSafeContracts.createCall.performCreate.selector,
                    abi.encode(0, type(MyContract).creationCode)
                    ),
                operation: Operation.DelegateCall,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Contract deployment via `CREATE2`:
        defaultTxs.push(
            SphinxTransaction({
                to: address(gnosisSafeContracts.createCall),
                value: 0,
                txData: abi.encodePacked(
                    gnosisSafeContracts.createCall.performCreate2.selector,
                    abi.encode(0, type(MyContract).creationCode, bytes32(0))
                    ),
                operation: Operation.DelegateCall,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Contract deployment via `CREATE3`. TODO(docs): We do this by using Gnosis Safe's
        // `MultiSend`...
        address create3ProxyAddress = computeCreate2Address({
            salt: bytes32(0),
            initcodeHash: keccak256(CREATE3_PROXY_BYTECODE),
            deployer: address(safe)
        });
        bytes memory create3ProxyDeploymentData = abi.encodeWithSelector(
            gnosisSafeContracts.createCall.performCreate2.selector,
            abi.encode(0, CREATE3_PROXY_BYTECODE, bytes32(0))
        );
        bytes memory firstCreate3MultiSendData = abi.encodePacked(
            uint8(Operation.DelegateCall),
            address(gnosisSafeContracts.createCall),
            uint256(0),
            create3ProxyDeploymentData.length,
            create3ProxyDeploymentData
        );
        bytes memory secondCreate3MultiSendData = abi.encodePacked(
            uint8(Operation.Call),
            create3ProxyAddress,
            uint256(0),
            type(MyContract).creationCode.length,
            type(MyContract).creationCode
        );
        defaultTxs.push(
            SphinxTransaction({
                to: address(gnosisSafeContracts.multiSend),
                value: 0,
                txData: abi.encodeWithSelector(
                    gnosisSafeContracts.multiSend.multiSend.selector,
                    abi.encodePacked(firstCreate3MultiSendData, secondCreate3MultiSendData)
                    ),
                operation: Operation.DelegateCall,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Transfer value from the Gnosis Safe to another contract:
        defaultTxs.push(
            SphinxTransaction({
                to: address(myContract),
                value: 1 ether,
                txData: abi.encodePacked(myContract.acceptPayment.selector),
                operation: Operation.Call,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
    }

    function test_constructor_reverts_invalidSafeAddress() external {
        vm.expectRevert("SphinxModule: invalid Safe address");
        new SphinxModule(address(0));
    }

    function test_constructor_success() external {
        assertEq(address(module.safeProxy()), address(safe));
    }

    // TODO(end): delete the Reenterer contract if you don't use it.

    function test_approve_revert_noReentrancy() external {
        // TODO(docs): Create a transaction that will cause the Gnosis Safe to call the `approve`
        // function in the `SphinxModule`. This should trigger a re-entrancy error.
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        TODOOutput memory output = getTODOOutput(
            helper_makeTODO(
                (
                    SphinxTransaction({
                        to: address(module),
                        value: 0,
                        // TODO(docs): encdoe the call to the 'approval' function on the
                        // SphinxModule.
                        // The approval function's args don't matter  because the call will revert
                        // before they're used.
                        txData: abi.encodePacked(
                            module.approve.selector,
                            abi.encode(
                                defaultOutput.merkleRoot,
                                defaultOutput.approvalLeafWithProof,
                                defaultOutput.ownerSignatures
                            )
                            ),
                        operation: Operation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(executor);
        module.approve(output.merkleRoot, output.approvalLeafWithProof, output.ownerSignatures);
        Result[] memory results = module.execute(output.executionLeafsWithProofs);
        assertFalse(results[0].success);
        assertEq(
            results[0].returnData,
            abi.encodePacked(ERROR_SELECTOR, abi.encode("ReentrancyGuard: reentrant call"))
        );
        vm.stopPrank();
    }

    function test_approve_revert_invalidRoot() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));

        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid root");
        module.approve({
            _root: bytes32(0), // Invalid Merkle root
            _leafWithProof: defaultOutput.approvalLeafWithProof,
            _signatures: defaultOutput.ownerSignatures
        });
    }

    // TODO(refactor): vm.startPrank -> vm.prank where applicable.

    function test_approve_revert_rootAlreadyUsed() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));

        helper_test_approveThenExecuteBatch({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0)
        });

        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: root already approved");
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.approvalLeafWithProof,
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafChainID() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));

        defaultOutput.approvalLeafWithProof.leaf.chainId += 1;
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.approvalLeafWithProof,
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafIndex() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        defaultOutput.approvalLeafWithProof.leaf.index += 1;
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.approvalLeafWithProof,
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafType() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        defaultOutput.approvalLeafWithProof.leaf.leafType = SphinxLeafType.EXECUTE;
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.approvalLeafWithProof,
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafData() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        defaultOutput.approvalLeafWithProof.leaf.data =
            abi.encodePacked(defaultOutput.approvalLeafWithProof.leaf.data, hex"00");
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.approvalLeafWithProof,
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidMerkleProof() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        defaultOutput.approvalLeafWithProof.proof[0] = bytes32(0);
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.approvalLeafWithProof,
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidMerkleRoot() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            bytes32(uint256(1)), defaultOutput.approvalLeafWithProof, defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_invalidLeafType() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        // TODO(docs): Attempt to approve an `EXECUTE` leaf
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.executionLeafsWithProofs[0],
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_invalidChainID() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        vm.chainId(block.chainid + 1);
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid chain id");
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.approvalLeafWithProof,
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_invalidLeafIndex() external {
        TODOStruct memory todoStruct = helper_makeTODO(defaultTxs);
        todoStruct.forceApprovalLeafIndexNonZero = true;
        TODOOutput memory output = getTODOOutput(todoStruct);

        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        module.approve(output.merkleRoot, output.approvalLeafWithProof, output.ownerSignatures);
    }

    function test_approve_revert_invalidSafeProxy() external {
        TODOStruct memory todoStruct = helper_makeTODO(defaultTxs);
        todoStruct.safeProxy = address(0x1234);
        TODOOutput memory output = getTODOOutput(todoStruct);

        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid SafeProxy");
        module.approve(output.merkleRoot, output.approvalLeafWithProof, output.ownerSignatures);
    }

    function test_approve_revert_invalidModule() external {
        TODOStruct memory todoStruct = helper_makeTODO(defaultTxs);
        todoStruct.module = SphinxModule(address(0x1234));
        TODOOutput memory output = getTODOOutput(todoStruct);

        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid SphinxModule");
        module.approve(output.merkleRoot, output.approvalLeafWithProof, output.ownerSignatures);
    }

    function test_approve_revert_invalidNonce() external {
        TODOStruct memory todoStruct = helper_makeTODO(defaultTxs);
        todoStruct.nonceInModule = module.currentNonce() + 1;
        TODOOutput memory output = getTODOOutput(todoStruct);

        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid nonce");
        module.approve(output.merkleRoot, output.approvalLeafWithProof, output.ownerSignatures);
    }

    function test_approve_revert_numLeafsIsZero() external {
        TODOStruct memory todoStruct = helper_makeTODO(defaultTxs);
        todoStruct.forceNumLeafsValue = true;
        todoStruct.overridingNumLeafsValue = 0;
        TODOOutput memory output = getTODOOutput(todoStruct);

        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: numLeafs cannot be 0");
        module.approve(output.merkleRoot, output.approvalLeafWithProof, output.ownerSignatures);
    }

    function test_approve_revert_invalidExecutor() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        // Prank an address that isn't the executor
        vm.startPrank(address(0x1234));
        vm.expectRevert("SphinxModule: caller isn't executor");
        module.approve(
            defaultOutput.merkleRoot,
            defaultOutput.approvalLeafWithProof,
            defaultOutput.ownerSignatures
        );
    }

    function test_approve_revert_checkSignatures_emptyOwnerSignatures() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        vm.expectRevert("GS020"); // In Gnosis Safe v1.3.0, this error means "Signatures data too
            // short".
        vm.prank(executor);
        module.approve(defaultOutput.merkleRoot, defaultOutput.approvalLeafWithProof, new bytes(0));
    }

    function test_approve_success() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });
    }

    function test_approve_success_multipleApprovals() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approveThenExecuteBatch({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0)
        });

        TODOOutput memory newOutput = getTODOOutput(
            helper_makeTODO(
                SphinxTransaction({
                    to: address(myContract),
                    value: 0,
                    // Use slightly different data than the first tx so that the Merkle root is
                    // different.
                    txData: abi.encodePacked(myContract.setMyNum.selector, abi.encode(4321)),
                    operation: Operation.Call,
                    gas: 1_000_000,
                    requireSuccess: true
                })
            )
        );
        helper_test_approve({
            _todoOutput: newOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });
    }

    function test_approve_success_cancelActiveMerkleRoot() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        // We use slightly different data so that the new Merkle root is different.
        TODOOutput memory newOutput = getTODOOutput(
            helper_makeTODO(
                SphinxTransaction({
                    to: address(myContract),
                    value: 0,
                    txData: abi.encodePacked(myContract.setMyNum.selector, abi.encode(4321)),
                    operation: Operation.Call,
                    gas: 1_000_000,
                    requireSuccess: true
                })
            )
        );

        emit SphinxDeploymentCancelled(defaultOutput.merkleRoot);
        helper_test_approve({
            _todoOutput: newOutput,
            _initialActiveMerkleRoot: defaultOutput.merkleRoot,
            _expectedStatus: DeploymentStatus.APPROVED
        });

        (,,,, DeploymentStatus initialRootStatus) = module.deployments(defaultOutput.merkleRoot);
        assertEq(uint256(initialRootStatus), uint256(DeploymentStatus.CANCELLED));
    }

    function test_approve_success_emptyDeployment() external {
        TODOStruct memory todoStruct = helper_makeTODO(defaultTxs);
        delete todoStruct.txs;
        TODOOutput memory defaultOutput = getTODOOutput(todoStruct);

        // Run some sanity checks before submitting the approval.
        assertEq(defaultOutput.executionLeafsWithProofs.length, 0);
        assertEq(defaultOutput.approvalLeafWithProof.proof.length, 0);

        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.COMPLETED
        });
    }

    //////////////////////////////// execute ////////////////////////////////////

    function test_execute_revert_noReentrancy() external {
        // TODO(docs): Create a transaction that will cause the Gnosis Safe to call the `execute`
        // function in the `SphinxModule`. This should trigger a re-entrancy error.
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        TODOOutput memory output = getTODOOutput(
            helper_makeTODO(
                (
                    SphinxTransaction({
                        to: address(module),
                        value: 0,
                        // TODO(docs): encdoe the call to the 'approval' function on the
                        // SphinxModule.
                        // The approval function's args don't matter  because the call will revert
                        // before they're used.
                        txData: abi.encodePacked(
                            module.execute.selector, abi.encode(defaultOutput.executionLeafsWithProofs)
                            ),
                        operation: Operation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(executor);
        module.approve(output.merkleRoot, output.approvalLeafWithProof, output.ownerSignatures);
        Result[] memory results = module.execute(output.executionLeafsWithProofs);
        assertFalse(results[0].success);
        assertEq(
            results[0].returnData,
            abi.encodePacked(ERROR_SELECTOR, abi.encode("ReentrancyGuard: reentrant call"))
        );
        vm.stopPrank();
    }

    function test_execute_revert_noLeafsToExecute() external {
        vm.expectRevert("SphinxModule: no leafs to execute");
        module.execute(new SphinxLeafWithProof[](0));
    }

    function test_execute_revert_noActiveRoot() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        vm.expectRevert("SphinxModule: no active root");
        module.execute(defaultOutput.executionLeafsWithProofs);
    }

    function test_execute_revert_invalidExecutor() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });
        // Prank an address that isn't the executor
        vm.startPrank(address(0x1234));
        vm.expectRevert("SphinxModule: caller isn't executor");
        module.execute(defaultOutput.executionLeafsWithProofs);
    }

    function test_execute_revert_extraLeafsNotAllowed() external {
        TODOStruct memory todoStruct = helper_makeTODO(defaultTxs);
        todoStruct.forceNumLeafsValue = true;
        todoStruct.overridingNumLeafsValue = 2; // TODO(docs): approval leaf and first execution
            // leaf.
        TODOOutput memory output = getTODOOutput(todoStruct);
        vm.prank(executor);
        // TODO(docs): we don't use `helper_test_approve` here because we've modified the `numLeafs`
        // in this test, which would cause the helper function to fail.
        module.approve(output.merkleRoot, output.approvalLeafWithProof, output.ownerSignatures);
        // Sanity check that the approval was successful.
        assertEq(module.activeRoot(), output.merkleRoot);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: extra leafs not allowed");
        module.execute(output.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafChainID() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        defaultOutput.executionLeafsWithProofs[0].leaf.chainId += 1;
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(defaultOutput.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafIndex() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        defaultOutput.executionLeafsWithProofs[0].leaf.index += 1;
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(defaultOutput.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafType() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        defaultOutput.executionLeafsWithProofs[0].leaf.leafType = SphinxLeafType.APPROVE;
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(defaultOutput.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafData() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        defaultOutput.executionLeafsWithProofs[0].leaf.data =
            abi.encodePacked(defaultOutput.executionLeafsWithProofs[0].leaf.data, hex"00");
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(defaultOutput.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidMerkleProof() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        defaultOutput.executionLeafsWithProofs[0].proof[0] = bytes32(0);
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(defaultOutput.executionLeafsWithProofs);
    }

    // TODO(docs): unlike the approval test suite, we don't do
    // test_execute_revert_merkleProofVerify_invalidMerkleRoot because the Merkle root is stored as
    // a state variable in the SphinxModule after the `approve` function. in other words, we
    // can't pass in an invalid Merkle root to the `execute` function.

    function test_execute_revert_invalidLeafType() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        // TODO(docs): Attempt to approve an `APPROVE` leaf
        SphinxLeafWithProof[] memory approvalLeafsWithProofs = new SphinxLeafWithProof[](1);
        approvalLeafsWithProofs[0] = defaultOutput.approvalLeafWithProof;
        module.execute(approvalLeafsWithProofs);
    }

    function test_execute_revert_invalidChainID() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });
        vm.chainId(block.chainid + 1);
        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid chain id");
        module.execute(defaultOutput.executionLeafsWithProofs);
    }

    function test_execute_revert_invalidLeafIndex() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        vm.startPrank(executor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        // Execute the second `EXECUTE` leaf without executing the first.
        SphinxLeafWithProof[] memory executionLeafWithProof = new SphinxLeafWithProof[](1);
        executionLeafWithProof[0] = defaultOutput.executionLeafsWithProofs[1];
        module.execute(executionLeafWithProof);
    }

    function test_execute_fail_userTransactionReverted() external {
        defaultTxs[1].txData = abi.encodePacked(myContract.reverter.selector);
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        vm.expectEmit(address(module));
        emit SphinxDeploymentFailed({
            merkleRoot: defaultOutput.merkleRoot,
            leafIndex: 2 // Second execution leaf
         });
        vm.prank(executor);
        Result[] memory results = module.execute(defaultOutput.executionLeafsWithProofs);

        assertTrue(results[0].success);
        assertEq(results[0].returnData, hex"");
        assertFalse(results[1].success);
        assertEq(
            results[1].returnData,
            abi.encodePacked(ERROR_SELECTOR, abi.encode("MyContract: reverted"))
        );
        // Check that the rest of the execution leafs TODO(docs)
        for (uint256 i = 2; i < results.length; i++) {
            assertFalse(results[i].success);
            assertEq(results[i].returnData, hex"");
        }
        (, uint256 leafsExecuted,,, DeploymentStatus status) =
            module.deployments(defaultOutput.merkleRoot);
        assertEq(uint256(status), uint256(DeploymentStatus.FAILED));
        assertEq(module.activeRoot(), bytes32(0));
        assertEq(leafsExecuted, 2); // Only the approval leaf and the first execution leaf
            // succeeded.
    }

    function test_execute_fail_insufficientGas() external {
        // Check that the user's transactions weren't executed.
        helper_test_preExecution();

        defaultTxs[0].gas = 1_000;
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));

        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        vm.expectEmit(address(module));
        emit SphinxDeploymentFailed({
            merkleRoot: defaultOutput.merkleRoot,
            leafIndex: 1 // First execution leaf
         });
        vm.prank(executor);
        Result[] memory results = module.execute(defaultOutput.executionLeafsWithProofs);

        for (uint256 i = 0; i < results.length; i++) {
            assertFalse(results[i].success);
            // TODO(docs): EVM out of gas error doesn't return any data in this situation.
            assertEq(results[i].returnData, hex"");
        }
        (, uint256 leafsExecuted,,, DeploymentStatus status) =
            module.deployments(defaultOutput.merkleRoot);
        assertEq(uint256(status), uint256(DeploymentStatus.FAILED));
        assertEq(module.activeRoot(), bytes32(0));
        assertEq(leafsExecuted, 1); // Only the approval leaf was executed successfully.

        // Check that the user's transactions weren't executed.
        helper_test_preExecution();
    }

    // Execute all of the user's transactions in a single call.
    function test_execute_success_batchExecute() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approveThenExecuteBatch({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0)
        });
    }

    // Execute the user's transactions one at a time.
    function test_execute_success_oneByOne() external {
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(defaultTxs));

        helper_test_preExecution();

        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        helper_test_execute_oneByOne(defaultOutput);

        helper_test_postExecution(defaultOutput);
    }

    function test_execute_success_oneExecutionLeaf() external {
        assertEq(myContract.myNum(), 0);
        SphinxTransaction[] memory txn = new SphinxTransaction[](1);
        txn[0] = defaultTxs[0];
        TODOOutput memory output = getTODOOutput(helper_makeTODO(txn));

        helper_test_approve({
            _todoOutput: output,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });

        helper_test_execute_oneByOne(output);

        assertEq(myContract.myNum(), 123);
    }

    function test_execute_success_noRequireSuccess() external {
        defaultTxs[0].txData = abi.encodePacked(myContract.reverter.selector);
        defaultTxs[0].requireSuccess = false;
        TODOOutput memory output = getTODOOutput(helper_makeTODO(defaultTxs));
        helper_test_approveThenExecuteBatch({
            _todoOutput: output,
            _initialActiveMerkleRoot: bytes32(0)
        });
    }

    function test_execute_TODO_RM() external {
        SphinxTransaction[] memory txns = new SphinxTransaction[](1);
        txns[0] = defaultTxs[0];
        txns[0].txData = abi.encodePacked(myContract.rm.selector);
        txns[0].gas = 5_000_000;
        TODOOutput memory defaultOutput = getTODOOutput(helper_makeTODO(txns));
        helper_test_approve({
            _todoOutput: defaultOutput,
            _initialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED
        });
        vm.startPrank(executor);
        Result[] memory result =
            module.execute{ gas: 500_000 }(defaultOutput.executionLeafsWithProofs);
        assertTrue(result[0].success);
    }

    //////////////////////////////// Helper functions ////////////////////////////////////

    function helper_test_approve(
        TODOOutput memory _todoOutput,
        bytes32 _initialActiveMerkleRoot,
        DeploymentStatus _expectedStatus
    )
        internal
    {
        uint256 initialNonce = module.currentNonce();
        uint256 expectedNumLeafs = _todoOutput.executionLeafsWithProofs.length + 1;
        assertEq(module.activeRoot(), _initialActiveMerkleRoot);

        bytes memory typedData = abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(TYPE_HASH, _todoOutput.merkleRoot))
        );
        vm.expectCall(
            address(safe),
            abi.encodePacked(
                safeProxy.checkSignatures.selector,
                abi.encode(keccak256(typedData), typedData, _todoOutput.ownerSignatures)
            )
        );
        vm.expectEmit(address(module));
        emit SphinxDeploymentApproved({
            merkleRoot: _todoOutput.merkleRoot,
            previousActiveRoot: _initialActiveMerkleRoot,
            nonce: initialNonce,
            executor: executor,
            numLeafs: expectedNumLeafs,
            uri: sampleDeploymentUri
        });
        if (_expectedStatus == DeploymentStatus.COMPLETED) {
            vm.expectEmit(address(module));
            emit SphinxDeploymentCompleted(_todoOutput.merkleRoot);
        }
        vm.prank(executor);
        module.approve(
            _todoOutput.merkleRoot, _todoOutput.approvalLeafWithProof, _todoOutput.ownerSignatures
        );

        (
            uint256 approvedNumLeafs,
            uint256 approvedLeafsExecuted,
            string memory approvedUri,
            address approvedExecutor,
            DeploymentStatus approvedStatus
        ) = module.deployments(_todoOutput.merkleRoot);
        assertEq(approvedNumLeafs, expectedNumLeafs);
        assertEq(approvedLeafsExecuted, 1);
        assertEq(approvedUri, sampleDeploymentUri);
        assertEq(approvedExecutor, executor);
        assertEq(uint256(approvedStatus), uint256(_expectedStatus));
        if (_expectedStatus == DeploymentStatus.COMPLETED) {
            assertEq(module.activeRoot(), bytes32(0));
        } else {
            assertEq(module.activeRoot(), _todoOutput.merkleRoot);
        }
        assertEq(module.currentNonce(), initialNonce + 1);
    }

    function helper_test_approveThenExecuteBatch(
        TODOOutput memory _todoOutput,
        bytes32 _initialActiveMerkleRoot
    )
        internal
    {
        helper_test_preExecution();

        helper_test_approve({
            _todoOutput: _todoOutput,
            _initialActiveMerkleRoot: _initialActiveMerkleRoot,
            _expectedStatus: DeploymentStatus.APPROVED
        });

        for (uint256 i = 0; i < _todoOutput.executionLeafsWithProofs.length; i++) {
            vm.expectEmit(address(module));
            emit SphinxActionSucceeded(
                _todoOutput.merkleRoot, _todoOutput.executionLeafsWithProofs[i].leaf.index
            );
        }
        vm.expectEmit(address(module));
        emit SphinxDeploymentCompleted(_todoOutput.merkleRoot);
        vm.prank(executor);
        Result[] memory results = module.execute(_todoOutput.executionLeafsWithProofs);
        assertEq(results.length, defaultTxs.length);
        assertEq(results.length, _todoOutput.executionLeafsWithProofs.length);
        for (uint256 i = 0; i < results.length; i++) {
            assertTrue(results[i].success);
            if (i == 1) {
                // The second transaction returns `myContract.myNum()`.
                assertEq(123, abi.decode(results[1].returnData, (uint256)));
            }
        }

        helper_test_postExecution(_todoOutput);
    }

    function helper_test_preExecution() internal {
        // Check the initial values of the contracts that'll be updated during the deployment.
        assertEq(myContract.myNum(), 0);
        assertFalse(myDelegateCallContract.wasDelegateCalled());
        assertEq(deployedViaCreate.code.length, 0);
        assertEq(deployedViaCreate2.code.length, 0);
        assertEq(deployedViaCreate3.code.length, 0);
        assertEq(address(myContract).balance, 0);
    }

    function helper_test_postExecution(TODOOutput memory _todoOutput) internal {
        // The expected number of leafs is equal to the number of execution leafs plus one (for the
        // approval leaf).
        uint256 expectedNumLeafs = _todoOutput.executionLeafsWithProofs.length + 1;

        // Check that the state of the `SphinxModule` was updated correctly.
        assertEq(module.activeRoot(), bytes32(0));
        (
            uint256 numLeafs,
            uint256 leafsExecuted,
            string memory uri,
            address executor_,
            DeploymentStatus status
        ) = module.deployments(_todoOutput.merkleRoot);
        assertEq(expectedNumLeafs, numLeafs);
        assertEq(leafsExecuted, numLeafs);
        assertEq(sampleDeploymentUri, uri);
        assertEq(executor, executor_);
        assertEq(uint256(status), uint256(DeploymentStatus.COMPLETED));

        // The first transaction sets the `myNum` variable in `MyContract`.
        assertEq(myContract.myNum(), 123);
        // The second transaction just returned data, which we checked earlier.
        // The third transaction triggered a delegatecall in `MyDelegateCallContract`.
        assertTrue(myDelegateCallContract.wasDelegateCalled());
        // The fourth transaction deployed a contract using `CREATE`.
        assertEq(deployedViaCreate.code, type(MyContract).runtimeCode);
        // The fifth transaction deployed a contract using `CREATE2`.
        assertEq(deployedViaCreate2.code, type(MyContract).runtimeCode);
        // The sixth transaction deployed a contract using `CREATE3`.
        assertEq(deployedViaCreate3.code, type(MyContract).runtimeCode);
        // The seventh transaction transfers 1 ether from the Gnosis Safe to `MyContract`.
        assertEq(address(myContract).balance, 1 ether);
    }

    function helper_makeTODO(SphinxTransaction memory _tx)
        internal
        view
        returns (TODOStruct memory)
    {
        SphinxTransaction[] memory txs = new SphinxTransaction[](1);
        txs[0] = _tx;
        return helper_makeTODO(txs);
    }

    function helper_makeTODO(SphinxTransaction[] memory _txs)
        internal
        view
        returns (TODOStruct memory)
    {
        return TODOStruct({
            txs: _txs,
            ownerWallets: ownerWallets,
            chainId: block.chainid,
            module: module,
            nonceInModule: module.currentNonce(),
            executor: executor,
            safeProxy: address(safe),
            deploymentUri: sampleDeploymentUri,
            forceNumLeafsValue: false,
            overridingNumLeafsValue: 0,
            forceApprovalLeafIndexNonZero: false
        });
    }

    function helper_test_execute_oneByOne(TODOOutput memory _todoOutput) internal {
        uint256 numExecutionLeafs = _todoOutput.executionLeafsWithProofs.length;
        for (uint256 i = 0; i < numExecutionLeafs; i++) {
            SphinxLeafWithProof memory executionLeafWithProof =
                _todoOutput.executionLeafsWithProofs[i];
            (, uint256 initialLeafsExecuted,,,) = module.deployments(_todoOutput.merkleRoot);

            vm.expectEmit(address(module));
            emit SphinxActionSucceeded(_todoOutput.merkleRoot, executionLeafWithProof.leaf.index);
            if (i == numExecutionLeafs - 1) {
                vm.expectEmit(address(module));
                emit SphinxDeploymentCompleted(_todoOutput.merkleRoot);
            }

            SphinxLeafWithProof[] memory executionLeafWithProofArray = new SphinxLeafWithProof[](1);
            executionLeafWithProofArray[0] = executionLeafWithProof;
            vm.prank(executor);
            Result[] memory results = module.execute(executionLeafWithProofArray);
            assertEq(results.length, 1);
            Result memory result = results[0];
            assertTrue(result.success);
            if (i == 1) {
                // The second transaction returns `myContract.myNum()`.
                assertEq(123, abi.decode(result.returnData, (uint256)));
            }
            (, uint256 leafsExecuted,,,) = module.deployments(_todoOutput.merkleRoot);
            assertEq(leafsExecuted, initialLeafsExecuted + 1);
        }
    }
}
