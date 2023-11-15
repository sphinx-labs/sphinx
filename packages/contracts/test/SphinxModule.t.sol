// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { console } from "sphinx-forge-std/console.sol";
import "sphinx-forge-std/Test.sol";
import { StdUtils } from "sphinx-forge-std/StdUtils.sol";
import { SphinxModuleFactory } from "../contracts/core/SphinxModuleFactory.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import { GnosisSafeProxyFactory } from
    "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { CreateCall } from "@gnosis.pm/safe-contracts-1.3.0/libraries/CreateCall.sol";
import { MultiSend } from "@gnosis.pm/safe-contracts-1.3.0/libraries/MultiSend.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
import {
    SphinxMerkleTree,
    SphinxLeafWithProof,
    SphinxTransaction,
    SphinxLeafType,
    DeploymentState,
    DeploymentStatus,
    SphinxLeaf
} from "../contracts/core/SphinxDataTypes.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { TestUtils } from "./TestUtils.t.sol";

contract MyContract {
    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    uint256 public myNum;
    bool public reentrancyBlocked;

    function setMyNum(uint256 _num) external {
        myNum = _num;
    }

    function get42() external pure returns (uint256) {
        return 42;
    }

    function reenter(address _to, bytes memory _data) external {
        (bool success, bytes memory retdata) = _to.call(_data);
        require(!success, "MyContract: reentrancy succeeded");
        require(
            keccak256(retdata)
                == keccak256(
                    abi.encodePacked(ERROR_SELECTOR, abi.encode("ReentrancyGuard: reentrant call"))
                ),
            "MyContract: incorrect error"
        );
        reentrancyBlocked = true;
    }

    function reverter() external pure {
        revert("MyContract: reverted");
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

abstract contract AbstractSphinxModule_Test is Test, Enum, TestUtils, SphinxModule {
    struct GnosisSafeAddresses {
        address multiSend;
        address compatibilityFallbackHandler;
        address safeProxyFactory;
        address safeSingleton;
        address createCall;
    }

    bytes internal constant CREATE3_PROXY_BYTECODE = hex"67363d3d37363d34f03d5260086018f3";

    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    SphinxModule module;

    SphinxTransaction[] defaultTxs;
    bool[] defaultExpectedSuccesses;

    Wallet[] ownerWallets;
    address[] owners;
    uint256 threshold = 3;
    address executor = address(0x1000);
    string defaultDeploymentUri = "ipfs://Qm1234";
    MyContract myContract = new MyContract();
    MyDelegateCallContract myDelegateCallContract = new MyDelegateCallContract();
    // The following addresses correspond to contracts that will be deployed during execution.
    address deployedViaCreate;
    address deployedViaCreate2;
    address deployedViaCreate3;

    function setUp(GnosisSafeAddresses memory _gnosisSafeAddresses) internal {
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
            MultiSend.multiSend.selector, abi.encodePacked(firstMultiSendData, secondMultiSendData)
        );

        bytes memory safeInitializerData = abi.encodePacked(
            GnosisSafe.setup.selector,
            abi.encode(
                owners,
                threshold,
                _gnosisSafeAddresses.multiSend,
                multiSendData,
                _gnosisSafeAddresses.compatibilityFallbackHandler,
                address(0),
                0,
                address(0)
            )
        );

        // TODO(docs): `safeProxy` is defined in `SphinxModule`, which we inherit.
        safeProxy = GnosisSafe(
            payable(
                address(
                    GnosisSafeProxyFactory(_gnosisSafeAddresses.safeProxyFactory)
                        .createProxyWithNonce(
                        _gnosisSafeAddresses.safeSingleton, safeInitializerData, 0
                    )
                )
            )
        );
        module = SphinxModule(
            moduleFactory.computeSphinxModuleAddress(address(safeProxy), address(safeProxy), 0)
        );
        // Give the Gnosis Safe 2 ether
        vm.deal(address(safeProxy), 2 ether);

        deployedViaCreate =
            computeCreateAddress(address(safeProxy), vm.getNonce(address(safeProxy)));
        deployedViaCreate2 = computeCreate2Address({
            salt: bytes32(0),
            initcodeHash: keccak256(type(MyContract).creationCode),
            deployer: address(safeProxy)
        });
        deployedViaCreate3 =
            computeCreate3Address({ _deployer: address(safeProxy), _salt: bytes32(uint256(0)) });

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
                txData: abi.encodePacked(myContract.get42.selector),
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
                to: _gnosisSafeAddresses.createCall,
                value: 0,
                txData: abi.encodePacked(
                    CreateCall.performCreate.selector, abi.encode(0, type(MyContract).creationCode)
                    ),
                operation: Operation.DelegateCall,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Contract deployment via `CREATE2`:
        defaultTxs.push(
            SphinxTransaction({
                to: _gnosisSafeAddresses.createCall,
                value: 0,
                txData: abi.encodePacked(
                    CreateCall.performCreate2.selector,
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
            deployer: address(safeProxy)
        });
        bytes memory create3ProxyDeploymentData = abi.encodeWithSelector(
            CreateCall.performCreate2.selector, abi.encode(0, CREATE3_PROXY_BYTECODE, bytes32(0))
        );
        bytes memory firstCreate3MultiSendData = abi.encodePacked(
            uint8(Operation.DelegateCall),
            _gnosisSafeAddresses.createCall,
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
                to: _gnosisSafeAddresses.multiSend,
                value: 0,
                txData: abi.encodeWithSelector(
                    MultiSend.multiSend.selector,
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

        // All of the default transactions should succeed.
        defaultExpectedSuccesses = new bool[](defaultTxs.length);
        for (uint256 i = 0; i < defaultTxs.length; i++) {
            defaultExpectedSuccesses[i] = true;
        }
    }

    function test_deploy_success() external {
        assertEq(address(module.safeProxy()), address(safeProxy));
    }

    function test_initialize_reverts_alreadyInitialized() external {
        vm.expectRevert("Initializable: contract is already initialized");
        module.initialize(address(safeProxy));
    }

    function test_initialize_reverts_invalidSafeAddress() external {
        SphinxModule m = new SphinxModule();
        vm.expectRevert("SphinxModule: invalid Safe address");
        m.initialize(address(0));
    }

    function test_initialize_success() external {
        SphinxModule m = new SphinxModule();
        assertEq(address(m.safeProxy()), address(0));
        m.initialize(address(1234));
        assertEq(address(m.safeProxy()), address(1234));
    }

    function test_approve_revert_noReentrancy() external {
        assertFalse(myContract.reentrancyBlocked());

        // TODO(docs): Create a transaction that will cause the Gnosis Safe to call the `approve`
        // function in the `SphinxModule`. This should trigger a re-entrancy error.
        ModuleInputs memory defaultModuleInputs =
            getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        bytes memory approvalData = abi.encodePacked(
            module.approve.selector,
            abi.encode(
                defaultModuleInputs.merkleRoot,
                defaultModuleInputs.approvalLeafWithProof,
                defaultModuleInputs.ownerSignatures
            )
        );
        ModuleInputs memory moduleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(
                (
                    SphinxTransaction({
                        to: address(myContract),
                        value: 0,
                        // TODO(docs): encdoe the call to the 'approval' function on the
                        // SphinxModule.
                        // The approval function's args don't matter  because the call will revert
                        // before they're used.
                        txData: abi.encodeWithSelector(
                            myContract.reenter.selector, module, approvalData
                            ),
                        operation: Operation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(executor);
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        module.execute(moduleInputs.executionLeafsWithProofs);
        vm.stopPrank();

        assertTrue(myContract.reentrancyBlocked());
    }

    function test_approve_revert_zeroHashMerkleRoot() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid root");
        module.approve({
            _root: bytes32(0), // Invalid Merkle root
            _leafWithProof: moduleInputs.approvalLeafWithProof,
            _signatures: moduleInputs.ownerSignatures
        });
    }

    function test_approve_revert_rootAlreadyUsed() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));

        helper_test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED
        });

        vm.prank(executor);
        vm.expectRevert("SphinxModule: root already approved");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafChainID() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));

        moduleInputs.approvalLeafWithProof.leaf.chainId += 1;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafIndex() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        moduleInputs.approvalLeafWithProof.leaf.index += 1;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafType() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        moduleInputs.approvalLeafWithProof.leaf.leafType = SphinxLeafType.EXECUTE;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafData() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        moduleInputs.approvalLeafWithProof.leaf.data =
            abi.encodePacked(moduleInputs.approvalLeafWithProof.leaf.data, hex"00");
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidMerkleProof() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        moduleInputs.approvalLeafWithProof.proof[0] = bytes32(0);
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidMerkleRoot() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.approve(
            bytes32(uint256(1)), moduleInputs.approvalLeafWithProof, moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidLeafType() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        // TODO(docs): Attempt to approve an `EXECUTE` leaf
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.executionLeafsWithProofs[0],
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidChainID() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.chainId(block.chainid + 1);
        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid chain id");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidLeafIndex() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.forceApprovalLeafIndexNonZero = true;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidSafeProxy() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.safeProxy = address(0x1234);
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid SafeProxy");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidModule() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.module = SphinxModule(address(0x1234));
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid SphinxModule");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidNonce() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.nonceInModule = module.currentNonce() + 1;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid nonce");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_numLeafsIsZero() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.forceNumLeafsValue = true;
        treeInputs.overridingNumLeafsValue = 0;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: numLeafs cannot be 0");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidExecutor() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        // Prank an address that isn't the executor
        vm.prank(address(0x1234));
        vm.expectRevert("SphinxModule: caller isn't executor");
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_checkSignatures_emptyOwnerSignatures() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.expectRevert("GS020"); // In Gnosis Safe v1.3.0, this error means "Signatures data too
        // short".
        vm.prank(executor);
        module.approve(moduleInputs.merkleRoot, moduleInputs.approvalLeafWithProof, new bytes(0));
    }

    function test_approve_success() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });
    }

    function test_approve_success_emptyURI() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.deploymentUri = "";
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: ""
        });
    }

    function test_approve_success_multipleApprovals() external {
        ModuleInputs memory firstModuleInputs =
            getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: firstModuleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED
        });

        ModuleInputs memory moduleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(
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
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });
    }

    function test_approve_success_cancelActiveMerkleRoot() external {
        ModuleInputs memory initialModuleInputs =
            getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: initialModuleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        // We use slightly different data so that the new Merkle root is different.
        ModuleInputs memory newModuleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(
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

        emit SphinxDeploymentCancelled(initialModuleInputs.merkleRoot);
        helper_test_approve({
            _moduleInputs: newModuleInputs,
            _expectedInitialActiveMerkleRoot: initialModuleInputs.merkleRoot,
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        (,,,, DeploymentStatus initialRootStatus) =
            module.deployments(initialModuleInputs.merkleRoot);
        assertEq(initialRootStatus, DeploymentStatus.CANCELLED);
    }

    function test_approve_success_emptyDeployment() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        delete treeInputs.txs;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        // Run some sanity checks before submitting the approval.
        assertEq(moduleInputs.executionLeafsWithProofs.length, 0);
        assertEq(moduleInputs.approvalLeafWithProof.proof.length, 0);

        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.COMPLETED,
            _expectedDeploymentUri: defaultDeploymentUri
        });
    }

    //////////////////////////////// execute ////////////////////////////////////

    function test_execute_revert_noReentrancy() external {
        assertFalse(myContract.reentrancyBlocked());

        // TODO(docs): Create a transaction that will cause the Gnosis Safe to call the `approve`
        // function in the `SphinxModule`. This should trigger a re-entrancy error.
        ModuleInputs memory defaultModuleInputs =
            getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        bytes memory executionData = abi.encodePacked(
            module.execute.selector, abi.encode(defaultModuleInputs.executionLeafsWithProofs)
        );
        ModuleInputs memory moduleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(
                (
                    SphinxTransaction({
                        to: address(myContract),
                        value: 0,
                        // TODO(docs): encdoe the call to the 'approval' function on the
                        // SphinxModule.
                        // The function's args don't matter  because the call will revert
                        // before they're used.
                        txData: abi.encodeWithSelector(
                            myContract.reenter.selector, module, executionData
                            ),
                        operation: Operation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(executor);
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        module.execute(moduleInputs.executionLeafsWithProofs);
        vm.stopPrank();

        assertTrue(myContract.reentrancyBlocked());
    }

    function test_execute_revert_noLeafsToExecute() external {
        vm.expectRevert("SphinxModule: no leafs to execute");
        module.execute(new SphinxLeafWithProof[](0));
    }

    function test_execute_revert_noActiveRoot() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.expectRevert("SphinxModule: no active root");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_revert_invalidExecutor() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });
        // Prank an address that isn't the executor
        vm.prank(address(0x1234));
        vm.expectRevert("SphinxModule: caller isn't executor");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_revert_extraLeafsNotAllowed() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.forceNumLeafsValue = true;
        treeInputs.overridingNumLeafsValue = 2; // TODO(docs): approval leaf and first execution
        // leaf.
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);
        vm.prank(executor);
        // TODO(docs): we don't use `helper_test_approve` here because we've modified the `numLeafs`
        // in this test, which would cause the helper function to fail.
        module.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        // Sanity check that the approval was successful.
        assertEq(module.activeRoot(), moduleInputs.merkleRoot);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: extra leafs not allowed");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafChainID() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        moduleInputs.executionLeafsWithProofs[0].leaf.chainId += 1;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafIndex() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        moduleInputs.executionLeafsWithProofs[0].leaf.index += 1;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafType() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        moduleInputs.executionLeafsWithProofs[0].leaf.leafType = SphinxLeafType.APPROVE;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafData() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        moduleInputs.executionLeafsWithProofs[0].leaf.data =
            abi.encodePacked(moduleInputs.executionLeafsWithProofs[0].leaf.data, hex"00");
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidMerkleProof() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        moduleInputs.executionLeafsWithProofs[0].proof[0] = bytes32(0);
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    // TODO(docs): unlike the approval test suite, we don't do
    // test_execute_revert_merkleProofVerify_invalidMerkleRoot because the Merkle root is stored as
    // a state variable in the SphinxModule after the `approve` function. in other words, we
    // can't pass in an invalid Merkle root to the `execute` function.

    function test_execute_revert_invalidLeafType() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });
        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        // TODO(docs): Attempt to approve an `APPROVE` leaf
        SphinxLeafWithProof[] memory approvalLeafsWithProofs = new SphinxLeafWithProof[](1);
        approvalLeafsWithProofs[0] = moduleInputs.approvalLeafWithProof;
        module.execute(approvalLeafsWithProofs);
    }

    function test_execute_revert_invalidChainID() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });
        vm.chainId(block.chainid + 1);
        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid chain id");
        module.execute(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_revert_invalidLeafIndex() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        // Execute the second `EXECUTE` leaf without executing the first.
        SphinxLeafWithProof[] memory executionLeafWithProof = new SphinxLeafWithProof[](1);
        executionLeafWithProof[0] = moduleInputs.executionLeafsWithProofs[1];
        module.execute(executionLeafWithProof);
    }

    function test_execute_revert_insufficientGas() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        vm.prank(executor);
        vm.expectRevert("SphinxModule: insufficient gas");
        module.execute{ gas: 1_500_000 }(moduleInputs.executionLeafsWithProofs);
    }

    function test_execute_fail_userTransactionReverted() external {
        defaultTxs[1].txData = abi.encodePacked(myContract.reverter.selector);
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        vm.expectEmit(address(module));
        emit SphinxActionFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 2 // Second execution leaf
         });
        vm.expectEmit(address(module));
        emit SphinxDeploymentFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 2 // Second execution leaf
         });
        vm.prank(executor);
        DeploymentStatus executionFinalStatus =
            module.execute(moduleInputs.executionLeafsWithProofs);

        (, uint256 leafsExecuted,,, DeploymentStatus deploymentStateStatus) =
            module.deployments(moduleInputs.merkleRoot);
        assertEq(executionFinalStatus, DeploymentStatus.FAILED);
        assertEq(executionFinalStatus, deploymentStateStatus);
        assertEq(module.activeRoot(), bytes32(0));
        // Only the approval leaf and the first two execution leafs were executed.
        assertEq(leafsExecuted, 3);
    }

    // TODO(docs): this triggers the 'catch' statement in the try/catch inside SphinxModule.
    function test_execute_fail_insufficientUserTxGas() external {
        // Check that the user's transactions haven't been executed.
        helper_test_preExecution();

        defaultTxs[0].gas = 1_000;
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));

        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        vm.expectEmit(address(module));
        emit SphinxActionFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 1 // First execution leaf
         });
        vm.expectEmit(address(module));
        emit SphinxDeploymentFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 1 // First execution leaf
         });
        vm.prank(executor);
        DeploymentStatus executionFinalStatus =
            module.execute(moduleInputs.executionLeafsWithProofs);

        (, uint256 leafsExecuted,,, DeploymentStatus deploymentStateStatus) =
            module.deployments(moduleInputs.merkleRoot);
        assertEq(deploymentStateStatus, DeploymentStatus.FAILED);
        assertEq(executionFinalStatus, DeploymentStatus.FAILED);
        assertEq(module.activeRoot(), bytes32(0));
        assertEq(leafsExecuted, 2); // The first execution leaf was executed, as well as the
        // approval leaf.

        // Check that the user's transactions weren't executed.
        helper_test_preExecution();
    }

    // Execute all of the user's transactions in a single call.
    function test_execute_success_batchExecute() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED
        });
    }

    // Execute the user's transactions one at a time.
    function test_execute_success_oneByOne() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));

        helper_test_preExecution();

        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        helper_test_execute_oneByOne(moduleInputs);

        helper_test_postExecution(moduleInputs);
    }

    function test_execute_success_oneExecutionLeaf() external {
        assertEq(myContract.myNum(), 0);
        SphinxTransaction[] memory txn = new SphinxTransaction[](1);
        txn[0] = defaultTxs[0];
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(txn));

        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        helper_test_execute_oneByOne(moduleInputs);

        assertEq(myContract.myNum(), 123);
    }

    function test_execute_success_noRequireSuccess() external {
        // TODO(docs): the first tx will yield 'success == false, requireSuccess == false' in the
        // SphinxModule. TODO(docs): the next set of txs will yield success == true, requireSuccess
        // == false. this covers 2/4 cases in SphinxModule: if (!success && requireSuccess).
        // 'success == false, requireSuccess == true' is covered in
        // `test_execute_fail_userTransactionReverted`. the last case (both == true) is covered
        // in any test that starts with `test_execute_success`.
        SphinxTransaction[] memory txs = new SphinxTransaction[](defaultTxs.length + 1);
        bool[] memory expectedSuccesses = new bool[](defaultTxs.length + 1);
        txs[0] = SphinxTransaction({
            to: address(myContract),
            value: 0,
            txData: abi.encodePacked(myContract.reverter.selector), // Will revert
            operation: Operation.Call,
            gas: 1_000_000,
            requireSuccess: false // Don't require success
         });
        expectedSuccesses[0] = false;
        for (uint256 i = 0; i < defaultTxs.length; i++) {
            txs[i + 1] = defaultTxs[i];
            txs[i + 1].requireSuccess = false;
            expectedSuccesses[i + 1] = true;
        }
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(txs));
        helper_test_approveThenExecuteBatch({
            _txs: txs,
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedSuccesses: expectedSuccesses,
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED
        });
    }

    //////////////////////////////// _getLeafHash ////////////////////////////////////

    function test__getLeafHash_success() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        SphinxLeaf memory approvalLeaf = moduleInputs.approvalLeafWithProof.leaf;
        bytes32 expected = keccak256(abi.encodePacked(keccak256(abi.encode(approvalLeaf))));
        assertEq(expected, _getLeafHash(approvalLeaf));
    }

    //////////////////////////////// Helper functions ////////////////////////////////////

    function helper_test_approve(
        ModuleInputs memory _moduleInputs,
        bytes32 _expectedInitialActiveMerkleRoot,
        DeploymentStatus _expectedStatus,
        string memory _expectedDeploymentUri
    )
        internal
    {
        uint256 initialNonce = module.currentNonce();
        uint256 expectedNumLeafs = _moduleInputs.executionLeafsWithProofs.length + 1;
        assertEq(module.activeRoot(), _expectedInitialActiveMerkleRoot);

        bytes memory typedData = abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(TYPE_HASH, _moduleInputs.merkleRoot))
        );
        vm.expectCall(
            address(safeProxy),
            abi.encodePacked(
                safeProxy.checkSignatures.selector,
                abi.encode(keccak256(typedData), typedData, _moduleInputs.ownerSignatures)
            )
        );
        vm.expectEmit(address(module));
        emit SphinxDeploymentApproved({
            merkleRoot: _moduleInputs.merkleRoot,
            previousActiveRoot: _expectedInitialActiveMerkleRoot,
            nonce: initialNonce,
            executor: executor,
            numLeafs: expectedNumLeafs,
            uri: _expectedDeploymentUri
        });
        if (_expectedStatus == DeploymentStatus.COMPLETED) {
            vm.expectEmit(address(module));
            emit SphinxDeploymentCompleted(_moduleInputs.merkleRoot);
        }
        vm.prank(executor);
        module.approve(
            _moduleInputs.merkleRoot,
            _moduleInputs.approvalLeafWithProof,
            _moduleInputs.ownerSignatures
        );

        (
            uint256 approvedNumLeafs,
            uint256 approvedLeafsExecuted,
            string memory approvedUri,
            address approvedExecutor,
            DeploymentStatus approvedStatus
        ) = module.deployments(_moduleInputs.merkleRoot);
        assertEq(approvedNumLeafs, expectedNumLeafs);
        assertEq(approvedLeafsExecuted, 1);
        assertEq(approvedUri, _expectedDeploymentUri);
        assertEq(approvedExecutor, executor);
        assertEq(approvedStatus, _expectedStatus);
        if (_expectedStatus == DeploymentStatus.COMPLETED) {
            assertEq(module.activeRoot(), bytes32(0));
        } else {
            assertEq(module.activeRoot(), _moduleInputs.merkleRoot);
        }
        assertEq(module.currentNonce(), initialNonce + 1);
    }

    function helper_test_approveThenExecuteBatch(
        SphinxTransaction[] memory _txs,
        ModuleInputs memory _moduleInputs,
        bool[] memory _expectedSuccesses,
        DeploymentStatus _expectedFinalDeploymentStatus,
        bytes32 _expectedInitialActiveMerkleRoot
    )
        internal
    {
        // Sanity check
        assertEq(_txs.length, _expectedSuccesses.length);

        helper_test_preExecution();

        helper_test_approve({
            _moduleInputs: _moduleInputs,
            _expectedInitialActiveMerkleRoot: _expectedInitialActiveMerkleRoot,
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri
        });

        for (uint256 i = 0; i < _moduleInputs.executionLeafsWithProofs.length; i++) {
            SphinxLeafWithProof memory leafWithProof = _moduleInputs.executionLeafsWithProofs[i];
            bool expectSuccess = _expectedSuccesses[i];
            vm.expectEmit(address(module));
            if (expectSuccess) {
                emit SphinxActionSucceeded(_moduleInputs.merkleRoot, leafWithProof.leaf.index);
            } else {
                emit SphinxActionFailed(_moduleInputs.merkleRoot, leafWithProof.leaf.index);
            }
        }
        vm.expectEmit(address(module));
        emit SphinxDeploymentCompleted(_moduleInputs.merkleRoot);
        vm.prank(executor);
        DeploymentStatus status = module.execute(_moduleInputs.executionLeafsWithProofs);
        assertEq(status, _expectedFinalDeploymentStatus);

        helper_test_postExecution(_moduleInputs);
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

    function helper_test_postExecution(ModuleInputs memory _moduleInputs) internal {
        // The expected number of leafs is equal to the number of execution leafs plus one (for the
        // approval leaf).
        uint256 expectedNumLeafs = _moduleInputs.executionLeafsWithProofs.length + 1;

        // Check that the state of the `SphinxModule` was updated correctly.
        assertEq(module.activeRoot(), bytes32(0));
        (
            uint256 numLeafs,
            uint256 leafsExecuted,
            string memory uri,
            address executor_,
            DeploymentStatus status
        ) = module.deployments(_moduleInputs.merkleRoot);
        assertEq(expectedNumLeafs, numLeafs);
        assertEq(leafsExecuted, numLeafs);
        assertEq(defaultDeploymentUri, uri);
        assertEq(executor, executor_);
        assertEq(status, DeploymentStatus.COMPLETED);

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

    function helper_makeMerkleTreeInputs(SphinxTransaction memory _tx)
        internal
        view
        returns (MerkleTreeInputs memory)
    {
        SphinxTransaction[] memory txs = new SphinxTransaction[](1);
        txs[0] = _tx;
        return helper_makeMerkleTreeInputs(txs);
    }

    function helper_makeMerkleTreeInputs(SphinxTransaction[] memory _txs)
        internal
        view
        returns (MerkleTreeInputs memory)
    {
        return MerkleTreeInputs({
            txs: _txs,
            ownerWallets: ownerWallets,
            chainId: block.chainid,
            module: module,
            nonceInModule: module.currentNonce(),
            executor: executor,
            safeProxy: address(safeProxy),
            deploymentUri: defaultDeploymentUri,
            forceNumLeafsValue: false,
            overridingNumLeafsValue: 0,
            forceApprovalLeafIndexNonZero: false
        });
    }

    function helper_test_execute_oneByOne(ModuleInputs memory _moduleInputs) internal {
        uint256 numExecutionLeafs = _moduleInputs.executionLeafsWithProofs.length;
        uint256 finalExecutionLeafIndex = numExecutionLeafs - 1;
        for (uint256 i = 0; i < numExecutionLeafs; i++) {
            SphinxLeafWithProof memory executionLeafWithProof =
                _moduleInputs.executionLeafsWithProofs[i];
            (, uint256 initialLeafsExecuted,,,) = module.deployments(_moduleInputs.merkleRoot);

            vm.expectEmit(address(module));
            emit SphinxActionSucceeded(_moduleInputs.merkleRoot, executionLeafWithProof.leaf.index);
            if (i == finalExecutionLeafIndex) {
                vm.expectEmit(address(module));
                emit SphinxDeploymentCompleted(_moduleInputs.merkleRoot);
            }

            SphinxLeafWithProof[] memory executionLeafWithProofArray = new SphinxLeafWithProof[](1);
            executionLeafWithProofArray[0] = executionLeafWithProof;
            vm.prank(executor);
            DeploymentStatus status = module.execute(executionLeafWithProofArray);
            if (i == finalExecutionLeafIndex) {
                assertEq(status, DeploymentStatus.COMPLETED);
            } else {
                assertEq(status, DeploymentStatus.APPROVED);
            }
            (, uint256 leafsExecuted,,,) = module.deployments(_moduleInputs.merkleRoot);
            assertEq(leafsExecuted, initialLeafsExecuted + 1);
        }
    }

    function assertEq(DeploymentStatus a, DeploymentStatus b) internal pure {
        require(uint256(a) == uint256(b), "DeploymentStatus mismatch");
    }
}

contract SphinxModule_GnosisSafe_L1_1_3_0_Test is AbstractSphinxModule_Test {
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxModule_Test.setUp(
            GnosisSafeAddresses({
                multiSend: address(safeContracts.multiSend),
                compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
                safeProxyFactory: address(safeContracts.safeProxyFactory),
                safeSingleton: address(safeContracts.safeL1Singleton),
                createCall: address(safeContracts.createCall)
            })
        );
    }
}

contract SphinxModule_GnosisSafe_L2_1_3_0_Test is AbstractSphinxModule_Test {
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxModule_Test.setUp(
            GnosisSafeAddresses({
                multiSend: address(safeContracts.multiSend),
                compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
                safeProxyFactory: address(safeContracts.safeProxyFactory),
                safeSingleton: address(safeContracts.safeL2Singleton),
                createCall: address(safeContracts.createCall)
            })
        );
    }
}

contract SphinxModule_GnosisSafe_L1_1_4_1_Test is AbstractSphinxModule_Test {
    function setUp() public {
        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        AbstractSphinxModule_Test.setUp(
            GnosisSafeAddresses({
                multiSend: address(safeContracts.multiSend),
                compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
                safeProxyFactory: address(safeContracts.safeProxyFactory),
                safeSingleton: address(safeContracts.safeL1Singleton),
                createCall: address(safeContracts.createCall)
            })
        );
    }
}

contract SphinxModule_GnosisSafe_L2_1_4_1_Test is AbstractSphinxModule_Test {
    function setUp() public {
        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        AbstractSphinxModule_Test.setUp(
            GnosisSafeAddresses({
                multiSend: address(safeContracts.multiSend),
                compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
                safeProxyFactory: address(safeContracts.safeProxyFactory),
                safeSingleton: address(safeContracts.safeL2Singleton),
                createCall: address(safeContracts.createCall)
            })
        );
    }
}
