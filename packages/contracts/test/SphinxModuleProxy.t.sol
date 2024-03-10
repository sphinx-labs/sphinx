// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { StdUtils } from "../contracts/forge-std/src/StdUtils.sol";
import { StdStorage, stdStorage } from "../contracts/forge-std/src/StdStorage.sol";
import { SphinxModuleProxyFactory } from "../contracts/core/SphinxModuleProxyFactory.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import {
    GnosisSafeProxyFactory
} from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { IProxy } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";
import { CreateCall } from "@gnosis.pm/safe-contracts-1.3.0/libraries/CreateCall.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";
import { MultiSend } from "@gnosis.pm/safe-contracts-1.3.0/libraries/MultiSend.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { IEnum } from "../contracts/foundry/interfaces/IEnum.sol";
import {
    SphinxLeafWithProof,
    SphinxLeafType,
    MerkleRootState,
    MerkleRootStatus,
    SphinxLeaf
} from "../contracts/core/SphinxDataTypes.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTransaction, TestUtils } from "./TestUtils.t.sol";
import {
    MyContract,
    MyDelegateCallContract,
    GnosisSafeSingletonInvalidVersion
} from "./helpers/MyTestContracts.t.sol";

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
abstract contract AbstractSphinxModuleProxy_Test is IEnum, TestUtils, SphinxModule {
    using stdStorage for StdStorage;

    bytes internal constant CREATE3_PROXY_BYTECODE = hex"67363d3d37363d34f03d5260086018f3";

    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    SphinxModuleProxyFactory moduleProxyFactory;
    SphinxModule moduleProxy;
    GnosisSafeVersion gnosisSafeVersion;

    // The default set of transactions that'll be executed in the Gnosis Safe.
    SphinxTransaction[] defaultTxs;
    // Whether we expect a success or failure for each default transaction. There is one element in
    // this array for each element in `defaultTxs`.
    bool[] defaultExpectedSuccesses;
    // The default argument for `MyContract.setMyNum`.
    uint256 defaultMyNum = 123;

    // These variables are used in the multichain tests.
    uint256[] defaultChainIds = [1, 5, 10];
    string[] rpcUrls = [
        "http://127.0.0.1:42001",
        "http://127.0.0.1:42005",
        "http://127.0.0.1:42010"
    ];
    uint256[] expectedMyNumArray = [111, 222, 333];
    uint256[] moduleProxyNonceArray = [10, 20, 30];

    Wallet[] ownerWallets;
    address[] owners;
    address deploymentExecutor = address(0x1000);
    address cancellationExecutor = address(0x2000);
    string defaultDeploymentUri = "ipfs://Qm1234";
    string defaultCancellationUri = "ipfs://Qm567890";

    // Deploy the test contracts.
    MyContract myContract;
    MyDelegateCallContract myDelegateCallContract;

    // The following addresses correspond to contracts that will be deployed during execution.
    address deployedViaCreate;
    address deployedViaCreate2;
    address deployedViaCreate3;

    function setUp(GnosisSafeVersion _gnosisSafeVersion) internal {
        gnosisSafeVersion = _gnosisSafeVersion;

        moduleProxyFactory = new SphinxModuleProxyFactory{ salt: bytes32(0) }();
        GnosisSafeAddresses memory gnosisSafeAddresses = deployGnosisSafeContracts(
            _gnosisSafeVersion
        );

        Wallet[] memory wallets = getSphinxWalletsSortedByAddress(5);
        // We can't assign the wallets directly to the `owners` array because Solidity throws an
        // error if we try to assign a memory array to a storage array. So, instead, we have to
        // iterate over the memory array and push each element to the storage array.
        for (uint256 i = 0; i < wallets.length; i++) {
            ownerWallets.push(wallets[i]);
            owners.push(wallets[i].addr);
        }

        (safeProxy, moduleProxy) = initializeGnosisSafeWithModule(
            moduleProxyFactory,
            gnosisSafeAddresses
        );

        myContract = new MyContract{ salt: bytes32(0) }();
        myDelegateCallContract = new MyDelegateCallContract{ salt: bytes32(0) }();

        // Give the Gnosis Safe 1 ether
        vm.deal(address(safeProxy), 1 ether);

        // Next, we'll define state variables for the deployment that will be executed through the
        // Gnosis Safe.
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
                operation: IEnum.GnosisSafeOperation.Call,
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
                operation: IEnum.GnosisSafeOperation.Call,
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
                operation: IEnum.GnosisSafeOperation.DelegateCall,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Contract deployment via `CREATE`:
        defaultTxs.push(
            SphinxTransaction({
                to: gnosisSafeAddresses.createCall,
                value: 0,
                txData: abi.encodePacked(
                    CreateCall.performCreate.selector,
                    abi.encode(0, type(MyContract).creationCode)
                ),
                operation: IEnum.GnosisSafeOperation.DelegateCall,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Contract deployment via `CREATE2`:
        defaultTxs.push(
            SphinxTransaction({
                to: gnosisSafeAddresses.createCall,
                value: 0,
                txData: abi.encodePacked(
                    CreateCall.performCreate2.selector,
                    abi.encode(0, type(MyContract).creationCode, bytes32(0))
                ),
                operation: IEnum.GnosisSafeOperation.DelegateCall,
                gas: 1_000_000,
                requireSuccess: true
            })
        );
        // Contract deployment via `CREATE3`. We use Gnosis Safe's `MultiSend` to submit two
        // transactions:
        // 1. Deploy a minimal `CREATE3` proxy using `CREATE2`. The `CREATE2` logic exists on Gnosis
        //    Safe's `CreateCall` contract.
        // 2. Call the deployed `CREATE3` proxy with the relevant contract's creation code.
        bytes memory create3ProxyDeploymentData = abi.encodePacked(
            CreateCall.performCreate2.selector,
            abi.encode(0, CREATE3_PROXY_BYTECODE, bytes32(0))
        );
        bytes memory firstCreate3MultiSendData = abi.encodePacked(
            uint8(Operation.DelegateCall),
            gnosisSafeAddresses.createCall,
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
                to: gnosisSafeAddresses.multiSend,
                value: 0,
                txData: abi.encodeWithSelector(
                    MultiSend.multiSend.selector,
                    abi.encodePacked(firstCreate3MultiSendData, secondCreate3MultiSendData)
                ),
                operation: IEnum.GnosisSafeOperation.DelegateCall,
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
                operation: IEnum.GnosisSafeOperation.Call,
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

    // Test that the `SphinxModule` implementation contract can't be initialized directly.
    function test_constructor_success() external {
        address expectedModuleAddr = computeCreate2Address({
            salt: bytes32(0),
            initcodeHash: keccak256(type(SphinxModule).creationCode),
            deployer: DETERMINISTIC_DEPLOYMENT_PROXY
        });
        vm.expectEmit(address(expectedModuleAddr));
        emit Initialized(type(uint8).max);
        SphinxModule deployedModule = new SphinxModule{ salt: bytes32(0) }();
        assertEq(address(deployedModule), expectedModuleAddr);

        vm.expectRevert("Initializable: contract is already initialized");
        deployedModule.initialize(address(safeProxy));
    }

    function test_initialize_reverts_alreadyInitialized() external {
        vm.expectRevert("Initializable: contract is already initialized");
        moduleProxy.initialize(address(safeProxy));
    }

    function test_initialize_reverts_invalidSafeAddress() external {
        vm.expectRevert("SphinxModule: invalid Safe address");
        // Deploy a `SphinxModuleProxy` with a Gnosis Safe proxy address equal to `address(0)`. We
        // deploy via the `SphinxModuleProxyFactory` out of convenience.
        moduleProxyFactory.deploySphinxModuleProxy({ _safeProxy: address(0), _saltNonce: 0 });
    }

    function test_initialize_reverts_invalidSafeVersion() external {
        // Deploy a mock Gnosis Safe singleton with an invalid `VERSION()` function.
        GnosisSafeSingletonInvalidVersion singleton = new GnosisSafeSingletonInvalidVersion();
        // Deploy a Gnosis Safe Proxy that uses the invalid singleton.
        GnosisSafeProxy safeProxy = new GnosisSafeProxy(address(singleton));

        vm.expectRevert("SphinxModule: invalid Safe version");
        // We deploy via the `SphinxModuleProxyFactory` out of convenience.
        moduleProxyFactory.deploySphinxModuleProxy({
            _safeProxy: address(safeProxy),
            _saltNonce: 0
        });
    }

    function test_initialize_success() external {
        assertEq(address(moduleProxy.safeProxy()), address(safeProxy));

        // Check that the Gnosis Safe singleton has a valid version.
        address safeSingleton = IProxy(safeProxy).masterCopy();
        string memory safeVersion = GnosisSafe(payable(safeSingleton)).VERSION();
        bytes32 safeVersionHash = keccak256(abi.encodePacked(safeVersion));
        if (
            gnosisSafeVersion == GnosisSafeVersion.L1_1_3_0 ||
            gnosisSafeVersion == GnosisSafeVersion.L2_1_3_0
        ) {
            assertEq(safeVersionHash, keccak256("1.3.0"));
        } else if (
            gnosisSafeVersion == GnosisSafeVersion.L1_1_4_1 ||
            gnosisSafeVersion == GnosisSafeVersion.L2_1_4_1
        ) {
            assertEq(safeVersionHash, keccak256("1.4.1"));
        } else {
            revert("Invalid Gnosis Safe version. Should never happen.");
        }
    }

    function test_approve_revert_noReentrancy() external {
        assertFalse(myContract.reentrancyBlocked());

        // In this test, we'll create a transaction that will cause the Gnosis Safe to call the
        // `reenter` function on `MyContract`, which will then call the `approve` function in the
        // `SphinxModule`. This should trigger a re-entrancy error.

        DeploymentModuleInputs memory defaultModuleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        bytes memory approvalData = abi.encodePacked(
            moduleProxy.approve.selector,
            abi.encode(
                defaultModuleInputs.merkleRoot,
                defaultModuleInputs.approvalLeafWithProof,
                defaultModuleInputs.ownerSignatures
            )
        );
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(
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
                        operation: IEnum.GnosisSafeOperation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(deploymentExecutor);
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
        vm.stopPrank();

        assertTrue(myContract.reentrancyBlocked());
    }

    function test_approve_revert_activeMerkleRoot() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: active merkle root");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_zeroHashMerkleRoot() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid root");
        moduleProxy.approve({
            _root: bytes32(0), // Invalid Merkle root
            _leafWithProof: moduleInputs.approvalLeafWithProof,
            _signatures: moduleInputs.ownerSignatures
        });
    }

    function test_approve_revert_rootAlreadyUsed() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );

        test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedArbitraryChain: false,
            _expectedMyNum: defaultMyNum
        });

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: root already used");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafChainID() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );

        moduleInputs.approvalLeafWithProof.leaf.chainId += 1;
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafIndex() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        moduleInputs.approvalLeafWithProof.leaf.index += 1;
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafType() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        moduleInputs.approvalLeafWithProof.leaf.leafType = SphinxLeafType.EXECUTE;
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidLeafData() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        moduleInputs.approvalLeafWithProof.leaf.data = abi.encodePacked(
            moduleInputs.approvalLeafWithProof.leaf.data,
            hex"00"
        );
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidMerkleProof() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        moduleInputs.approvalLeafWithProof.proof[0] = bytes32(0);
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_merkleProofVerify_invalidMerkleRoot() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.approve(
            bytes32(uint256(1)),
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidLeafType() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        // Attempt to approve an `EXECUTE` leaf instead of an `APPROVE` leaf.
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.executionLeavesWithProofs[0],
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidLeafIndex() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.forceApprovalLeafIndexNonZero = true;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidSafeProxy() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.safeProxy = address(0x1234);
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid SafeProxy");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidModule() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.moduleProxy = SphinxModule(address(0x1234));
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid SphinxModuleProxy");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidNonce() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.moduleProxyNonce = moduleProxy.merkleRootNonce() + 1;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid nonce");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_numLeavesIsZero() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.forceNumLeavesValue = true;
        treeInputs.overridingNumLeavesValue = 0;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: numLeaves cannot be 0");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_invalidExecutor() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
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
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        vm.chainId(block.chainid + 1);
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid chain id");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_leafChainIdMustBeZero() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        // We set `arbitraryChain` to `true` and we set the chain ID of the approval leaf to be
        // 31337.
        treeInputs.arbitraryChain = true;
        treeInputs.forceApprovalLeafChainIdNonZero = true;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: leaf chain id must be 0");
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_approve_revert_checkSignatures_emptyOwnerSignatures() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        // This error is thrown by the Gnosis Safe. It means "Signatures data too short".
        vm.expectRevert("GS020");
        vm.prank(deploymentExecutor);
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            new bytes(0)
        );
    }

    function test_approve_success() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
    }

    function test_approve_success_emptyURI() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.uri = "";
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: "",
            _expectedArbitraryChain: false
        });
    }

    // This tests that it's possible to execute a Merkle root, then approve another one.
    function test_approve_success_multipleApprovals() external {
        DeploymentModuleInputs memory firstModuleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: firstModuleInputs,
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedArbitraryChain: false,
            _expectedMyNum: defaultMyNum
        });

        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(
                SphinxTransaction({
                    to: address(myContract),
                    value: 0,
                    // Use slightly different data than the first tx so that the Merkle root is
                    // different.
                    txData: abi.encodePacked(myContract.setMyNum.selector, abi.encode(4321)),
                    operation: IEnum.GnosisSafeOperation.Call,
                    gas: 1_000_000,
                    requireSuccess: true
                })
            )
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
    }

    function test_approve_success_emptyDeployment() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        delete treeInputs.txs;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);

        // Run some sanity checks before submitting the approval.
        assertEq(moduleInputs.executionLeavesWithProofs.length, 0);
        assertEq(moduleInputs.approvalLeafWithProof.proof.length, 0);

        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.COMPLETED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
    }

    function test_approve_success_withArbitraryChain() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.arbitraryChain = true;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: true
        });
    }

    /////////////////////////////// cancel //////////////////////////////////////

    function test_cancel_revert_noReentrancy() external {
        assertFalse(myContract.reentrancyBlocked());

        // In this test, we'll create a transaction that will cause the Gnosis Safe to call the
        // `reenter` function on `MyContract`, which will then call the `cancel` function in the
        // `SphinxModule`. This should trigger a re-entrancy error.

        DeploymentModuleInputs memory moduleInputsToCancel = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        bytes memory cancellationData = abi.encodePacked(
            moduleProxy.cancel.selector,
            abi.encode(
                moduleInputsToCancel.merkleRoot,
                moduleInputsToCancel.approvalLeafWithProof,
                moduleInputsToCancel.ownerSignatures
            )
        );
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(
                (
                    SphinxTransaction({
                        to: address(myContract),
                        value: 0,
                        // Encode the call to the `cancel` function on the `SphinxModuleProxy`.
                        // This function's arguments don't matter because the call will revert
                        // before they're used.
                        txData: abi.encodeWithSelector(
                            myContract.reenter.selector,
                            moduleProxy,
                            cancellationData
                        ),
                        operation: IEnum.GnosisSafeOperation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(deploymentExecutor);
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
        vm.stopPrank();

        assertTrue(myContract.reentrancyBlocked());
    }

    function test_cancel_revert_noRootToCancel() external {
        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );
        vm.expectRevert("SphinxModule: no root to cancel");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_zeroHashMerkleRoot() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );

        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: invalid root");
        moduleProxy.cancel({
            _root: bytes32(0), // Invalid Merkle root
            _leafWithProof: moduleInputs.cancellationLeafWithProof,
            _signatures: moduleInputs.ownerSignatures
        });
    }

    function test_cancel_revert_rootAlreadyUsed() external {
        // In this test, we'll approve a Merkle root, then attempt to use the same Merkle root in
        // the `cancel` function. The call to the `cancel` function will fail because the Merkle
        // root is already in the `APPROVED` state.

        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );

        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: root already used");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_merkleProofVerify_invalidLeafChainID() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );

        moduleInputs.cancellationLeafWithProof.leaf.chainId += 1;
        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_merkleProofVerify_invalidLeafIndex() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );

        moduleInputs.cancellationLeafWithProof.leaf.index += 1;
        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_merkleProofVerify_invalidLeafType() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );

        moduleInputs.cancellationLeafWithProof.leaf.leafType = SphinxLeafType.APPROVE;
        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_merkleProofVerify_invalidLeafData() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );
        moduleInputs.cancellationLeafWithProof.leaf.data = abi.encodePacked(
            moduleInputs.cancellationLeafWithProof.leaf.data,
            hex"00"
        );
        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_merkleProofVerify_invalidMerkleProof() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );
        moduleInputs.cancellationLeafWithProof.proof = new bytes32[](1);
        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_merkleProofVerify_invalidMerkleRoot() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );
        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.cancel(
            bytes32(uint256(1)),
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_invalidLeafType() external {
        test_approveDefaultDeployment();

        // We'll create a new deployment Merkle tree, then we'll attempt to cancel the active
        // deployment using a valid `APPROVE` leaf instead of a `CANCEL` leaf.
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        // Remove the transactions in the new Merkle tree. This ensures that the new Merkle root is
        // different from the active Merkle root. If we don't do this, the `cancel` function will
        // revert early because we've already approved the Merkle root.
        delete treeInputs.txs;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );

        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_invalidLeafIndex() external {
        test_approveDefaultDeployment();

        CancellationMerkleTreeInputs memory treeInputs = makeCancellationMerkleTreeInputs();
        treeInputs.forceCancellationLeafIndexNonZero = true;
        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(treeInputs);

        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_invalidSafeProxy() external {
        test_approveDefaultDeployment();

        CancellationMerkleTreeInputs memory treeInputs = makeCancellationMerkleTreeInputs();
        treeInputs.safeProxy = address(0x1234);
        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(treeInputs);

        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: invalid SafeProxy");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_invalidModule() external {
        test_approveDefaultDeployment();

        CancellationMerkleTreeInputs memory treeInputs = makeCancellationMerkleTreeInputs();
        treeInputs.moduleProxy = SphinxModule(address(0x1234));
        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(treeInputs);

        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: invalid SphinxModuleProxy");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_invalidNonce() external {
        test_approveDefaultDeployment();

        CancellationMerkleTreeInputs memory treeInputs = makeCancellationMerkleTreeInputs();
        treeInputs.moduleProxyNonce = moduleProxy.merkleRootNonce() + 1;
        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(treeInputs);

        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: invalid nonce");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_invalidMerkleRootToCancel() external {
        test_approveDefaultDeployment();

        CancellationMerkleTreeInputs memory treeInputs = makeCancellationMerkleTreeInputs();
        treeInputs.merkleRootToCancel = bytes32(uint(1));
        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(treeInputs);

        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: invalid root to cancel");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_invalidExecutor() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );

        // Prank an address that isn't the executor
        vm.prank(address(0x1234));
        vm.expectRevert("SphinxModule: caller isn't executor");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_invalidChainID() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );

        vm.chainId(block.chainid + 1);
        vm.prank(cancellationExecutor);
        vm.expectRevert("SphinxModule: invalid chain id");
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            moduleInputs.ownerSignatures
        );
    }

    function test_cancel_revert_checkSignatures_emptyOwnerSignatures() external {
        test_approveDefaultDeployment();

        CancellationModuleInputs memory moduleInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );

        // This error is thrown by the Gnosis Safe. It means "Signatures data too short".
        vm.expectRevert("GS020");
        vm.prank(cancellationExecutor);
        moduleProxy.cancel(
            moduleInputs.merkleRoot,
            moduleInputs.cancellationLeafWithProof,
            new bytes(0)
        );
    }

    function test_cancel_success() external {
        DeploymentModuleInputs memory moduleInputsToCancel = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputsToCancel,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
        CancellationModuleInputs memory cancellationInputs = getCancellationModuleInputs(
            makeCancellationMerkleTreeInputs()
        );
        test_cancel(moduleInputsToCancel, cancellationInputs);
    }

    //////////////////////////////// execute ////////////////////////////////////

    function test_execute_revert_noReentrancy() external {
        assertFalse(myContract.reentrancyBlocked());

        // In this test, we'll create a transaction that will cause the Gnosis Safe to call the
        // `reenter` function on `MyContract`, which will then call the `execute` function in the
        // `SphinxModule`. This should trigger a re-entrancy error.

        DeploymentModuleInputs memory defaultModuleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        bytes memory executionData = abi.encodePacked(
            moduleProxy.execute.selector,
            abi.encode(defaultModuleInputs.executionLeavesWithProofs)
        );
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(
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
                        operation: IEnum.GnosisSafeOperation.Call,
                        gas: 1_000_000,
                        requireSuccess: true
                    })
                )
            )
        );

        vm.startPrank(deploymentExecutor);
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
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        vm.expectRevert("SphinxModule: no active root");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_invalidExecutor() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
        // Prank an address that isn't the executor
        vm.prank(address(0x1234));
        vm.expectRevert("SphinxModule: caller isn't executor");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_extraLeavesNotAllowed() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.forceNumLeavesValue = true;
        // Set the overriding `numLeaves` to be equal to the number of `EXECUTE` leaves. This is one
        // less than its normal value, since `numLeaves` normally includes the `APPROVE` leaf.
        treeInputs.overridingNumLeavesValue = defaultTxs.length;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);
        vm.prank(deploymentExecutor);
        // Call the `approve` function. We don't use `test_approve` here because we've
        // modified the `numLeaves` in this test, which would cause this helper function to fail.
        moduleProxy.approve(
            moduleInputs.merkleRoot,
            moduleInputs.approvalLeafWithProof,
            moduleInputs.ownerSignatures
        );
        // Sanity check that the approval was successful.
        assertEq(moduleProxy.activeMerkleRoot(), moduleInputs.merkleRoot);

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: extra leaves not allowed");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafChainID() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].leaf.chainId += 1;
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafIndex() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].leaf.index += 1;
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafType() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].leaf.leafType = SphinxLeafType.APPROVE;
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidLeafData() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].leaf.data = abi.encodePacked(
            moduleInputs.executionLeavesWithProofs[0].leaf.data,
            hex"00"
        );
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_merkleProofVerify_invalidMerkleProof() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        moduleInputs.executionLeavesWithProofs[0].proof[0] = bytes32(0);
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: failed to verify leaf");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    // At this point in the test suite for the `approve` function, we create a test called
    // `test_execute_revert_merkleProofVerify_invalidMerkleRoot`. We don't do that here because the
    // Merkle root is stored as a state variable in the SphinxModule after the `approve` function.
    // In other words, we can't pass an invalid Merkle root into the `execute` function.

    function test_execute_revert_invalidLeafType() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid leaf type");
        // Attempt to approve an `APPROVE` leaf instead of an `EXECUTE` leaf.
        SphinxLeafWithProof[] memory approvalLeavesWithProofs = new SphinxLeafWithProof[](1);
        approvalLeavesWithProofs[0] = moduleInputs.approvalLeafWithProof;
        moduleProxy.execute(approvalLeavesWithProofs);
    }

    function test_execute_revert_invalidLeafIndex() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid leaf index");
        // Execute the second `EXECUTE` leaf without executing the first.
        SphinxLeafWithProof[] memory executionLeafWithProof = new SphinxLeafWithProof[](1);
        executionLeafWithProof[0] = moduleInputs.executionLeavesWithProofs[1];
        moduleProxy.execute(executionLeafWithProof);
    }

    function test_execute_revert_invalidChainID() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
        vm.chainId(block.chainid + 1);
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: invalid chain id");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_leafChainIdMustBeZero() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        // We set `arbitraryChain` to `true` and we set the chain ID of the execution leaves to be
        // equal to 31337.
        treeInputs.arbitraryChain = true;
        treeInputs.forceExecutionLeavesChainIdNonZero = true;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);

        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: true
        });
        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: leaf chain id must be 0");
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_revert_insufficientGas() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.prank(deploymentExecutor);
        vm.expectRevert("SphinxModule: insufficient gas");
        moduleProxy.execute{ gas: 1_500_000 }(moduleInputs.executionLeavesWithProofs);
    }

    function test_execute_fail_userTransactionReverted() external {
        defaultTxs[1].txData = abi.encodePacked(myContract.reverter.selector);
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.expectEmit(address(moduleProxy));
        emit SphinxActionFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 2 // Second execution leaf
        });
        vm.expectEmit(address(moduleProxy));
        emit SphinxMerkleRootFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 2 // Second execution leaf
        });
        vm.prank(deploymentExecutor);
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);

        (, uint256 leavesExecuted, , , MerkleRootStatus merkleRootStateStatus, ) = moduleProxy
            .merkleRootStates(moduleInputs.merkleRoot);
        assertEq(merkleRootStateStatus, MerkleRootStatus.FAILED);
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
        test_preExecution();

        defaultTxs[0].gas = 1_000;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );

        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        vm.expectEmit(address(moduleProxy));
        emit SphinxActionFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 1 // First execution leaf
        });
        vm.expectEmit(address(moduleProxy));
        emit SphinxMerkleRootFailed({
            merkleRoot: moduleInputs.merkleRoot,
            leafIndex: 1 // First execution leaf
        });
        vm.prank(deploymentExecutor);
        moduleProxy.execute(moduleInputs.executionLeavesWithProofs);

        (, uint256 leavesExecuted, , , MerkleRootStatus merkleRootStateStatus, ) = moduleProxy
            .merkleRootStates(moduleInputs.merkleRoot);
        assertEq(merkleRootStateStatus, MerkleRootStatus.FAILED);
        assertEq(moduleProxy.activeMerkleRoot(), bytes32(0));
        // The first execution leaf was executed, as well as the approval leaf.
        assertEq(leavesExecuted, 2);

        // Check that the user's transactions weren't executed.
        test_preExecution();
    }

    // Execute all of the user's transactions in a single call.
    function test_execute_success_batchExecute() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedArbitraryChain: false,
            _expectedMyNum: defaultMyNum
        });
    }

    // Execute the user's transactions one at a time.
    function test_execute_success_oneByOne() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );

        test_preExecution();

        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        test_execute_oneByOne(moduleInputs);

        test_postExecution({ _moduleInputs: moduleInputs, _expectedMyNum: defaultMyNum });
    }

    function test_execute_success_oneExecutionLeaf() external {
        assertEq(myContract.myNum(), 0);
        SphinxTransaction[] memory txn = new SphinxTransaction[](1);
        txn[0] = defaultTxs[0];
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(txn)
        );

        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });

        test_execute_oneByOne(moduleInputs);

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
            operation: IEnum.GnosisSafeOperation.Call,
            gas: 1_000_000,
            requireSuccess: false // Don't require success
        });
        expectedSuccesses[0] = false;
        for (uint256 i = 0; i < defaultTxs.length; i++) {
            txs[i + 1] = defaultTxs[i];
            txs[i + 1].requireSuccess = false;
            expectedSuccesses[i + 1] = true;
        }
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(txs)
        );
        test_approveThenExecuteBatch({
            _txs: txs,
            _moduleInputs: moduleInputs,
            _expectedSuccesses: expectedSuccesses,
            _expectedArbitraryChain: false,
            _expectedMyNum: defaultMyNum
        });
    }

    function test_execute_success_withArbitraryChain() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.arbitraryChain = true;
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);
        test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedArbitraryChain: true,
            _expectedMyNum: defaultMyNum
        });
    }

    // Test that we can execute a deployment where `arbitraryChain` is `true` and the chain ID is 0.
    // There seems to be broad social consensus that a network shouldn't have a chain ID of zero,
    // but we test this just to be thorough.
    function test_execute_success_withArbitraryChainAndChainIdZero() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.arbitraryChain = true;
        treeInputs.chainId = 0;
        vm.chainId(0);
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);
        test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedArbitraryChain: true,
            _expectedMyNum: defaultMyNum
        });
    }

    // Test that we can execute a deployment where `arbitraryChain` is `false` and the chain ID is
    // 0. There seems to be broad social consensus that a network shouldn't have a chain ID of zero,
    // but we test this just to be thorough.
    function test_execute_success_withoutArbitraryChainAndChainIdZero() external {
        DeploymentMerkleTreeInputs memory treeInputs = makeDeploymentMerkleTreeInputs(defaultTxs);
        treeInputs.chainId = 0;
        vm.chainId(0);
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(treeInputs);
        test_approveThenExecuteBatch({
            _txs: defaultTxs,
            _moduleInputs: moduleInputs,
            _expectedSuccesses: defaultExpectedSuccesses,
            _expectedArbitraryChain: false,
            _expectedMyNum: defaultMyNum
        });
    }

    //////////////////////////////// Multi-chain ////////////////////////////////////

    // This section tests that the TypeScript Merkle tree encoding logic works correctly for
    // multi-chain deployments. This section does not test anything in the `SphinxModule` that isn't
    // already covered by the other tests in this file.

    // Test executing a multi-chain deployment where each `APPROVE` leaf is identical, except for
    // the `chainId` field.
    function test_multichain_execute_success_identical() external {
        uint256[] memory forkIds = setUpMultiChainContracts();

        // Create the network-specific info for each chain. The only difference will be the chain
        // ID.
        NetworkDeploymentMerkleTreeInputs[]
            memory networks = new NetworkDeploymentMerkleTreeInputs[](3);
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            uint256 chainId = defaultChainIds[i];
            networks[i] = NetworkDeploymentMerkleTreeInputs({
                chainId: chainId,
                txs: defaultTxs,
                moduleProxyNonce: moduleProxy.merkleRootNonce()
            });
        }

        MultiChainDeploymentMerkleTreeInputs
            memory treeInputs = makeMultiChainDeploymentMerkleTreeInputs(networks);
        DeploymentModuleInputs[] memory moduleInputArray = getMultiChainDeploymentModuleInputs(
            treeInputs
        );

        // Sanity check that there's an element in the `moduleInputsArray` for each chain.
        assertEq(moduleInputArray.length, 3);

        // Test each chain.
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            DeploymentModuleInputs memory moduleInputs = moduleInputArray[i];
            uint256 chainId = defaultChainIds[i];
            uint256 forkId = forkIds[i];

            vm.selectFork(forkId);

            // Sanity check that we're on the correct chain.
            assertEq(chainId, block.chainid);

            test_approveThenExecuteBatch({
                _txs: defaultTxs,
                _moduleInputs: moduleInputs,
                _expectedSuccesses: defaultExpectedSuccesses,
                _expectedArbitraryChain: false,
                _expectedMyNum: defaultMyNum
            });
        }
    }

    // Test executing a multi-chain deployment where the `APPROVE` leaf on each chain is different.
    // Specifically, the `chainId`, `moduleProxyNonce`, and `SphinxTransaction`s will be different
    // on each chain.
    function test_multichain_execute_success_different() external {
        uint256[] memory forkIds = setUpMultiChainContracts();

        // Create the network-specific info for each chain.
        NetworkDeploymentMerkleTreeInputs[]
            memory networks = new NetworkDeploymentMerkleTreeInputs[](3);
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            // Create the `SphinxTransaction` array. The only difference between the chains is the
            // argument to `MyContract.setMyNum`.
            SphinxTransaction[] memory txs = defaultTxs;
            uint256 txDataArgument = expectedMyNumArray[i];
            // The `MyContract.setMyNum` call is the first transaction (index 0).
            txs[0].txData = abi.encodePacked(
                myContract.setMyNum.selector,
                abi.encode(txDataArgument)
            );

            uint256 forkId = forkIds[i];
            vm.selectFork(forkId);

            // Sanity check that we're on the correct chain.
            uint256 chainId = defaultChainIds[i];
            assertEq(chainId, block.chainid);

            // Update the `merkleRootNonce` in the `SphinxModuleProxy`.
            uint256 moduleProxyNonce = moduleProxyNonceArray[i];
            stdstore.target(address(moduleProxy)).sig("merkleRootNonce()").checked_write(
                moduleProxyNonce
            );
            assertEq(moduleProxy.merkleRootNonce(), moduleProxyNonce);

            networks[i] = NetworkDeploymentMerkleTreeInputs({
                chainId: chainId,
                txs: txs,
                moduleProxyNonce: moduleProxyNonce
            });
        }

        MultiChainDeploymentMerkleTreeInputs
            memory treeInputs = makeMultiChainDeploymentMerkleTreeInputs(networks);
        DeploymentModuleInputs[] memory moduleInputArray = getMultiChainDeploymentModuleInputs(
            treeInputs
        );

        // Sanity check that there's an element in the `moduleInputsArray` for each chain.
        assertEq(moduleInputArray.length, 3);

        // Test each chain.
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            DeploymentModuleInputs memory moduleInputs = moduleInputArray[i];
            SphinxTransaction[] memory txs = networks[i].txs;
            uint256 chainId = defaultChainIds[i];
            uint256 expectedMyNum = expectedMyNumArray[i];
            uint256 forkId = forkIds[i];

            vm.selectFork(forkId);

            // Sanity check that we're on the correct chain.
            assertEq(chainId, block.chainid);

            test_approveThenExecuteBatch({
                _txs: txs,
                _moduleInputs: moduleInputs,
                _expectedSuccesses: defaultExpectedSuccesses,
                _expectedArbitraryChain: false,
                _expectedMyNum: expectedMyNum
            });
        }
    }

    // Test cancelling the same root on multiple networks
    function test_multichain_cancel_identical() external {
        uint256[] memory forkIds = setUpMultiChainContracts();

        // Create the network-specific info for the Merkle root that will be approved.
        NetworkDeploymentMerkleTreeInputs[]
            memory approvalNetworks = new NetworkDeploymentMerkleTreeInputs[](3);
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            uint256 chainId = defaultChainIds[i];
            approvalNetworks[i] = NetworkDeploymentMerkleTreeInputs({
                chainId: chainId,
                txs: defaultTxs,
                moduleProxyNonce: moduleProxy.merkleRootNonce()
            });
        }

        // Create the `SphinxModule` inputs for the Merkle root that will be approved.
        MultiChainDeploymentMerkleTreeInputs
            memory approvalTreeInputs = makeMultiChainDeploymentMerkleTreeInputs(approvalNetworks);
        DeploymentModuleInputs[]
            memory approvalModuleInputsArray = getMultiChainDeploymentModuleInputs(
                approvalTreeInputs
            );

        // Sanity check that there's an approval for each chain.
        assertEq(approvalModuleInputsArray.length, 3);
        // Sanity check that the Merkle root is the same on all chains.
        bytes32 merkleRootToCancel = approvalModuleInputsArray[0].merkleRoot;
        for (uint256 i = 1; i < approvalModuleInputsArray.length; i++) {
            assertEq(merkleRootToCancel, approvalModuleInputsArray[i].merkleRoot);
        }

        // Approve the Merkle root on each chain and collect the network-specific info for the
        // Merkle root that will cancel the active deployments.
        NetworkCancellationMerkleTreeInputs[]
            memory networks = new NetworkCancellationMerkleTreeInputs[](defaultChainIds.length);
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            uint256 chainId = defaultChainIds[i];
            uint256 forkId = forkIds[i];
            DeploymentModuleInputs memory approvalModuleInputs = approvalModuleInputsArray[i];

            vm.selectFork(forkId);

            // Sanity check that we're on the correct chain.
            assertEq(chainId, block.chainid);

            test_approve({
                _moduleInputs: approvalModuleInputs,
                _expectedStatus: MerkleRootStatus.APPROVED,
                _expectedDeploymentUri: defaultDeploymentUri,
                _expectedArbitraryChain: false
            });

            networks[i] = NetworkCancellationMerkleTreeInputs({
                chainId: chainId,
                merkleRootToCancel: merkleRootToCancel,
                moduleProxyNonce: moduleProxy.merkleRootNonce()
            });
        }

        // Create the `SphinxModule` inputs that will cancel the active deployments.
        MultiChainCancellationMerkleTreeInputs
            memory treeInputs = makeMultiChainCancellationMerkleTreeInputs(networks);
        CancellationModuleInputs[]
            memory cancellationModuleInputArray = getMultiChainCancellationModuleInputs(treeInputs);

        // Sanity check that there's an element in the `cancellationModuleInputArray` for each chain.
        assertEq(cancellationModuleInputArray.length, 3);

        // Test each chain.
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            uint256 chainId = defaultChainIds[i];
            uint256 forkId = forkIds[i];
            DeploymentModuleInputs memory approvalModuleInputs = approvalModuleInputsArray[i];
            CancellationModuleInputs memory cancellationModuleInputs = cancellationModuleInputArray[
                i
            ];

            vm.selectFork(forkId);

            // Sanity check that we're on the correct chain.
            assertEq(chainId, block.chainid);

            test_cancel(approvalModuleInputs, cancellationModuleInputs);
        }
    }

    // Test cancelling different roots on multiple networks
    function test_multichain_cancel_different() external {
        uint256[] memory forkIds = setUpMultiChainContracts();

        // Approve a Merkle root on each chain and collect the network-specific info that we'll use
        // to cancel the active deployments.
        NetworkCancellationMerkleTreeInputs[]
            memory networks = new NetworkCancellationMerkleTreeInputs[](defaultChainIds.length);
        DeploymentModuleInputs[] memory approvalModuleInputsArray = new DeploymentModuleInputs[](
            defaultChainIds.length
        );
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            uint256 chainId = defaultChainIds[i];
            uint256 forkId = forkIds[i];

            vm.selectFork(forkId);

            // Sanity check that we're on the correct chain.
            assertEq(chainId, block.chainid);

            // Create and approve a Merkle root. The Merkle root will be different on each chain
            // because each tree will have a single `APPROVE` leaf with a different `chainId` field.
            DeploymentMerkleTreeInputs memory treeInputsToApprove = makeDeploymentMerkleTreeInputs(
                defaultTxs
            );
            treeInputsToApprove.chainId = chainId;
            DeploymentModuleInputs memory approvalModuleInputs = getDeploymentModuleInputs(
                treeInputsToApprove
            );
            test_approve({
                _moduleInputs: approvalModuleInputs,
                _expectedStatus: MerkleRootStatus.APPROVED,
                _expectedDeploymentUri: defaultDeploymentUri,
                _expectedArbitraryChain: false
            });

            approvalModuleInputsArray[i] = approvalModuleInputs;
            networks[i] = NetworkCancellationMerkleTreeInputs({
                chainId: chainId,
                merkleRootToCancel: approvalModuleInputs.merkleRoot,
                moduleProxyNonce: moduleProxy.merkleRootNonce()
            });
        }

        // Create the `SphinxModule` inputs for the Merkle tree that will cancel the active
        // deployments.
        MultiChainCancellationMerkleTreeInputs
            memory treeInputs = makeMultiChainCancellationMerkleTreeInputs(networks);
        CancellationModuleInputs[]
            memory cancellationModuleInputArray = getMultiChainCancellationModuleInputs(treeInputs);

        // Sanity check that there's an element in the `cancellationModuleInputArray` for each chain.
        assertEq(cancellationModuleInputArray.length, 3);
        // Sanity check that the `merkleRootToCancel` is different on each chain.
        assertTrue(networks[0].merkleRootToCancel != networks[1].merkleRootToCancel);
        assertTrue(networks[0].merkleRootToCancel != networks[2].merkleRootToCancel);
        assertTrue(networks[1].merkleRootToCancel != networks[2].merkleRootToCancel);

        // Test each chain.
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            uint256 chainId = defaultChainIds[i];
            uint256 forkId = forkIds[i];
            DeploymentModuleInputs memory moduleInputsToCancel = approvalModuleInputsArray[i];
            CancellationModuleInputs memory cancellationModuleInputs = cancellationModuleInputArray[
                i
            ];

            vm.selectFork(forkId);

            // Sanity check that we're on the correct chain.
            assertEq(chainId, block.chainid);

            test_cancel(moduleInputsToCancel, cancellationModuleInputs);
        }
    }

    //////////////////////////////// _getLeafHash ////////////////////////////////////

    function test__getLeafHash_success() external {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        SphinxLeaf memory approvalLeaf = moduleInputs.approvalLeafWithProof.leaf;
        bytes32 expected = keccak256(abi.encodePacked(keccak256(abi.encode(approvalLeaf))));
        assertEq(expected, _getLeafHash(approvalLeaf));
    }

    //////////////////////////////// Helper functions ////////////////////////////////////

    function test_approve(
        DeploymentModuleInputs memory _moduleInputs,
        MerkleRootStatus _expectedStatus,
        string memory _expectedDeploymentUri,
        bool _expectedArbitraryChain
    ) internal {
        uint256 initialNonce = moduleProxy.merkleRootNonce();
        uint256 expectedNumLeaves = _moduleInputs.executionLeavesWithProofs.length + 1;
        assertEq(moduleProxy.activeMerkleRoot(), bytes32(0));

        bytes memory typedData = abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPE_HASH, _moduleInputs.merkleRoot))
        );
        vm.expectCall(
            safeProxy,
            abi.encodePacked(
                GnosisSafe(safeProxy).checkSignatures.selector,
                abi.encode(keccak256(typedData), typedData, _moduleInputs.ownerSignatures)
            )
        );
        vm.expectEmit(address(moduleProxy));
        emit SphinxMerkleRootApproved({
            merkleRoot: _moduleInputs.merkleRoot,
            nonce: initialNonce,
            executor: deploymentExecutor,
            numLeaves: expectedNumLeaves,
            uri: _expectedDeploymentUri
        });
        if (_expectedStatus == MerkleRootStatus.COMPLETED) {
            vm.expectEmit(address(moduleProxy));
            emit SphinxMerkleRootCompleted(_moduleInputs.merkleRoot);
        }
        vm.prank(deploymentExecutor);
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
            MerkleRootStatus approvedStatus,
            bool approvedArbitraryChain
        ) = moduleProxy.merkleRootStates(_moduleInputs.merkleRoot);
        assertEq(approvedNumLeaves, expectedNumLeaves);
        assertEq(approvedLeavesExecuted, 1);
        assertEq(approvedUri, _expectedDeploymentUri);
        assertEq(approvedExecutor, deploymentExecutor);
        assertEq(approvedStatus, _expectedStatus);
        assertEq(approvedArbitraryChain, _expectedArbitraryChain);

        if (_expectedStatus == MerkleRootStatus.COMPLETED) {
            assertEq(moduleProxy.activeMerkleRoot(), bytes32(0));
        } else {
            assertEq(moduleProxy.activeMerkleRoot(), _moduleInputs.merkleRoot);
        }
        assertEq(moduleProxy.merkleRootNonce(), initialNonce + 1);
    }

    function test_approveThenExecuteBatch(
        SphinxTransaction[] memory _txs,
        DeploymentModuleInputs memory _moduleInputs,
        bool[] memory _expectedSuccesses,
        bool _expectedArbitraryChain,
        uint256 _expectedMyNum
    ) internal {
        assertEq(_txs.length, _expectedSuccesses.length);

        test_preExecution();

        test_approve({
            _moduleInputs: _moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
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
        emit SphinxMerkleRootCompleted(_moduleInputs.merkleRoot);
        vm.prank(deploymentExecutor);
        moduleProxy.execute(_moduleInputs.executionLeavesWithProofs);

        test_postExecution(_moduleInputs, _expectedMyNum);
    }

    function test_preExecution() internal {
        // Check the initial values of the contracts that'll be updated during the deployment.
        assertEq(myContract.myNum(), 0);
        assertFalse(myDelegateCallContract.wasDelegateCalled());
        assertEq(deployedViaCreate.code.length, 0);
        assertEq(deployedViaCreate2.code.length, 0);
        assertEq(deployedViaCreate3.code.length, 0);
        assertEq(address(myContract).balance, 0);
    }

    function test_postExecution(
        DeploymentModuleInputs memory _moduleInputs,
        uint256 _expectedMyNum
    ) internal {
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
            MerkleRootStatus status,
            bool arbitraryChain
        ) = moduleProxy.merkleRootStates(_moduleInputs.merkleRoot);
        assertEq(expectedNumLeaves, numLeaves);
        assertEq(leavesExecuted, numLeaves);
        assertEq(expectedUri, uri);
        assertEq(expectedExecutor, actualExecutor);
        assertEq(status, MerkleRootStatus.COMPLETED);
        assertEq(expectedArbitraryChain, arbitraryChain);

        // The first transaction sets the `myNum` variable in `MyContract`.
        assertEq(myContract.myNum(), _expectedMyNum);
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

    function makeDeploymentMerkleTreeInputs(
        SphinxTransaction memory _tx
    ) internal view returns (DeploymentMerkleTreeInputs memory) {
        SphinxTransaction[] memory txs = new SphinxTransaction[](1);
        txs[0] = _tx;
        return makeDeploymentMerkleTreeInputs(txs);
    }

    function makeDeploymentMerkleTreeInputs(
        SphinxTransaction[] memory _txs
    ) internal view returns (DeploymentMerkleTreeInputs memory) {
        return
            DeploymentMerkleTreeInputs({
                chainId: block.chainid,
                txs: _txs,
                moduleProxyNonce: moduleProxy.merkleRootNonce(),
                ownerWallets: ownerWallets,
                moduleProxy: moduleProxy,
                executor: deploymentExecutor,
                safeProxy: address(safeProxy),
                uri: defaultDeploymentUri,
                arbitraryChain: false,
                forceNumLeavesValue: false,
                overridingNumLeavesValue: 0,
                forceApprovalLeafIndexNonZero: false,
                forceExecutionLeavesChainIdNonZero: false,
                forceApprovalLeafChainIdNonZero: false
            });
    }

    function makeMultiChainDeploymentMerkleTreeInputs(
        NetworkDeploymentMerkleTreeInputs[] memory _networks
    ) internal view returns (MultiChainDeploymentMerkleTreeInputs memory) {
        return
            MultiChainDeploymentMerkleTreeInputs({
                networks: _networks,
                ownerWallets: ownerWallets,
                moduleProxy: moduleProxy,
                executor: deploymentExecutor,
                safeProxy: address(safeProxy),
                uri: defaultDeploymentUri,
                arbitraryChain: false,
                forceNumLeavesValue: false,
                overridingNumLeavesValue: 0,
                forceApprovalLeafIndexNonZero: false,
                forceExecutionLeavesChainIdNonZero: false,
                forceApprovalLeafChainIdNonZero: false
            });
    }

    function makeCancellationMerkleTreeInputs()
        internal
        view
        returns (CancellationMerkleTreeInputs memory)
    {
        return
            CancellationMerkleTreeInputs({
                chainId: block.chainid,
                merkleRootToCancel: moduleProxy.activeMerkleRoot(),
                moduleProxyNonce: moduleProxy.merkleRootNonce(),
                ownerWallets: ownerWallets,
                moduleProxy: moduleProxy,
                executor: cancellationExecutor,
                safeProxy: address(safeProxy),
                uri: defaultCancellationUri,
                forceCancellationLeafIndexNonZero: false
            });
    }

    function makeMultiChainCancellationMerkleTreeInputs(
        NetworkCancellationMerkleTreeInputs[] memory _networks
    ) internal view returns (MultiChainCancellationMerkleTreeInputs memory) {
        return
            MultiChainCancellationMerkleTreeInputs({
                ownerWallets: ownerWallets,
                networks: _networks,
                moduleProxy: moduleProxy,
                executor: cancellationExecutor,
                safeProxy: address(safeProxy),
                uri: defaultCancellationUri,
                forceCancellationLeafIndexNonZero: false
            });
    }

    function test_execute_oneByOne(DeploymentModuleInputs memory _moduleInputs) internal {
        uint256 numExecutionLeaves = _moduleInputs.executionLeavesWithProofs.length;
        uint256 finalExecutionLeafIndex = numExecutionLeaves - 1;
        for (uint256 i = 0; i < numExecutionLeaves; i++) {
            SphinxLeafWithProof memory executionLeafWithProof = _moduleInputs
                .executionLeavesWithProofs[i];
            (, uint256 initialLeavesExecuted, , , , ) = moduleProxy.merkleRootStates(
                _moduleInputs.merkleRoot
            );

            vm.expectEmit(address(moduleProxy));
            emit SphinxActionSucceeded(_moduleInputs.merkleRoot, executionLeafWithProof.leaf.index);
            if (i == finalExecutionLeafIndex) {
                vm.expectEmit(address(moduleProxy));
                emit SphinxMerkleRootCompleted(_moduleInputs.merkleRoot);
            }

            SphinxLeafWithProof[] memory executionLeafWithProofArray = new SphinxLeafWithProof[](1);
            executionLeafWithProofArray[0] = executionLeafWithProof;
            vm.prank(deploymentExecutor);
            moduleProxy.execute(executionLeafWithProofArray);
            (, uint256 leavesExecuted, , , MerkleRootStatus status, ) = moduleProxy
                .merkleRootStates(_moduleInputs.merkleRoot);
            if (i == finalExecutionLeafIndex) {
                assertEq(status, MerkleRootStatus.COMPLETED);
            } else {
                assertEq(status, MerkleRootStatus.APPROVED);
            }
            assertEq(leavesExecuted, initialLeavesExecuted + 1);
        }
    }

    function test_approveDefaultDeployment() internal {
        DeploymentModuleInputs memory moduleInputs = getDeploymentModuleInputs(
            makeDeploymentMerkleTreeInputs(defaultTxs)
        );
        test_approve({
            _moduleInputs: moduleInputs,
            _expectedStatus: MerkleRootStatus.APPROVED,
            _expectedDeploymentUri: defaultDeploymentUri,
            _expectedArbitraryChain: false
        });
    }

    function test_cancel(
        DeploymentModuleInputs memory _moduleInputsToCancel,
        CancellationModuleInputs memory _cancellationInputs
    ) internal {
        uint256 initialNonce = moduleProxy.merkleRootNonce();

        bytes memory typedData = abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPE_HASH, _cancellationInputs.merkleRoot))
        );
        vm.expectCall(
            safeProxy,
            abi.encodePacked(
                GnosisSafe(safeProxy).checkSignatures.selector,
                abi.encode(keccak256(typedData), typedData, _cancellationInputs.ownerSignatures)
            )
        );
        vm.expectEmit(address(moduleProxy));
        emit SphinxMerkleRootCanceled({
            completedMerkleRoot: _cancellationInputs.merkleRoot,
            canceledMerkleRoot: _moduleInputsToCancel.merkleRoot,
            nonce: initialNonce,
            executor: cancellationExecutor,
            uri: defaultCancellationUri
        });
        vm.expectEmit(address(moduleProxy));
        emit SphinxMerkleRootCompleted(_cancellationInputs.merkleRoot);
        vm.prank(cancellationExecutor);
        moduleProxy.cancel(
            _cancellationInputs.merkleRoot,
            _cancellationInputs.cancellationLeafWithProof,
            _cancellationInputs.ownerSignatures
        );

        (, , , , MerkleRootStatus canceledMerkleRootStatus, ) = moduleProxy.merkleRootStates(
            _moduleInputsToCancel.merkleRoot
        );
        assertEq(canceledMerkleRootStatus, MerkleRootStatus.CANCELED);
        assertEq(moduleProxy.activeMerkleRoot(), bytes32(0));

        (
            uint256 cancellationNumLeaves,
            uint256 cancellationLeavesExecuted,
            string memory cancellationUri,
            address cancellationExecutorOnChain,
            MerkleRootStatus cancellationRootStatus,
            bool cancellationArbitraryChain
        ) = moduleProxy.merkleRootStates(_cancellationInputs.merkleRoot);
        assertEq(cancellationNumLeaves, 1);
        assertEq(cancellationLeavesExecuted, 1);
        assertEq(cancellationUri, defaultCancellationUri);
        assertEq(cancellationExecutorOnChain, cancellationExecutor);
        assertEq(cancellationRootStatus, MerkleRootStatus.COMPLETED);
        assertEq(cancellationArbitraryChain, false);

        assertEq(moduleProxy.merkleRootNonce(), initialNonce + 1);
    }

    /**
     * @notice Sets up the contracts in this test suite on forked networks.
     */
    function setUpMultiChainContracts() internal returns (uint256[] memory _forkIds) {
        uint256[] memory forkIds = new uint256[](rpcUrls.length);
        for (uint256 i = 0; i < defaultChainIds.length; i++) {
            string memory rpcUrl = rpcUrls[i];
            forkIds[i] = vm.createSelectFork(rpcUrl);

            SphinxModuleProxyFactory deployedModuleProxyFactory = new SphinxModuleProxyFactory{
                salt: bytes32(0)
            }();
            // Sanity check that the `SphinxModuleProxyFactory`'s address matches the address in the
            // standard test suite.
            assertEq(address(deployedModuleProxyFactory), address(moduleProxyFactory));

            GnosisSafeAddresses memory gnosisSafeAddresses = deployGnosisSafeContracts(
                gnosisSafeVersion
            );

            myContract = new MyContract{ salt: bytes32(0) }();
            myDelegateCallContract = new MyDelegateCallContract{ salt: bytes32(0) }();

            (
                address payable deployedSafeProxy,
                SphinxModule deployedModuleProxy
            ) = initializeGnosisSafeWithModule(moduleProxyFactory, gnosisSafeAddresses);
            assertEq(address(deployedSafeProxy), address(safeProxy));
            assertEq(address(deployedModuleProxy), address(moduleProxy));

            // Give the Gnosis Safe 1 ether
            vm.deal(address(safeProxy), 1 ether);
        }
        return forkIds;
    }

    function assertEq(MerkleRootStatus a, MerkleRootStatus b) internal pure {
        require(uint256(a) == uint256(b), "MerkleRootStatus mismatch");
    }

    /**
     * @notice This function sets up then executes a transaction that:
     *        - Deploys a Gnosis Safe.
     *        - Deploys a `SphinxModuleProxy`.
     *        - Enables the `SphinxModuleProxy` in the Gnosis Safe.
     *
     *        We'll do this by encoding all of this information into the `initializer` data that'll
     *        be submitted to the Gnosis Safe Proxy Factory. Specifically, we'll use Gnosis Safe's
     *        `MultiSend` contract to execute two transactions on the `SphinxModuleProxyFactory`:
     *        1. `deploySphinxModuleProxyFromSafe`
     *        2. `enableSphinxModuleProxyFromSafe`
     *
     * @dev    We refer to this function in Sphinx's specs. Make sure to update the
     *         documentation if you change the name of this function or change its file
     *         location.
     */
    function initializeGnosisSafeWithModule(
        SphinxModuleProxyFactory _moduleProxyFactory,
        GnosisSafeAddresses memory _gnosisSafeAddresses
    ) internal returns (address payable deployedSafeProxy, SphinxModule deployedModuleProxy) {
        // Create the first transaction, `SphinxModuleProxyFactory.deploySphinxModuleProxyFromSafe`.
        bytes memory encodedDeployModuleCall = abi.encodeWithSelector(
            _moduleProxyFactory.deploySphinxModuleProxyFromSafe.selector,
            // Use the zero-hash as the salt.
            bytes32(0)
        );
        // Encode the first transaction data in a format that can be executed using `MultiSend`.
        bytes memory firstMultiSendData = abi.encodePacked(
            // We use `Call` so that the deployer of the `SphinxModuleProxy` is the
            // `SphinxModuleProxyFactory`. This makes it easier for off-chain tooling to calculate
            // the deployed `SphinxModuleProxy` address.
            uint8(Operation.Call),
            _moduleProxyFactory,
            uint256(0),
            encodedDeployModuleCall.length,
            encodedDeployModuleCall
        );
        // Create the second transaction,
        // `SphinxModuleProxyFactory.enableSphinxModuleProxyFromSafe`.
        bytes memory encodedEnableModuleCall = abi.encodeWithSelector(
            _moduleProxyFactory.enableSphinxModuleProxyFromSafe.selector,
            // Use the zero-hash as the salt.
            bytes32(0)
        );
        // Encode the second transaction data in a format that can be executed using `MultiSend`.
        bytes memory secondMultiSendData = abi.encodePacked(
            uint8(Operation.DelegateCall),
            _moduleProxyFactory,
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
        GnosisSafeProxy deployedGnosisSafeProxy = GnosisSafeProxyFactory(
            _gnosisSafeAddresses.safeProxyFactory
        ).createProxyWithNonce(_gnosisSafeAddresses.safeSingleton, safeInitializerData, 0);

        // Return the Gnosis Safe proxy and the `SphinxModuleProxy`.
        deployedSafeProxy = payable(address(deployedGnosisSafeProxy));
        deployedModuleProxy = SphinxModule(
            _moduleProxyFactory.computeSphinxModuleProxyAddress(
                address(deployedSafeProxy),
                address(deployedSafeProxy),
                0
            )
        );
    }
}

contract SphinxModuleProxy_GnosisSafe_L1_1_3_0_Test is AbstractSphinxModuleProxy_Test {
    function setUp() public {
        AbstractSphinxModuleProxy_Test.setUp(GnosisSafeVersion.L1_1_3_0);
    }
}

contract SphinxModuleProxy_GnosisSafe_L2_1_3_0_Test is AbstractSphinxModuleProxy_Test {
    function setUp() public {
        AbstractSphinxModuleProxy_Test.setUp(GnosisSafeVersion.L2_1_3_0);
    }
}

contract SphinxModuleProxy_GnosisSafe_L1_1_4_1_Test is AbstractSphinxModuleProxy_Test {
    function setUp() public {
        AbstractSphinxModuleProxy_Test.setUp(GnosisSafeVersion.L1_1_4_1);
    }
}

contract SphinxModuleProxy_GnosisSafe_L2_1_4_1_Test is AbstractSphinxModuleProxy_Test {
    function setUp() public {
        AbstractSphinxModuleProxy_Test.setUp(GnosisSafeVersion.L2_1_4_1);
    }
}
