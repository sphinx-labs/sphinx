// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {
    ChugSplashAction,
    ChugSplashActionType,
    ChugSplashBundleState,
    ChugSplashBundleStatus
} from "../contracts/ChugSplashDataTypes.sol";
import { Test, stdStorage, StdStorage } from "forge-std/Test.sol";
import { Proxy } from "../contracts/libraries/Proxy.sol";
import { ChugSplashManager } from "../contracts/ChugSplashManager.sol";
import { ChugSplashRegistry } from "../contracts/ChugSplashRegistry.sol";
import { ChugSplashBootLoader } from "../contracts/ChugSplashBootLoader.sol";
import { ProxyUpdater } from "../contracts/ProxyUpdater.sol";
import { DefaultAdapter } from "../contracts/adapters/DefaultAdapter.sol";
import { Create2 } from "../contracts/libraries/Create2.sol";

contract ChugSplashManager_Test is Test {
    using stdStorage for StdStorage;

    event ChugSplashBundleProposed(
        bytes32 indexed bundleId,
        bytes32 bundleRoot,
        uint256 bundleSize,
        string configUri
    );

    event ChugSplashBundleApproved(bytes32 indexed bundleId);

    event ChugSplashBundleCancelled(
        bytes32 indexed bundleId,
        address indexed owner,
        uint256 actionsExecuted
    );

    event ProxyOwnershipTransferred(
        string indexed targetHash,
        address indexed proxy,
        bytes32 indexed proxyType,
        address newOwner,
        string target
    );

    event ChugSplashBundleClaimed(bytes32 indexed bundleId, address indexed executor);

    event ChugSplashActionExecuted(
        bytes32 indexed bundleId,
        address indexed executor,
        uint256 actionIndex
    );

    event ChugSplashBundleCompleted(
        bytes32 indexed bundleId,
        address indexed executor,
        uint256 actionsExecuted
    );

    event ExecutorPaymentClaimed(address indexed executor, uint256 amount);

    event OwnerWithdrewETH(address indexed owner, uint256 amount);

    event ProposerAdded(address indexed proposer, address indexed owner);

    event ProposerRemoved(address indexed proposer, address indexed owner);

    event ETHDeposited(address indexed from, uint256 indexed amount);

    bytes32 constant EIP1967_IMPLEMENTATION_KEY =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    ChugSplashAction[] actions;
    uint256[] actionIndexes = [0, 1, 2];
    bytes32[][] proofs = [
        [
            bytes32(0x9ef420ca34e65ccc237ad848489a9cbd981fafa6149ff4ab1a580f6fee74cc8d),
            bytes32(0x65270d352485b005d92e8f8ac8cf10b7219be4e2698fe30a4fada427ad5f18bd)
        ],
        [
            bytes32(0x651679e022c1442620c92d5866e72525eadd105427745782b5923d1f5a383087),
            bytes32(0x65270d352485b005d92e8f8ac8cf10b7219be4e2698fe30a4fada427ad5f18bd)
        ],
        [
            bytes32(0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563),
            bytes32(0x0c88ea174f64e74049bc6e056e3f2a3945cbbbc7c12cd2859495aab96a1d361d)
        ]
    ];
    string configUri = "ipfs://QmXdc7np4jdkHLwrumWXHhy9adK4qYsqEFX9VkEdBqMpPm";
    bytes32 bundleId = 0xacdebe08df0d7c9650dfca6191bc88c5a50eb099b18d5cfa663e6f0f11165e2b;
    bytes32 bundleRoot = 0xbe5e67004de3ec5f536e2b5d1ccb2d6d924956a55a866706e97b671f33a8b648;

    address proposer = address(64);
    address owner = address(128);
    address nonOwner = address(256);
    address executor1 = address(512);
    address executor2 = address(1024);
    uint256 initialTimestamp = 1641070800;
    uint256 baseFee = 1 gwei;
    uint256 bundleExecutionCost = 2 ether;
    string projectName = 'TestProject';
    uint256 ownerBondAmount = 10e8 gwei; // 0.1 ETH
    uint256 executorBondAmount = 1 ether;
    uint256 executionLockTime = 15 minutes;
    uint256 executorPaymentPercentage = 20;
    uint256 bundleSize = actionIndexes.length;
    ChugSplashAction firstAction;
    ChugSplashAction secondAction;
    ChugSplashAction[] setImplementationActionArray;
    uint256[] setImplementationActionIndexArray;
    bytes32[][] setImplementationProofArray;

    ChugSplashBootLoader bootloader;
    ChugSplashManager manager;
    ChugSplashRegistry registry;
    ProxyUpdater proxyUpdater;
    DefaultAdapter adapter;

    function setUp() external {
        firstAction = ChugSplashAction({
            target: "SecondSimpleStorage",
            actionType: ChugSplashActionType.DEPLOY_IMPLEMENTATION,
            data: hex"60e060405234801561001057600080fd5b506040516105cb3803806105cb8339818101604052810190610032919061015c565b8260ff1660808160ff168152505081151560a0811515815250508073ffffffffffffffffffffffffffffffffffffffff1660c08173ffffffffffffffffffffffffffffffffffffffff16815250505050506101af565b600080fd5b600060ff82169050919050565b6100a38161008d565b81146100ae57600080fd5b50565b6000815190506100c08161009a565b92915050565b60008115159050919050565b6100db816100c6565b81146100e657600080fd5b50565b6000815190506100f8816100d2565b92915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000610129826100fe565b9050919050565b6101398161011e565b811461014457600080fd5b50565b60008151905061015681610130565b92915050565b60008060006060848603121561017557610174610088565b5b6000610183868287016100b1565b9350506020610194868287016100e9565b92505060406101a586828701610147565b9150509250925092565b60805160a05160c0516103ed6101de600039600061015f01526000610187015260006101af01526103ed6000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c80631ca6cbeb146100515780632277fe821461006f578063ee460c641461008d578063f2c9ecd8146100ab575b600080fd5b6100596100c9565b604051610066919061026c565b60405180910390f35b61007761015b565b60405161008491906102cf565b60405180910390f35b610095610183565b6040516100a29190610305565b60405180910390f35b6100b36101ab565b6040516100c0919061033c565b60405180910390f35b6060600080546100d890610386565b80601f016020809104026020016040519081016040528092919081815260200182805461010490610386565b80156101515780601f1061012657610100808354040283529160200191610151565b820191906000526020600020905b81548152906001019060200180831161013457829003601f168201915b5050505050905090565b60007f0000000000000000000000000000000000000000000000000000000000000000905090565b60007f0000000000000000000000000000000000000000000000000000000000000000905090565b60007f0000000000000000000000000000000000000000000000000000000000000000905090565b600081519050919050565b600082825260208201905092915050565b60005b8381101561020d5780820151818401526020810190506101f2565b8381111561021c576000848401525b50505050565b6000601f19601f8301169050919050565b600061023e826101d3565b61024881856101de565b93506102588185602086016101ef565b61026181610222565b840191505092915050565b600060208201905081810360008301526102868184610233565b905092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006102b98261028e565b9050919050565b6102c9816102ae565b82525050565b60006020820190506102e460008301846102c0565b92915050565b60008115159050919050565b6102ff816102ea565b82525050565b600060208201905061031a60008301846102f6565b92915050565b600060ff82169050919050565b61033681610320565b82525050565b6000602082019050610351600083018461032d565b92915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b6000600282049050600182168061039e57607f821691505b6020821081036103b1576103b0610357565b5b5091905056fea26469706673582212201bf5707496ec5c58e6da2f78bf4f13bb8a3e0d2dede540dedb15a521ee12ad3b64736f6c634300080f0033000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000001111111111111111111111111111111111111111"
        });
        secondAction = ChugSplashAction({
            target: "SecondSimpleStorage",
            actionType: ChugSplashActionType.SET_STORAGE,
            data: hex"00000000000000000000000000000000000000000000000000000000000000005365636f6e64000000000000000000000000000000000000000000000000000c"
        });

        actions.push(firstAction);
        actions.push(secondAction);

        setImplementationActionArray.push(
            ChugSplashAction({
                target: "SecondSimpleStorage",
                actionType: ChugSplashActionType.SET_IMPLEMENTATION,
                data: new bytes(0)
            })
        );
        setImplementationActionIndexArray = [actionIndexes[2]];
        setImplementationProofArray = [proofs[2]];

        vm.warp(initialTimestamp);
        vm.fee(baseFee);

        bootloader = new ChugSplashBootLoader{salt: bytes32(0) }();

        address registryProxyAddress = Create2.compute(
            address(this),
            bytes32(0),
            abi.encodePacked(type(Proxy).creationCode, abi.encode(address(owner)))
        );

        address proxyUpdaterAddress = Create2.compute(
            address(bootloader),
            bytes32(0),
            type(ProxyUpdater).creationCode
        );

        ChugSplashManager managerImplementation = new ChugSplashManager{ salt: bytes32(0) }(
            ChugSplashRegistry(registryProxyAddress),
            projectName,
            owner,
            proxyUpdaterAddress,
            executorBondAmount,
            executionLockTime,
            ownerBondAmount,
            executorPaymentPercentage
        );

        bootloader.initialize(
            owner,
            executorBondAmount,
            executionLockTime,
            ownerBondAmount,
            executorPaymentPercentage,
            address(managerImplementation),
            registryProxyAddress
        );

        Proxy registryProxy = new Proxy{ salt: bytes32(0)}(owner);

        vm.startPrank(owner);
        registryProxy.upgradeTo(address(bootloader.registryImplementation()));
        vm.stopPrank();

        // Convert the registry proxy to a ChugSplashRegistry type
        registry = ChugSplashRegistry(address(registryProxy));

        registry.register(projectName, owner);
        manager = registry.projects(projectName);
        adapter = new DefaultAdapter();

        registry.addProxyType(bytes32(0), address(adapter));
    }

    // constructor:
    // - initializes variables correctly
    function test_constructor_success() external {
        assertEq(address(manager.registry()), address(registry));
        assertEq(address(manager.proxyUpdater()), address(bootloader.proxyUpdater()));
        assertEq(manager.executorBondAmount(), executorBondAmount);
        assertEq(manager.executionLockTime(), executionLockTime);
        assertEq(manager.ownerBondAmount(), ownerBondAmount);
        assertEq(manager.executorPaymentPercentage(), executorPaymentPercentage);
        assertEq(manager.name(), projectName);
        assertEq(manager.owner(), owner);
    }

    // initialize:
    // - reverts if called twice
    function test_initialize_revert_calledTwice() external {
        vm.expectRevert("Initializable: contract is already initialized");
        manager.initialize(projectName, address(owner));
    }

    // computeBundleId:
    // - returns bundle id
    function test_computeBundleId_success() external {
        bytes32 expectedBundleId = keccak256(abi.encode(bundleRoot, bundleSize, configUri));
        assertEq(manager.computeBundleId(bundleRoot, bundleSize, configUri), expectedBundleId);
    }

    function test_getSelectedExecutor_success() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        assertEq(manager.getSelectedExecutor(bundleId), executor1);
    }

    function test_proposeChugSplashBundle_revert_notProposerOrOwner() external {
        vm.expectRevert("ChugSplashManager: caller must be proposer or owner");
        vm.prank(executor1);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
    }

    // proposeChugSplashBundle:
    // - reverts if bundle's status is not `EMPTY`
    function test_proposeChugSplashBundle_revert_nonEmpty() external {
        vm.startPrank(owner);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
        vm.expectRevert("ChugSplashManager: bundle already exists");
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
    }

    function test_proposeChugSplashBundle_success_proposer() external {
        vm.prank(owner);
        manager.addProposer(proposer);
        test_proposeChugSplashBundle_success(proposer);
    }

    function test_proposeChugSplashBundle_success_owner() external {
        test_proposeChugSplashBundle_success(owner);
    }

    // proposeChugSplashBundle:
    // - updates bundles mapping
    function test_proposeChugSplashBundle_success(address _caller) internal {
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleProposed(bundleId, bundleRoot, bundleSize, configUri);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleProposed")
            )
        );

        vm.prank(_caller);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        assertEq(uint8(bundle.status), uint8(ChugSplashBundleStatus.PROPOSED));
        assertEq(bundle.executions.length, bundleSize);
        for (uint i = 0; i < bundle.executions.length; i++) {
            assertEq(bundle.executions[i], false);
        }
        assertEq(bundle.merkleRoot, bundleRoot);
    }

    // approveChugSplashBundle:
    // - reverts if not called by owner
    function test_approveChugSplashBundle_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.approveChugSplashBundle(bundleId);
    }

    // approveChugSplashBundle:
    // - reverts if the manager's balance minus the totalDebt is less than the owner bond amount
    function test_approveChugSplashBundle_revert_balance() external {
        assertEq(address(manager).balance, 0);
        uint256 totalDebt = 1 gwei;
        uint256 insufficientAmount = ownerBondAmount + totalDebt - 1;

        stdstore
            .target(address(manager))
            .sig("totalDebt()")
            .checked_write(totalDebt);

        (bool success, ) = address(manager).call{ value: insufficientAmount }(new bytes(0));
        assertTrue(success);
        vm.expectRevert("ChugSplashManager: insufficient balance in manager");
        vm.prank(owner);
        manager.approveChugSplashBundle(bundleId);
    }

    // approveChugSplashBundle:
    // - reverts if bundle's status is not `PROPOSED`
    function test_approveChugSplashBundle_revert_notProposed() external {
        (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
        assertTrue(success);

        vm.expectRevert("ChugSplashManager: bundle does not exist or has already been approved or completed");
        vm.prank(owner);
        manager.approveChugSplashBundle(bundleId);
    }

    // approveChugSplashBundle:
    // - reverts if there is an active bundle
    function test_approveChugSplashBundle_revert_activeBundle() external {
        (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
        assertTrue(success);

        stdstore
            .target(address(manager))
            .sig("activeBundleId()")
            .checked_write(bytes32(hex"1337"));

        vm.startPrank(owner);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);

        vm.expectRevert("ChugSplashManager: another bundle has been approved and not yet completed");
        manager.approveChugSplashBundle(bundleId);
    }

    // approveChugSplashBundle:
    // - updates bundles mapping
    function test_approveChugSplashBundle_success() external {
        (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
        assertTrue(success);

        vm.startPrank(owner);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);

        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleApproved(bundleId);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleApproved")
            )
        );
        manager.approveChugSplashBundle(bundleId);
        assertEq(manager.activeBundleId(), bundleId);
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.APPROVED));
    }

    function test_executeChugSplashAction_revert_noActiveBundle() external {
        vm.expectRevert("ChugSplashManager: no bundle has been approved for execution");
        manager.executeChugSplashAction(
            firstAction, actionIndexes[0], proofs[0]
        );
    }

    function test_executeChugSplashAction_revert_alreadyExecuted() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();

        vm.expectRevert("ChugSplashManager: action has already been executed");
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_revert_wrongExecutor() external {
        helper_proposeThenApproveThenFundThenClaimBundle();

        vm.prank(executor2);
        vm.expectRevert("ChugSplashManager: caller is not approved executor for active bundle ID");
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_revert_invalidProof() external {
        helper_proposeThenApproveThenFundThenClaimBundle();

        uint256 incorrectActionIndex = actionIndexes[0] + 1;
        hoax(executor1);
        vm.expectRevert("ChugSplashManager: invalid bundle action proof");
        manager.executeChugSplashAction(firstAction, incorrectActionIndex, proofs[0]);
    }

    function test_executeChugSplashAction_revert_noAdapter() external {
        helper_proposeThenApproveThenFundThenClaimBundle();

        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(registry.adapters.selector, bytes32(0)),
            abi.encode(address(0))
        );
        hoax(executor1);
        vm.expectRevert("ChugSplashManager: proxy type has no adapter");
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_success_deployProxyAndImplementation() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        assertEq(proxyAddress.code.length, 0);
        address implementationAddress = Create2.compute(
            address(manager),
            keccak256(abi.encode(bundleId, bytes(firstAction.target))),
            firstAction.data
        );
        assertEq(implementationAddress.code.length, 0);
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashActionExecuted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, executor1, actionIndexes[0]);
        helper_executeFirstAction();
        uint256 finalTotalDebt = manager.totalDebt();
        uint256 finalExecutorDebt = manager.debt(executor1);

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        uint256 executionGasUsed = 760437;
        uint256 estExecutorPayment = baseFee * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertGt(proxyAddress.code.length, 0);
        assertGt(implementationAddress.code.length, 0);
        assertEq(bundle.actionsExecuted, 1);
        assertTrue(bundle.executions[actionIndexes[0]]);
        bytes32 salt = keccak256(abi.encode(bundleId, bytes(firstAction.target)));
        assertEq(manager.implementations(salt), implementationAddress);
        assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
        assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
    }

    function test_executeChugSplashAction_success_setStorage() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashActionExecuted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, executor1, actionIndexes[1]);
        helper_executeSecondAction();
        uint256 finalTotalDebt = manager.totalDebt();
        uint256 finalExecutorDebt = manager.debt(executor1);

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        vm.prank(address(manager));
        address implementationAddress = Proxy(proxyAddress).implementation();
        (bytes32 storageKey, bytes32 expectedStorageValue) = abi.decode(secondAction.data, (bytes32, bytes32));
        bytes32 storageValue = vm.load(proxyAddress, storageKey);
        uint256 executionGasUsed = 67190;
        uint256 estExecutorPayment = baseFee * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertEq(bundle.actionsExecuted, 2);
        assertTrue(bundle.executions[actionIndexes[1]]);
        assertEq(implementationAddress, address(0));
        assertEq(storageValue, expectedStorageValue);
        assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
        assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
    }

    function test_executeChugSplashAction_success_setImplementationToZeroAddress() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.startPrank(address(manager));
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        vm.store(proxyAddress, EIP1967_IMPLEMENTATION_KEY, bytes32(uint256(1)));
        assertEq(Proxy(proxyAddress).implementation(), address(1));
        vm.stopPrank();

        helper_executeSecondAction();
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        bytes32 newImplementationBytes = vm.load(proxyAddress, EIP1967_IMPLEMENTATION_KEY);
        (bytes32 storageKey, bytes32 expectedStorageValue) = abi.decode(secondAction.data, (bytes32, bytes32));
        bytes32 storageValue = vm.load(proxyAddress, storageKey);
        uint256 finalTotalDebt = manager.totalDebt();
        uint256 finalExecutorDebt = manager.debt(executor1);
        uint256 executionGasUsed = 72301;
        uint256 estExecutorPayment = baseFee * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertEq(bundle.actionsExecuted, 2);
        assertTrue(bundle.executions[actionIndexes[1]]);
        assertEq(newImplementationBytes, bytes32(0));
        assertEq(storageValue, expectedStorageValue);
        assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
        assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
    }

    function test_completeChugSplashBundle_revert_noActiveBundle() external {
        vm.expectRevert("ChugSplashManager: no bundle has been approved for execution");
        helper_completeBundle(executor1);
    }

    function test_completeChugSplashBundle_revert_wrongExecutor() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        vm.expectRevert("ChugSplashManager: caller is not approved executor for active bundle ID");
        helper_completeBundle(executor2);
    }

    function test_completeChugSplashBundle_revert_invalidProof() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        setImplementationProofArray[0][0] = bytes32(0);
        vm.expectRevert("ChugSplashManager: invalid bundle action proof");
        helper_completeBundle(executor1);
    }

    function test_completeChugSplashBundle_revert_incompleteBundle() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        vm.expectRevert("ChugSplashManager: bundle was not completed");
        helper_completeBundle(executor1);
    }

    function test_completeChugSplashBundle_success() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeMultipleActions();
        ChugSplashBundleState memory prevBundle = manager.bundles(bundleId);
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);
        uint256 actionIndex = setImplementationActionIndexArray[0];
        uint256 numActions = actionIndex + 1;

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashActionExecuted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, executor1, actionIndex);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCompleted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCompleted(bundleId, executor1, numActions);
        helper_completeBundle(executor1);

        uint256 finalTotalDebt = manager.totalDebt();
        uint256 finalExecutorDebt = manager.debt(executor1);
        bytes32 salt = keccak256(abi.encode(bundleId, bytes(firstAction.target)));
        address expectedImplementation = manager.implementations(salt);
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        uint256 gasUsed = 45472;
        uint256 estExecutorPayment = baseFee * gasUsed * (100 + executorPaymentPercentage) / 100;
        vm.prank(address(manager));
        address implementation = Proxy(proxyAddress).implementation();

        assertEq(bundle.actionsExecuted, prevBundle.actionsExecuted + 1);
        assertTrue(bundle.executions[actions.length]);
        assertEq(implementation, expectedImplementation);
        assertEq(uint8(bundle.status), uint8(ChugSplashBundleStatus.COMPLETED));
        assertEq(manager.activeBundleId(), bytes32(0));
        assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
        assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
        assertEq(finalTotalDebt, finalExecutorDebt);
    }

    // cancelActiveChugSplashBundle:
    // - reverts if not called by owner
    function test_cancelActiveChugSplashBundle_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.cancelActiveChugSplashBundle();
    }

    // cancelActiveChugSplashBundle:
    // - reverts if no bundle is active
    function test_cancelActiveChugSplashBundle_revert_noActiveBundle() external {
        vm.prank(owner);
        vm.expectRevert('ChugSplashManager: no bundle is currently active');
        manager.cancelActiveChugSplashBundle();
    }

    function test_cancelActiveChugSplashBundle_success_withinExecutionLockTime() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 timeClaimed = manager.bundles(bundleId).timeClaimed;
        uint256 actionsExecuted = manager.bundles(bundleId).actionsExecuted;
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.warp(executionLockTime + timeClaimed);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCancelled")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCancelled(bundleId, owner, actionsExecuted);
        vm.prank(owner);
        manager.cancelActiveChugSplashBundle();

        assertEq(manager.debt(executor1), initialExecutorDebt + ownerBondAmount + executorBondAmount);
        assertEq(manager.totalDebt(), initialTotalDebt + ownerBondAmount);
        assertEq(manager.activeBundleId(), bytes32(0));
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
    }

    // cancelActiveChugSplashBundle:
    // - if bundle is NOT cancelled within the `executionLockTime` window and there is an executor:
    //   - decreases the `totalDebt` by `executorBondAmount`
    // - removes active bundle id
    // - sets bundle status to `CANCELLED`
    // - emits ChugSplashBundleCancelled
    // - calls registry.announce with ChugSplashBundleCancelled
    function test_cancelActiveChugSplashBundle_success_afterExecutionLockTime() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 timeClaimed = manager.bundles(bundleId).timeClaimed;
        uint256 actionsExecuted = manager.bundles(bundleId).actionsExecuted;
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.warp(executionLockTime + timeClaimed + 1);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCancelled")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCancelled(bundleId, owner, actionsExecuted);
        vm.prank(owner);
        manager.cancelActiveChugSplashBundle();

        assertEq(manager.debt(executor1), initialExecutorDebt);
        assertEq(manager.totalDebt(), initialTotalDebt - executorBondAmount);
        assertEq(manager.activeBundleId(), bytes32(0));
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
    }

    // cancelActiveChugSplashBundle:
    // - if an executor has not claimed the bundle:
    //   - no debt is incremented
    // - removes active bundle id
    // - sets bundle status to `CANCELLED`
    // - emits ChugSplashBundleCancelled
    // - calls registry.announce with ChugSplashBundleCancelled
    function test_cancelActiveChugSplashBundle_success_noExecutor() external {
        helper_proposeThenApproveThenFundBundle();
        uint256 initialTotalDebt = manager.totalDebt();

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCancelled")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCancelled(bundleId, owner, 0);
        vm.startPrank(owner);
        manager.cancelActiveChugSplashBundle();
        manager.withdrawOwnerETH();

        assertEq(manager.totalDebt(), initialTotalDebt);
        assertEq(manager.debt(address(0)), 0);
        assertEq(manager.activeBundleId(), bytes32(0));
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
    }

    // claimBundle:
    // - reverts if there is no active bundle
    function test_claimBundle_revert_noActiveBundle() external {
        vm.expectRevert('ChugSplashManager: no bundle is currently active');
        manager.claimBundle();
    }

    // claimBundle:
    // - reverts if callvalue is less than the `executorBondAmount`
    function test_claimBundle_revert_insufficientBond() external {
        helper_proposeThenApproveBundle();
        vm.expectRevert('ChugSplashManager: incorrect executor bond amount');
        manager.claimBundle{ value: executorBondAmount - 1}();
    }

    // claimBundle:
    // - reverts if bundle is currently claimed by another executor
    function test_claimBundle_revert_alreadyClaimed() external {
        helper_proposeThenApproveBundle();
        helper_claimBundle(executor1);

        vm.warp(initialTimestamp + executionLockTime);
        vm.expectRevert("ChugSplashManager: bundle is currently claimed by an executor");
        helper_claimBundle(executor2);
    }

    // claimBundle:
    // - see helper_claimBundle
    // - if there was no previous executor:
    //   - increases `totalDebt` by `executorBondAmount`
    function test_claimBundle_success_noPreviousExecutor() external {
        helper_proposeThenApproveBundle();

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleClaimed")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleClaimed(bundleId, executor1);
        helper_claimBundle(executor1);

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);

        assertEq(bundle.timeClaimed, block.timestamp);
        assertEq(bundle.selectedExecutor, executor1);
        assertEq(manager.totalDebt(), executorBondAmount);
    }

    // claimBundle:
    // - see helper_claimBundle
    // - if there was a previous executor:
    //   - `totalDebt` remains the same
    function test_claimBundle_success_withPreviousExecutor() external {
        helper_proposeThenApproveBundle();
        helper_claimBundle(executor1);
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 secondClaimedBundleTimestamp = initialTimestamp + executionLockTime + 1;
        vm.warp(secondClaimedBundleTimestamp);

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleClaimed")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleClaimed(bundleId, executor2);
        helper_claimBundle(executor2);

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);

        assertEq(bundle.timeClaimed, secondClaimedBundleTimestamp);
        assertEq(bundle.selectedExecutor, executor2);
        assertEq(manager.totalDebt(), initialTotalDebt);
    }

    // claimExecutorPayment:
    // - decreases `debt` and `totalDebt` by the withdrawn amount
    // - emits ExecutorPaymentClaimed
    // - calls registry.announce with ExecutorPaymentClaimed
    function test_claimExecutorPayment_success() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 executorDebt = manager.debt(executor1);
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorBalance = address(executor1).balance;

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ExecutorPaymentClaimed")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ExecutorPaymentClaimed(executor1, executorDebt);
        vm.prank(executor1);
        manager.claimExecutorPayment();

        assertEq(address(executor1).balance, executorDebt + initialExecutorBalance);
        assertEq(manager.debt(executor1), 0);
        assertEq(manager.totalDebt(), initialTotalDebt - executorDebt);
    }

    // transferProxyOwnership:
    // - reverts if not called by owner
    function test_transferProxyOwnership_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.transferProxyOwnership(firstAction.target, owner);
    }

    // transferProxyOwnership:
    // - reverts if there is a currently active bundle
    function test_transferProxyOwnership_revert_activeBundle() external {
        helper_proposeThenApproveBundle();

        vm.prank(owner);
        vm.expectRevert("ChugSplashManager: bundle is currently active");
        manager.transferProxyOwnership(firstAction.target, owner);
    }

    // transferProxyOwnership:
    // - calls the adapter to change ownership
    // - emits ProxyOwnershipTransferred
    // - calls registry.announce with ProxyOwnershipTransferred
    function test_transferProxyOwnership_success() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeMultipleActions();
        helper_completeBundle(executor1);
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        vm.prank(address(manager));
        assertEq(Proxy(proxyAddress).admin(), address(manager));

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ProxyOwnershipTransferred")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ProxyOwnershipTransferred(firstAction.target, proxyAddress, bytes32(0), executor1, firstAction.target);
        vm.prank(owner);
        manager.transferProxyOwnership(firstAction.target, executor1);

        vm.prank(executor1);
        assertEq(Proxy(proxyAddress).admin(), executor1);
    }

    function test_addProposer_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.addProposer(proposer);
    }

    function test_addProposer_revert_alreadyAdded() external {
        vm.startPrank(owner);
        manager.addProposer(proposer);
        vm.expectRevert('ChugSplashManager: proposer was already added');
        manager.addProposer(proposer);
    }

    function test_addProposer_success() external {
        assertFalse(manager.proposers(proposer));

        vm.expectEmit(true, true, true, true);
        emit ProposerAdded(proposer, owner);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ProposerAdded")
            )
        );
        vm.prank(owner);
        manager.addProposer(proposer);

        assertTrue(manager.proposers(proposer));
    }

    function test_removeProposer_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.removeProposer(proposer);
    }

    function test_removeProposer_revert_alreadyRemoved() external {
        vm.prank(owner);
        vm.expectRevert('ChugSplashManager: proposer was already removed');
        manager.removeProposer(proposer);
    }

    function test_removeProposer_success() external {
        vm.startPrank(owner);
        manager.addProposer(proposer);

        assertTrue(manager.proposers(proposer));

        vm.expectEmit(true, true, true, true);
        emit ProposerRemoved(proposer, owner);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ProposerRemoved")
            )
        );
        manager.removeProposer(proposer);

        assertFalse(manager.proposers(proposer));
    }

    // withdrawOwnerETH:
    // - reverts if not called by owner
    function test_withdrawOwnerETH_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.withdrawOwnerETH();
    }

    // withdrawOwnerETH:
    // - reverts if there is an active bundle
    function test_withdrawOwnerETH_revert_noActiveBundle() external {
        helper_proposeThenApproveBundle();

        vm.prank(owner);
        vm.expectRevert("ChugSplashManager: cannot withdraw funds while bundle is active");
        manager.withdrawOwnerETH();
    }

    function test_withdrawOwnerETH_success() external {
        uint256 managerBalance = 1 ether;
        uint256 totalDebt = 1 gwei;
        uint256 amountWithdrawn = managerBalance - totalDebt;
        helper_fundChugSplashManager(managerBalance);
        stdstore
            .target(address(manager))
            .sig("totalDebt()")
            .checked_write(totalDebt);
        uint256 prevOwnerBalance = address(owner).balance;

        vm.expectEmit(true, true, true, true);
        emit OwnerWithdrewETH(owner, amountWithdrawn);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("OwnerWithdrewETH")
            )
        );
        vm.prank(owner);
        manager.withdrawOwnerETH();

        assertEq(address(owner).balance, prevOwnerBalance + amountWithdrawn);
    }

    function test_receive_success() external {
        uint256 amountDeposited = 1 ether;
        uint256 prevManagerBalance = address(manager).balance;

        hoax(owner);
        vm.expectEmit(true, true, true, true);
        emit ETHDeposited(owner, amountDeposited);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ETHDeposited")
            )
        );
        helper_fundChugSplashManager(amountDeposited);

        assertEq(address(manager).balance, prevManagerBalance + amountDeposited);
    }

    function helper_proposeThenApproveBundle() internal {
        startHoax(owner);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
        (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
        assertTrue(success);
        manager.approveChugSplashBundle(bundleId);
        vm.stopPrank();
    }

    function helper_executeMultipleActions() internal {
        startHoax(executor1);
        manager.executeMultipleActions(actions, actionIndexes, proofs);
        vm.stopPrank();
    }

    function helper_completeBundle(address _executor) internal {
        hoax(_executor);
        manager.completeChugSplashBundle(setImplementationActionArray, setImplementationActionIndexArray, setImplementationProofArray);
    }

    function helper_executeSecondAction() internal {
        hoax(executor1);
        manager.executeChugSplashAction(secondAction, actionIndexes[1], proofs[1]);
    }

    function helper_proposeThenApproveThenFundBundle() internal {
        helper_proposeThenApproveBundle();
        helper_fundChugSplashManager(bundleExecutionCost);
    }

    function helper_proposeThenApproveThenFundThenClaimBundle() internal {
        helper_proposeThenApproveThenFundBundle();
        helper_claimBundle(executor1);
    }

    function helper_fundChugSplashManager(uint256 _amount) internal {
        (bool success, ) = address(manager).call{ value: _amount }(new bytes(0));
        assertTrue(success);
    }

    function helper_executeFirstAction() internal {
        hoax(executor1);
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function helper_claimBundle(address _executor) internal {
        hoax(_executor);
        manager.claimBundle{ value: executorBondAmount }();
    }
}
