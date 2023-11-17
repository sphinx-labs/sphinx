// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "sphinx-forge-std/Test.sol";
import { StdUtils } from "sphinx-forge-std/StdUtils.sol";
import { SphinxModuleProxyFactory } from "../contracts/core/SphinxModuleProxyFactory.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import {
    GnosisSafeProxyFactory
} from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { CreateCall } from "@gnosis.pm/safe-contracts-1.3.0/libraries/CreateCall.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";
import { MultiSend } from "@gnosis.pm/safe-contracts-1.3.0/libraries/MultiSend.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
import {
    SphinxLeafWithProof,
    SphinxLeafType,
    DeploymentState,
    DeploymentStatus,
    SphinxLeaf
} from "../contracts/core/SphinxDataTypes.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { TestUtils } from "./TestUtils.t.sol";
import { MyContract, MyDelegateCallContract } from "./helpers/MyTestContracts.t.sol";

/**
 * @notice An abstract contract that contains all of the unit tests for the `SphinxModuleProxy`.
 *         Since a `SphinxModuleProxy` is a minimal EIP-1167 proxy that delegates all calls
 *         to a `SphinxModule` implementation, this file serves as the test suite for the
 *         `SphinxModule`.
 *
 *         This contract is inherited by four contracts, which are at the bottom of this file.
 *         Each of the four contracts is for testing a different type of Gnosis Safe against
 *         a `SphinxModuleProxy`. These four Gnosis Safes are:
 *         1. `GnosisSafe` from Gnosis Safe v1.3.0
 *         2. `GnosisSafeL2` from Gnosis Safe v1.3.0
 *         3. `Safe` from Gnosis Safe v1.4.1
 *         4. `SafeL2` from Gnosis Safe v1.4.1
 *
 *         Since all of the test functions in this contract are public, they'll run for each
 *         version of Gnosis Safe, ensuring that the `SphinxModuleProxy` is compatible with
 *         each type.
 */
abstract contract AbstractSphinxModuleProxy_Test is Test, Enum, TestUtils, SphinxModule {
    /**
     * @notice The addresses of several Gnosis Safe contracts that'll be used in this
     *         test suite.
     */
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

    SphinxModule moduleProxy;

    // The default set of transactions that'll be executed in the Gnosis Safe.
    SphinxTransaction[] defaultTxs;
    // Whether we expect a success or failure for each default transaction. There is one element in
    // this array for each element in `defaultTxs`.
    bool[] defaultExpectedSuccesses;

    Wallet[] ownerWallets;
    address[] owners;
    address executor = address(0x1000);
    string defaultDeploymentUri = "ipfs://Qm1234";

    // Deploy the test contracts.
    MyContract myContract = new MyContract();
    MyDelegateCallContract myDelegateCallContract = new MyDelegateCallContract();

    // The following addresses correspond to contracts that will be deployed during execution.
    address deployedViaCreate;
    address deployedViaCreate2;
    address deployedViaCreate3;

    function setUp(GnosisSafeAddresses memory _gnosisSafeAddresses) internal {
        SphinxModuleProxyFactory moduleProxyFactory = new SphinxModuleProxyFactory();

        Wallet[] memory wallets = getSphinxWalletsSortedByAddress(5);
        // We can't assign the wallets directly to the `owners` array because Solidity throws an
        // error if we try to assign a memory array to a storage array. So, instead, we have to
        // iterate over the memory array and push each element to the storage array.
        for (uint256 i = 0; i < wallets.length; i++) {
            ownerWallets.push(wallets[i]);
            owners.push(wallets[i].addr);
        }

        // In a single transaction, we'll deploy the Gnosis Safe, deploy the `SphinxModuleProxy`,
        // and enable the `SphinxModuleProxy` in the Gnosis Safe. We'll do this by encoding all of
        // this information into the `initializer` data that'll be submitted to the Gnosis Safe
        // Proxy Factory. Specifically, we'll use Gnosis Safe's `MultiSend` contract to execute
        // two transactions on the `SphinxModuleProxyFactory`:
        // 1. `deploySphinxModuleProxyFromSafe`
        // 2. `enableSphinxModuleProxyFromSafe`

        // Create the first transaction, `SphinxModuleProxyFactory.deploySphinxModuleProxyFromSafe`.
        bytes memory encodedDeployModuleCall = abi.encodeWithSelector(
            moduleProxyFactory.deploySphinxModuleProxyFromSafe.selector,
            // Use the zero-hash as the salt.
            bytes32(0)
        );
        // Encode the first transaction data in a format that can be executed using `MultiSend`.
        bytes memory firstMultiSendData = abi.encodePacked(
            // We use `Call` so that the deployer of the `SphinxModuleProxy` is the
            // `SphinxModuleProxyFactory`. This makes it easier for off-chain tooling to calculate
            // the deployed `SphinxModuleProxy` address.
            uint8(Operation.Call),
            moduleProxyFactory,
            uint256(0),
            encodedDeployModuleCall.length,
            encodedDeployModuleCall
        );
        // Create the second transaction,
        // `SphinxModuleProxyFactory.enableSphinxModuleProxyFromSafe`.
        bytes memory encodedEnableModuleCall = abi.encodeWithSelector(
            moduleProxyFactory.enableSphinxModuleProxyFromSafe.selector,
            // Use the zero-hash as the salt.
            bytes32(0)
        );
        // Encode the second transaction data in a format that can be executed using `MultiSend`.
        bytes memory secondMultiSendData = abi.encodePacked(
            uint8(Operation.DelegateCall),
            moduleProxyFactory,
            uint256(0),
            encodedEnableModuleCall.length,
            encodedEnableModuleCall
        );
        // Encode the entire `MultiSend` data.
        bytes memory multiSendData = abi.encodeWithSelector(
            MultiSend.multiSend.selector,
            abi.encodePacked(firstMultiSendData, secondMultiSendData)
        );

        // Encode the call to the Gnosis Safe's `setup` function, which we'll submit to the Gnosis
        // Safe Proxy Factory. This data contains the `MultiSend` data that we created above.
        bytes memory safeInitializerData = abi.encodePacked(
            GnosisSafe.setup.selector,
            abi.encode(
                owners,
                3, // Gnosis Safe owner threshold
                _gnosisSafeAddresses.multiSend,
                multiSendData,
                _gnosisSafeAddresses.compatibilityFallbackHandler,
                address(0),
                0,
                address(0)
            )
        );

        // This is the transaction that deploys the Gnosis Safe, deploys the `SphinxModuleProxy`, and
        // enables the `SphinxModuleProxy` in the Gnosis Safe.
        GnosisSafeProxy deployedSafeProxy = GnosisSafeProxyFactory(
            _gnosisSafeAddresses.safeProxyFactory
        ).createProxyWithNonce(_gnosisSafeAddresses.safeSingleton, safeInitializerData, 0);

        safeProxy = GnosisSafe(payable(address(deployedSafeProxy)));
        moduleProxy = SphinxModule(
            moduleProxyFactory.computeSphinxModuleProxyAddress(
                address(safeProxy),
                address(safeProxy),
                0
            )
        );
        // Give the Gnosis Safe 2 ether
        vm.deal(address(safeProxy), 2 ether);

        deployedViaCreate = computeCreateAddress(
            address(safeProxy),
            vm.getNonce(address(safeProxy))
        );
        deployedViaCreate2 = computeCreate2Address({
            salt: bytes32(0),
            initcodeHash: keccak256(type(MyContract).creationCode),
            deployer: address(safeProxy)
        });
        deployedViaCreate3 = computeCreate3Address({
            _deployer: address(safeProxy),
            _salt: bytes32(uint256(0))
        });

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
                    CreateCall.performCreate.selector,
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
        // Contract deployment via `CREATE3`. We use Gnosis Safe's `MultiSend` to submit two
        // transactions:
        // 1. Deploy a minimal `CREATE3` proxy using `CREATE2`. The `CREATE2` logic exists on Gnosis
        //    Safe's `CreateCall` contract.
        // 2. Call the deployed `CREATE3` proxy with the relevant contract's creation code.
        bytes memory create3ProxyDeploymentData = abi.encodeWithSelector(
            CreateCall.performCreate2.selector,
            abi.encode(0, CREATE3_PROXY_BYTECODE, bytes32(0))
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
            computeCreate2Address({
                salt: bytes32(0),
                initcodeHash: keccak256(CREATE3_PROXY_BYTECODE),
                deployer: address(safeProxy)
            }),
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
        assertEq(address(moduleProxy.safeProxy()), address(safeProxy));
    }

    function test_initialize_reverts_alreadyInitialized() external {
        vm.expectRevert("Initializable: contract is already initialized");
        moduleProxy.initialize(address(safeProxy));
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

        // In this test, we'll create a transaction that will cause the Gnosis Safe to call the
        // `reenter` function on `MyContract, which will then call the `approve` function in the
        // `SphinxModule`. This should trigger a re-entrancy error.

        ModuleInputs memory defaultModuleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(defaultTxs)
        );
        bytes memory approvalData = abi.encodePacked(
            moduleProxy.approve.selector,
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
                        // Encode the call to the `approve` function on the `SphinxModuleProxy`.
                        // This function's arguments don't matter because the call will revert
                        // before they're used.
                        txData: abi.encodeWithSelector(
                            myContract.reenter.selector,
                            moduleProxy,
                            approvalData
                        ),
                        operation: Operation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(executor);
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
        vm.stopPrank();

        assertTrue(myContract.reentrancyBlocked());
    }

    function test_approve_revert_zeroHashMerkleRoot() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid root");
        moduleProxy.approve({
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
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED,
            _expectedArbitraryChain: false
        });

        vm.prank(executor);
        vm.expectRevert("SphinxModule: root already approved");
        moduleProxy.approve(
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
        moduleProxy.approve(
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
        moduleProxy.approve(
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
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafData() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        moduleInputs.approvalLeafWithProof.leaf.data = abi.encodePacked(
            moduleInputs.approvalLeafWithProof.leaf.data,
            hex"00"
        );
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.approve(
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
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidMerkleRoot() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.approve(
            bytes32(uint256(1)),
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidLeafType() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        // Attempt to approve an `EXECUTE` leaf instead of an `APPROVE` leaf.
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.executionLeavesWithProofs[0],
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidLeafIndex() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.forceApprovalLeafIndexNonZero = true;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        moduleProxy.approve(
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
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidModule() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.moduleProxy = SphinxModule(address(0x1234));
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid SphinxModuleProxy");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidNonce() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.nonceInModuleProxy = moduleProxy.currentNonce() + 1;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid nonce");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_numLeavesIsZero() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.forceNumLeavesValue = true;
        treeInputs.overridingNumLeavesValue = 0;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: numLeaves cannot be 0");
        moduleProxy.approve(
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
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidChainID() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.chainId(block.chainid + 1);
        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid chain id");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_checkSignatures_emptyOwnerSignatures() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        // This error is thrown by the Gnosis Safe. It means "Signatures data too short".
        vm.expectRevert("GS020");
        vm.prank(executor);
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            new bytes(0)
        );
    }

    function test_approve_success() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
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
            _expectedDeploymentUri: "",
            _expectedArbitraryChain: false
        });
    }

    function test_approve_success_multipleApprovals() external {
        ModuleInputs memory firstModuleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(defaultTxs)
        );
        helper_test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: firstModuleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED,
            _expectedArbitraryChain: false
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
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
    }

    function test_approve_success_cancelActiveMerkleRoot() external {
        ModuleInputs memory initialModuleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(defaultTxs)
        );
        helper_test_approve({
            _moduleInputs: initialModuleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
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
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        (, , , , DeploymentStatus initialRootStatus, ) = moduleProxy.deployments(
            initialModuleInputs.merkleRoot
        );
        assertEq(initialRootStatus, DeploymentStatus.CANCELLED);
    }

    function test_approve_success_emptyDeployment() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        delete treeInputs.txs;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);

        // Run some sanity checks before submitting the approval.
        assertEq(moduleInputs.executionLeavesWithProofs.length, 0);
        assertEq(moduleInputs.approvalLeafWithProof.proof.length, 0);

        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.COMPLETED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
    }

    //////////////////////////////// execute ////////////////////////////////////

    function test_execute_revert_noReentrancy() external {
        assertFalse(myContract.reentrancyBlocked());

        // In this test, we'll create a transaction that will cause the Gnosis Safe to call the
        // `reenter` function on `MyContract, which will then call the `execute` function in the
        // `SphinxModule`. This should trigger a re-entrancy error.

        ModuleInputs memory defaultModuleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(defaultTxs)
        );
        bytes memory executionData = abi.encodePacked(
            moduleProxy.execute.selector,
            abi.encode(defaultModuleInputs.executionLeavesWithProofs)
        );
        ModuleInputs memory moduleInputs = getModuleInputs(
            helper_makeMerkleTreeInputs(
                (
                    SphinxTransaction({
                        to: address(myContract),
                        value: 0,
                        // Encode the call to the `execute` function on the `SphinxModuleProxy`.
                        // This function's arguments don't matter because the call will revert
                        // before they're used.
                        txData: abi.encodeWithSelector(
                            myContract.reenter.selector,
                            moduleProxy,
                            executionData
                        ),
                        operation: Operation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(executor);
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
        vm.stopPrank();

        assertTrue(myContract.reentrancyBlocked());
    }

    function test_execute_revert_noLeavesToExecute() external {
        vm.expectRevert("SphinxModule: no leaves to execute");
        moduleProxy.execute(new SphinxLeafWithProof[](0));
    }

    function test_execute_revert_noactiveMerkleRoot() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        vm.expectRevert("SphinxModule: no active root");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_invalidExecutor() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
        // Prank an address that isn't the executor
        vm.prank(address(0x1234));
        vm.expectRevert("SphinxModule: caller isn't executor");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_extraLeavesNotAllowed() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.forceNumLeavesValue = true;
        // Set the overriding `numLeaves` to be equal to the number of `EXECUTE` leaves. This is one
        // less than its normal value, since `numLeaves` normally includes the `APPROVE` leaf.
        treeInputs.overridingNumLeavesValue = defaultTxs.length;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);
        vm.prank(executor);
        // Call the `approve` function. We don't use `helper_test_approve` here because we've
        // modified the `numLeaves` in this test, which would cause this helper function to fail.
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        // Sanity check that the approval was successful.
        assertEq(moduleProxy.activeMerkleRoot(), moduleInputs.merkleRoot);

        vm.prank(executor);
        vm.expectRevert("SphinxModule: extra leaves not allowed");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafChainID() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].leaf.chainId += 1;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafIndex() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].leaf.index += 1;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafType() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].leaf.leafType = SphinxLeafType.APPROVE;
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafData() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].leaf.data = abi.encodePacked(
            moduleInputs.executionLeavesWithProofs[0].leaf.data,
            hex"00"
        );
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidMerkleProof() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].proof[0] = bytes32(0);
        vm.prank(executor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    // At this point in the test suite for the `approve` function, we create a test called
    // `test_execute_revert_merkleProofVerify_invalidMerkleRoot`. We don't do that here because the
    // Merkle root is stored as a state variable in the SphinxModule after the `approve` function.
    // In other words, we can't pass an invalid Merkle root into the `execute` function.

    function test_execute_revert_invalidLeafType() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        // Attempt to approve an `APPROVE` leaf instead of an `EXECUTE` leaf.
        SphinxLeafWithProof[] memory approvalLeavesWithProofs = new SphinxLeafWithProof[](1);
        approvalLeavesWithProofs[0] = moduleInputs.approvalLeafWithProof;
        moduleProxy.execute(approvalLeavesWithProofs);
    }

    function test_execute_revert_invalidChainID() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
        vm.chainId(block.chainid + 1);
        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid chain id");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_invalidLeafIndex() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.prank(executor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        // Execute the second `EXECUTE` leaf without executing the first.
        SphinxLeafWithProof[] memory executionLeafWithProof = new SphinxLeafWithProof[](1);
        executionLeafWithProof[0] = moduleInputs.executionLeavesWithProofs[1];
        moduleProxy.execute(executionLeafWithProof);
    }

    function test_execute_revert_insufficientGas() external {
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.prank(executor);
        vm.expectRevert("SphinxModule: insufficient gas");
        moduleProxy.execute{ gas: 1_500_000 }(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_fail_userTransactionReverted() external {
        defaultTxs[1].txData = abi.encodePacked(myContract.reverter.selector);
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));
        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.expectEmit(address(moduleProxy));
        emit SphinxActionFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 2 // Second execution leaf
        });
        vm.expectEmit(address(moduleProxy));
        emit SphinxDeploymentFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 2 // Second execution leaf
        });
        vm.prank(executor);
        DeploymentStatus executionFinalStatus = moduleProxy.execute(
            moduleInputs.executionLeavesWithProofs
        );

        (, uint256 leavesExecuted, , , DeploymentStatus deploymentStateStatus, ) = moduleProxy
            .deployments(moduleInputs.merkleRoot);
        assertEq(executionFinalStatus, DeploymentStatus.FAILED);
        assertEq(executionFinalStatus, deploymentStateStatus);
        assertEq(moduleProxy.activeMerkleRoot(), bytes32(0));
        // Only the approval leaf and the first two execution leaves were executed.
        assertEq(leavesExecuted, 3);
    }

    // In this test, the Gnosis Safe owners will approve a Merkle root that contains a leaf with an
    // insufficient amount of gas. This will cause the user's transaction to fail. This particular
    // error will trigger the `catch` statement in the `SphinxModuleProxy`, unlike an error that
    // occurs in the user's contract, which would simply cause the `success` boolean in the `try`
    // statement to be `false`.
    function test_execute_fail_insufficientUserTxGas() external {
        // Check that the user's transactions haven't been executed.
        helper_test_preExecution();

        defaultTxs[0].gas = 1_000;
        ModuleInputs memory moduleInputs = getModuleInputs(helper_makeMerkleTreeInputs(defaultTxs));

        helper_test_approve({
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.expectEmit(address(moduleProxy));
        emit SphinxActionFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 1 // First execution leaf
        });
        vm.expectEmit(address(moduleProxy));
        emit SphinxDeploymentFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 1 // First execution leaf
        });
        vm.prank(executor);
        DeploymentStatus executionFinalStatus = moduleProxy.execute(
            moduleInputs.executionLeavesWithProofs
        );

        (, uint256 leavesExecuted, , , DeploymentStatus deploymentStateStatus, ) = moduleProxy
            .deployments(moduleInputs.merkleRoot);
        assertEq(deploymentStateStatus, DeploymentStatus.FAILED);
        assertEq(executionFinalStatus, DeploymentStatus.FAILED);
        assertEq(moduleProxy.activeMerkleRoot(), bytes32(0));
        // The first execution leaf was executed, as well as the approval leaf.
        assertEq(leavesExecuted, 2);

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
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED,
            _expectedArbitraryChain: false
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
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
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
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        helper_test_execute_oneByOne(moduleInputs);

        assertEq(myContract.myNum(), 123);
    }

    // To fully cover the logic that triggers a `FAILED` deployment, there are four scenarios we
    // must test. In the list below, `success` and `requireSuccess` refer to variables in the
    // `SphinxModule`.
    // 1. `success == false` and `requireSuccess == false`. This is covered in the first
    //    `SphinxTransaction` in this test.
    // 2. `success == true` and `requireSuccess == false`. This is covered in all of the
    //    `SphinxTransaction`s in this test except the first.
    // 3. `success == true` and `requireSuccess == true`. This is the default behavior, which is
    //    covered in any test with a name that begins with `test_execute_success`.
    // 4. `success == false` and `requireSuccess == true`. This is covered in
    //    `test_execute_fail_userTransactionReverted`.
    function test_execute_success_noRequireSuccess() external {
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
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED,
            _expectedArbitraryChain: false
        });
    }

    function test_execute_withArbitraryChainAndIncorrectChainId() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.arbitraryChain = true;
        treeInputs.chainId = 0;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);
        helper_test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED,
            _expectedArbitraryChain: true
        });
    }

    function test_execute_withArbitraryChainAndCorrectChainId() external {
        MerkleTreeInputs memory treeInputs = helper_makeMerkleTreeInputs(defaultTxs);
        treeInputs.arbitraryChain = true;
        ModuleInputs memory moduleInputs = getModuleInputs(treeInputs);
        helper_test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedInitialActiveMerkleRoot: bytes32(0),
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedFinalDeploymentStatus: DeploymentStatus.COMPLETED,
            _expectedArbitraryChain: true
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
        string memory _expectedDeploymentUri,
        bool _expectedArbitraryChain
    ) internal {
        uint256 initialNonce = moduleProxy.currentNonce();
        uint256 expectedNumLeaves = _moduleInputs.executionLeavesWithProofs.length + 1;
        assertEq(moduleProxy.activeMerkleRoot(), _expectedInitialActiveMerkleRoot);

        bytes memory typedData = abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPE_HASH, _moduleInputs.merkleRoot))
        );
        vm.expectCall(
            address(safeProxy),
            abi.encodePacked(
                safeProxy.checkSignatures.selector,
                abi.encode(keccak256(typedData), typedData, _moduleInputs.ownerSignatures)
            )
        );
        vm.expectEmit(address(moduleProxy));
        emit SphinxDeploymentApproved({
            merkleRoot: _moduleInputs.merkleRoot,
            previousActiveRoot: _expectedInitialActiveMerkleRoot,
            nonce: initialNonce,
            executor: executor,
            numLeaves: expectedNumLeaves,
            uri: _expectedDeploymentUri
        });
        if (_expectedStatus == DeploymentStatus.COMPLETED) {
            vm.expectEmit(address(moduleProxy));
            emit SphinxDeploymentCompleted(_moduleInputs.merkleRoot);
        }
        vm.prank(executor);
        moduleProxy.approve(
            _moduleInputs.merkleRoot,
            _moduleInputs.approvalLeafWithProof,
            _moduleInputs.ownerSignatures
        );

        (
            uint256 approvedNumLeaves,
            uint256 approvedLeavesExecuted,
            string memory approvedUri,
            address approvedExecutor,
            DeploymentStatus approvedStatus,
            bool approvedArbitraryChain
        ) = moduleProxy.deployments(_moduleInputs.merkleRoot);
        assertEq(approvedNumLeaves, expectedNumLeaves);
        assertEq(approvedLeavesExecuted, 1);
        assertEq(approvedUri, _expectedDeploymentUri);
        assertEq(approvedExecutor, executor);
        assertEq(approvedStatus, _expectedStatus);
        assertEq(approvedArbitraryChain, _expectedArbitraryChain);

        if (_expectedStatus == DeploymentStatus.COMPLETED) {
            assertEq(moduleProxy.activeMerkleRoot(), bytes32(0));
        } else {
            assertEq(moduleProxy.activeMerkleRoot(), _moduleInputs.merkleRoot);
        }
        assertEq(moduleProxy.currentNonce(), initialNonce + 1);
    }

    function helper_test_approveThenExecuteBatch(
        SphinxTransaction[] memory _txs,
        ModuleInputs memory _moduleInputs,
        bool[] memory _expectedSuccesses,
        DeploymentStatus _expectedFinalDeploymentStatus,
        bytes32 _expectedInitialActiveMerkleRoot,
        bool _expectedArbitraryChain
    ) internal {
        // Sanity check
        assertEq(_txs.length, _expectedSuccesses.length);

        helper_test_preExecution();

        helper_test_approve({
            _moduleInputs: _moduleInputs,
            _expectedInitialActiveMerkleRoot: _expectedInitialActiveMerkleRoot,
            _expectedStatus: DeploymentStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: _expectedArbitraryChain
        });

        for (uint256 i = 0; i < _moduleInputs.executionLeavesWithProofs.length; i++) {
            SphinxLeafWithProof memory leafWithProof = _moduleInputs.executionLeavesWithProofs[i];
            bool expectSuccess = _expectedSuccesses[i];
            vm.expectEmit(address(moduleProxy));
            if (expectSuccess) {
                emit SphinxActionSucceeded(_moduleInputs.merkleRoot, leafWithProof.leaf.index);
            } else {
                emit SphinxActionFailed(_moduleInputs.merkleRoot, leafWithProof.leaf.index);
            }
        }
        vm.expectEmit(address(moduleProxy));
        emit SphinxDeploymentCompleted(_moduleInputs.merkleRoot);
        vm.prank(executor);
        DeploymentStatus status = moduleProxy.execute(_moduleInputs.executionLeavesWithProofs);
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
        (
            ,
            ,
            ,
            uint256 expectedNumLeaves,
            address expectedExecutor,
            string memory expectedUri,
            bool expectedArbitraryChain
        ) = abi.decode(
                _moduleInputs.approvalLeafWithProof.leaf.data,
                (address, address, uint256, uint256, address, string, bool)
            );

        // Check that the state of the `SphinxModule` was updated correctly.
        assertEq(moduleProxy.activeMerkleRoot(), bytes32(0));
        (
            uint256 numLeaves,
            uint256 leavesExecuted,
            string memory uri,
            address actualExecutor,
            DeploymentStatus status,
            bool arbitraryChain
        ) = moduleProxy.deployments(_moduleInputs.merkleRoot);
        assertEq(expectedNumLeaves, numLeaves);
        assertEq(leavesExecuted, numLeaves);
        assertEq(expectedUri, uri);
        assertEq(expectedExecutor, actualExecutor);
        assertEq(status, DeploymentStatus.COMPLETED);
        assertEq(expectedArbitraryChain, arbitraryChain);

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

    function helper_makeMerkleTreeInputs(
        SphinxTransaction memory _tx
    ) internal view returns (MerkleTreeInputs memory) {
        SphinxTransaction[] memory txs = new SphinxTransaction[](1);
        txs[0] = _tx;
        return helper_makeMerkleTreeInputs(txs);
    }

    function helper_makeMerkleTreeInputs(
        SphinxTransaction[] memory _txs
    ) internal view returns (MerkleTreeInputs memory) {
        return
            MerkleTreeInputs({
                txs: _txs,
                ownerWallets: ownerWallets,
                chainId: block.chainid,
                moduleProxy: moduleProxy,
                nonceInModuleProxy: moduleProxy.currentNonce(),
                executor: executor,
                safeProxy: address(safeProxy),
                deploymentUri: defaultDeploymentUri,
                arbitraryChain: false,
                forceNumLeavesValue: false,
                overridingNumLeavesValue: 0,
                forceApprovalLeafIndexNonZero: false
            });
    }

    function helper_test_execute_oneByOne(ModuleInputs memory _moduleInputs) internal {
        uint256 numExecutionLeaves = _moduleInputs.executionLeavesWithProofs.length;
        uint256 finalExecutionLeafIndex = numExecutionLeaves - 1;
        for (uint256 i = 0; i < numExecutionLeaves; i++) {
            SphinxLeafWithProof memory executionLeafWithProof = _moduleInputs
                .executionLeavesWithProofs[i];
            (, uint256 initialLeavesExecuted, , , , ) = moduleProxy.deployments(
                _moduleInputs.merkleRoot
            );

            vm.expectEmit(address(moduleProxy));
            emit SphinxActionSucceeded(_moduleInputs.merkleRoot, executionLeafWithProof.leaf.index);
            if (i == finalExecutionLeafIndex) {
                vm.expectEmit(address(moduleProxy));
                emit SphinxDeploymentCompleted(_moduleInputs.merkleRoot);
            }

            SphinxLeafWithProof[] memory executionLeafWithProofArray = new SphinxLeafWithProof[](1);
            executionLeafWithProofArray[0] = executionLeafWithProof;
            vm.prank(executor);
            DeploymentStatus status = moduleProxy.execute(executionLeafWithProofArray);
            if (i == finalExecutionLeafIndex) {
                assertEq(status, DeploymentStatus.COMPLETED);
            } else {
                assertEq(status, DeploymentStatus.APPROVED);
            }
            (, uint256 leavesExecuted, , , , ) = moduleProxy.deployments(_moduleInputs.merkleRoot);
            assertEq(leavesExecuted, initialLeavesExecuted + 1);
        }
    }

    function assertEq(DeploymentStatus a, DeploymentStatus b) internal pure {
        require(uint256(a) == uint256(b), "DeploymentStatus mismatch");
    }
}

contract SphinxModuleProxy_GnosisSafe_L1_1_3_0_Test is AbstractSphinxModuleProxy_Test {
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxModuleProxy_Test.setUp(
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

contract SphinxModuleProxy_GnosisSafe_L2_1_3_0_Test is AbstractSphinxModuleProxy_Test {
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxModuleProxy_Test.setUp(
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

contract SphinxModuleProxy_GnosisSafe_L1_1_4_1_Test is AbstractSphinxModuleProxy_Test {
    function setUp() public {
        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        AbstractSphinxModuleProxy_Test.setUp(
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

contract SphinxModuleProxy_GnosisSafe_L2_1_4_1_Test is AbstractSphinxModuleProxy_Test {
    function setUp() public {
        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        AbstractSphinxModuleProxy_Test.setUp(
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
