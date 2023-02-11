// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

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
import { DefaultAdapter } from "../contracts/adapters/DefaultAdapter.sol";
import { DefaultUpdater } from "../contracts/updaters/DefaultUpdater.sol";
import { OZUUPSAdapter } from "../contracts/adapters/OZUUPSAdapter.sol";
import { OZUUPSUpdater } from "../contracts/updaters/OZUUPSUpdater.sol";
import { OZTransparentAdapter } from "../contracts/adapters/OZTransparentAdapter.sol";
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
        string indexed referenceNameHash,
        address indexed proxy,
        bytes32 indexed proxyType,
        address newOwner,
        string referenceName
    );

    event ProxySetToReferenceName(
        string indexed referenceNameHash,
        address indexed proxy,
        bytes32 indexed proxyType,
        string referenceName
    );

    event ChugSplashActionExecuted(
        bytes32 indexed bundleId,
        address indexed proxy,
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

    event DefaultProxyDeployed(
        string indexed referenceNameHash,
        address indexed proxy,
        bytes32 indexed bundleId,
        string referenceName
    );

    event ImplementationDeployed(
        string indexed referenceNameHash,
        address indexed implementation,
        bytes32 indexed bundleId,
        string referenceName
    );

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
    address executor = address(512);
    bytes32 salt = bytes32(hex"11");
    uint256 initialTimestamp = 1641070800;
    uint256 bundleExecutionCost = 2 ether;
    string projectName = 'TestProject';
    string referenceName = 'SecondSimpleStorage';
    uint256 ownerBondAmount = 10e8 gwei; // 0.1 ETH
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
    DefaultAdapter defaultAdapter;
    DefaultUpdater defaultUpdater;
    OZUUPSAdapter ozUUPSAdapter;
    OZUUPSUpdater ozUUPSUpdater;
    OZTransparentAdapter ozTransparentAdapter;
    ChugSplashManager managerImplementation;

    function setUp() external {
        // The `tx.gasprice` is zero by default in Foundry. We assert that the gas price is greater
        // than zero here since some tests rely on a non-zero gas price. You can set the gas price
        // by calling: forge test --gas-price <positive-integer>
        assertGt(tx.gasprice, 0);

        firstAction = ChugSplashAction({
            referenceName: referenceName,
            actionType: ChugSplashActionType.DEPLOY_IMPLEMENTATION,
            data: hex"60e060405234801561001057600080fd5b506040516105cb3803806105cb8339818101604052810190610032919061015c565b8260ff1660808160ff168152505081151560a0811515815250508073ffffffffffffffffffffffffffffffffffffffff1660c08173ffffffffffffffffffffffffffffffffffffffff16815250505050506101af565b600080fd5b600060ff82169050919050565b6100a38161008d565b81146100ae57600080fd5b50565b6000815190506100c08161009a565b92915050565b60008115159050919050565b6100db816100c6565b81146100e657600080fd5b50565b6000815190506100f8816100d2565b92915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000610129826100fe565b9050919050565b6101398161011e565b811461014457600080fd5b50565b60008151905061015681610130565b92915050565b60008060006060848603121561017557610174610088565b5b6000610183868287016100b1565b9350506020610194868287016100e9565b92505060406101a586828701610147565b9150509250925092565b60805160a05160c0516103ed6101de600039600061015f01526000610187015260006101af01526103ed6000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c80631ca6cbeb146100515780632277fe821461006f578063ee460c641461008d578063f2c9ecd8146100ab575b600080fd5b6100596100c9565b604051610066919061026c565b60405180910390f35b61007761015b565b60405161008491906102cf565b60405180910390f35b610095610183565b6040516100a29190610305565b60405180910390f35b6100b36101ab565b6040516100c0919061033c565b60405180910390f35b6060600080546100d890610386565b80601f016020809104026020016040519081016040528092919081815260200182805461010490610386565b80156101515780601f1061012657610100808354040283529160200191610151565b820191906000526020600020905b81548152906001019060200180831161013457829003601f168201915b5050505050905090565b60007f0000000000000000000000000000000000000000000000000000000000000000905090565b60007f0000000000000000000000000000000000000000000000000000000000000000905090565b60007f0000000000000000000000000000000000000000000000000000000000000000905090565b600081519050919050565b600082825260208201905092915050565b60005b8381101561020d5780820151818401526020810190506101f2565b8381111561021c576000848401525b50505050565b6000601f19601f8301169050919050565b600061023e826101d3565b61024881856101de565b93506102588185602086016101ef565b61026181610222565b840191505092915050565b600060208201905081810360008301526102868184610233565b905092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006102b98261028e565b9050919050565b6102c9816102ae565b82525050565b60006020820190506102e460008301846102c0565b92915050565b60008115159050919050565b6102ff816102ea565b82525050565b600060208201905061031a60008301846102f6565b92915050565b600060ff82169050919050565b61033681610320565b82525050565b6000602082019050610351600083018461032d565b92915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b6000600282049050600182168061039e57607f821691505b6020821081036103b1576103b0610357565b5b5091905056fea26469706673582212201bf5707496ec5c58e6da2f78bf4f13bb8a3e0d2dede540dedb15a521ee12ad3b64736f6c634300080f0033000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000001111111111111111111111111111111111111111"
        });
        secondAction = ChugSplashAction({
            referenceName: referenceName,
            actionType: ChugSplashActionType.SET_STORAGE,
            data: hex"00000000000000000000000000000000000000000000000000000000000000005365636f6e64000000000000000000000000000000000000000000000000000c"
        });

        actions.push(firstAction);
        actions.push(secondAction);

        setImplementationActionArray.push(
            ChugSplashAction({
                referenceName: referenceName,
                actionType: ChugSplashActionType.SET_IMPLEMENTATION,
                data: new bytes(0)
            })
        );
        setImplementationActionIndexArray = [actionIndexes[2]];
        setImplementationProofArray = [proofs[2]];

        vm.warp(initialTimestamp);

        bootloader = new ChugSplashBootLoader{salt: salt }();

        address registryProxyAddress = Create2.compute(
            address(this),
            salt,
            abi.encodePacked(type(Proxy).creationCode, abi.encode(address(owner)))
        );

        managerImplementation = new ChugSplashManager{ salt: salt }(
            ChugSplashRegistry(registryProxyAddress),
            projectName,
            owner,
            executionLockTime,
            ownerBondAmount,
            executorPaymentPercentage
        );

        bootloader.initialize(
            owner,
            executionLockTime,
            ownerBondAmount,
            executorPaymentPercentage,
            address(managerImplementation),
            registryProxyAddress,
            salt
        );

        Proxy registryProxy = new Proxy{ salt: salt}(owner);

        vm.startPrank(owner);
        registryProxy.upgradeTo(address(bootloader.registryImplementation()));
        vm.stopPrank();

        // Convert the registry proxy to a ChugSplashRegistry type
        registry = ChugSplashRegistry(address(registryProxy));

        registry.register(projectName, owner);

        vm.startPrank(owner);
        address[] memory executors = new address[](1);
        executors[0] = executor;
        registry.initialize(owner, executors);
        vm.stopPrank();

        manager = registry.projects(projectName);
        defaultAdapter = new DefaultAdapter();
        defaultUpdater = new DefaultUpdater();
        ozUUPSAdapter = new OZUUPSAdapter();
        ozUUPSUpdater = new OZUUPSUpdater();
        ozTransparentAdapter = new OZTransparentAdapter();

        registry.addProxyType(bytes32(0), address(defaultAdapter), address(defaultUpdater));
    }

    // constructor:
    // - initializes variables correctly
    function test_constructor_success() external {
        assertEq(address(manager.registry()), address(registry));
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
    // - reverts if the manager's balance minus the debt is less than the owner bond amount
    function test_approveChugSplashBundle_revert_balance() external {
        assertEq(address(manager).balance, 0);
        uint256 debt = 1 gwei;
        uint256 insufficientAmount = ownerBondAmount + debt - 1;

        stdstore
            .target(address(manager))
            .sig("debt()")
            .checked_write(debt);

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
        vm.prank(executor);
        manager.executeChugSplashAction(
            firstAction, actionIndexes[0], proofs[0]
        );
    }

    function test_executeChugSplashAction_revert_alreadyExecuted() external {
        helper_proposeThenApproveThenFundBundle();
        helper_executeFirstAction();

        vm.expectRevert("ChugSplashManager: action has already been executed");
        vm.prank(executor);
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_revert_onlyExecutor() external {
        vm.prank(owner);
        vm.expectRevert("ChugSplashManager: caller is not an executor");
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_revert_invalidProof() external {
        helper_proposeThenApproveThenFundBundle();

        uint256 incorrectActionIndex = actionIndexes[0] + 1;
        hoax(executor);
        vm.expectRevert("ChugSplashManager: invalid bundle action proof");
        manager.executeChugSplashAction(firstAction, incorrectActionIndex, proofs[0]);
    }

    function test_executeChugSplashAction_revert_noAdapter() external {
        helper_proposeThenApproveThenFundBundle();

        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(registry.adapters.selector, bytes32(0)),
            abi.encode(address(0))
        );
        hoax(executor);
        vm.expectRevert("ChugSplashManager: proxy type has no adapter");
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_success_deployProxyAndImplementation() external {
        helper_proposeThenApproveThenFundBundle();
        address payable proxyAddress = manager.getDefaultProxyAddress(firstAction.referenceName);
        assertEq(proxyAddress.code.length, 0);
        address implementationAddress = Create2.compute(
            address(manager),
            keccak256(abi.encode(bundleId, bytes(firstAction.referenceName))),
            firstAction.data
        );
        assertEq(implementationAddress.code.length, 0);
        uint256 initialDebt = manager.debt();

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announceWithData,
                ("DefaultProxyDeployed", abi.encodePacked(proxyAddress))
            )
        );
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ImplementationDeployed")
            )
        );
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announceWithData,
                ("ChugSplashActionExecuted", abi.encodePacked(proxyAddress))
            )
        );
        vm.expectEmit(true, true, true, true);
        emit DefaultProxyDeployed(firstAction.referenceName, proxyAddress, bundleId, firstAction.referenceName);
        vm.expectEmit(true, true, true, true);
        emit ImplementationDeployed(firstAction.referenceName, implementationAddress, bundleId, firstAction.referenceName);
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, proxyAddress, executor, actionIndexes[0]);

        helper_executeFirstAction();
        uint256 finalDebt = manager.debt();

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        uint256 executionGasUsed = 760437;
        uint256 estExecutorPayment = tx.gasprice * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertGt(proxyAddress.code.length, 0);
        assertGt(implementationAddress.code.length, 0);
        assertEq(bundle.actionsExecuted, 1);
        assertTrue(bundle.executions[actionIndexes[0]]);
        bytes32 implementationSalt = keccak256(abi.encode(bundleId, bytes(firstAction.referenceName)));
        assertEq(manager.implementations(implementationSalt), implementationAddress);
        assertGt(finalDebt, estExecutorPayment + initialDebt);
    }

    function test_executeChugSplashAction_success_setStorage() external {
        helper_proposeThenApproveThenFundBundle();
        helper_executeFirstAction();
        uint256 initialDebt = manager.debt();
        address payable proxyAddress = manager.getDefaultProxyAddress(firstAction.referenceName);

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announceWithData,
                ("ChugSplashActionExecuted", abi.encodePacked(proxyAddress))
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, proxyAddress, executor, actionIndexes[1]);
        helper_executeSecondAction();
        uint256 finalDebt = manager.debt();

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        vm.prank(address(manager));
        address implementationAddress = Proxy(proxyAddress).implementation();
        (bytes32 storageKey, bytes32 expectedStorageValue) = abi.decode(secondAction.data, (bytes32, bytes32));
        bytes32 storageValue = vm.load(proxyAddress, storageKey);
        uint256 executionGasUsed = 67190;
        uint256 estExecutorPayment = tx.gasprice * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertEq(bundle.actionsExecuted, 2);
        assertTrue(bundle.executions[actionIndexes[1]]);
        assertEq(implementationAddress, address(defaultUpdater));
        assertEq(storageValue, expectedStorageValue);
        assertGt(finalDebt, estExecutorPayment + initialDebt);
    }

    function test_executeChugSplashAction_success_setImplementationToDefaultUpdater() external {
        helper_proposeThenApproveThenFundBundle();
        helper_executeFirstAction();
        uint256 initialDebt = manager.debt();

        vm.startPrank(address(manager));
        address payable proxyAddress = manager.getDefaultProxyAddress(firstAction.referenceName);
        vm.store(proxyAddress, EIP1967_IMPLEMENTATION_KEY, bytes32(uint256(1)));
        assertEq(Proxy(proxyAddress).implementation(), address(1));
        vm.stopPrank();

        helper_executeSecondAction();
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        bytes32 newImplementationBytes = vm.load(proxyAddress, EIP1967_IMPLEMENTATION_KEY);
        (bytes32 storageKey, bytes32 expectedStorageValue) = abi.decode(secondAction.data, (bytes32, bytes32));
        bytes32 storageValue = vm.load(proxyAddress, storageKey);
        uint256 finalDebt = manager.debt();
        uint256 executionGasUsed = 72301;
        uint256 estExecutorPayment = tx.gasprice * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertEq(bundle.actionsExecuted, 2);
        assertTrue(bundle.executions[actionIndexes[1]]);
        assertEq(newImplementationBytes, bytes32(uint256(uint160(address(defaultUpdater)))));
        assertEq(storageValue, expectedStorageValue);
        assertGt(finalDebt, estExecutorPayment + initialDebt);
    }

    function test_completeChugSplashBundle_revert_noActiveBundle() external {
        vm.expectRevert("ChugSplashManager: no bundle has been approved for execution");
        helper_completeBundle(executor);
    }

    function test_completeChugSplashBundle_revert_onlyExecutor() external {
        vm.expectRevert("ChugSplashManager: caller is not an executor");
        helper_completeBundle(owner);
    }

    function test_completeChugSplashBundle_revert_invalidProof() external {
        helper_proposeThenApproveThenFundBundle();
        setImplementationProofArray[0][0] = bytes32(0);
        vm.expectRevert("ChugSplashManager: invalid bundle action proof");
        helper_completeBundle(executor);
    }

    function test_completeChugSplashBundle_revert_incompleteBundle() external {
        helper_proposeThenApproveThenFundBundle();
        helper_executeFirstAction();
        vm.expectRevert("ChugSplashManager: bundle was not completed");
        helper_completeBundle(executor);
    }

    function test_completeChugSplashBundle_success_defaultProxy() external {
        helper_proposeThenApproveThenFundBundle();
        helper_executeMultipleActions();
        ChugSplashBundleState memory prevBundle = manager.bundles(bundleId);
        address payable proxyAddress = manager.getDefaultProxyAddress(firstAction.referenceName);
        uint256 initialDebt = manager.debt();
        uint256 actionIndex = setImplementationActionIndexArray[0];
        uint256 numActions = actionIndex + 1;

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announceWithData,
                ("ChugSplashActionExecuted", abi.encodePacked(proxyAddress))
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, proxyAddress, executor, actionIndex);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCompleted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCompleted(bundleId, executor, numActions);
        helper_completeBundle(executor);

        uint256 finalDebt = manager.debt();
        bytes32 implementationSalt = keccak256(abi.encode(bundleId, bytes(firstAction.referenceName)));
        address expectedImplementation = manager.implementations(implementationSalt);
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        uint256 gasUsed = 45472;
        uint256 estExecutorPayment = tx.gasprice * gasUsed * (100 + executorPaymentPercentage) / 100;
        vm.prank(address(manager));
        address implementation = Proxy(proxyAddress).implementation();

        assertEq(bundle.actionsExecuted, prevBundle.actionsExecuted + 1);
        assertTrue(bundle.executions[actions.length]);
        assertEq(implementation, expectedImplementation);
        assertEq(uint8(bundle.status), uint8(ChugSplashBundleStatus.COMPLETED));
        assertEq(manager.activeBundleId(), bytes32(0));
        assertGt(finalDebt, estExecutorPayment + initialDebt);
    }

    function test_completeChugSplashBundle_success_transparentProxy() external {
        TransparentUpgradeableProxy transparentProxy = new TransparentUpgradeableProxy(
            address(managerImplementation), // Dummy value so that the OpenZeppelin proxy doesn't revert
            address(manager),
            ''
        );
        address payable transparentProxyAddress = payable(address(transparentProxy));
        bytes32 proxyType = keccak256(bytes("oz-transparent"));
        registry.addProxyType(proxyType, address(ozTransparentAdapter), address(defaultUpdater));
        helper_setProxyToReferenceName(referenceName, transparentProxyAddress, proxyType);
        helper_proposeThenApproveThenFundBundle();
        helper_executeMultipleActions();
        ChugSplashBundleState memory prevBundle = manager.bundles(bundleId);
        uint256 initialDebt = manager.debt();
        uint256 actionIndex = setImplementationActionIndexArray[0];
        uint256 numActions = actionIndex + 1;

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announceWithData,
                ("ChugSplashActionExecuted", abi.encodePacked(transparentProxyAddress))
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, transparentProxyAddress, executor, actionIndex);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCompleted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCompleted(bundleId, executor, numActions);
        helper_completeBundle(executor);

        uint256 finalDebt = manager.debt();
        bytes32 implementationSalt = keccak256(abi.encode(bundleId, bytes(firstAction.referenceName)));
        address expectedImplementation = manager.implementations(implementationSalt);
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        uint256 gasUsed = 45472;
        uint256 estExecutorPayment = tx.gasprice * gasUsed * (100 + executorPaymentPercentage) / 100;
        vm.prank(address(manager));
        address implementation = transparentProxy.implementation();

        assertEq(bundle.actionsExecuted, prevBundle.actionsExecuted + 1);
        assertTrue(bundle.executions[actions.length]);
        assertEq(implementation, expectedImplementation);
        assertEq(uint8(bundle.status), uint8(ChugSplashBundleStatus.COMPLETED));
        assertEq(manager.activeBundleId(), bytes32(0));
        assertGt(finalDebt, estExecutorPayment + initialDebt);
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
        helper_proposeThenApproveThenFundBundle();
        helper_executeFirstAction();
        uint256 timeClaimed = manager.bundles(bundleId).timeClaimed;
        uint256 actionsExecuted = manager.bundles(bundleId).actionsExecuted;
        uint256 initialDebt = manager.debt();

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

        assertEq(manager.debt(), initialDebt + ownerBondAmount);
        assertEq(manager.activeBundleId(), bytes32(0));
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
    }

    // cancelActiveChugSplashBundle:
    // - if bundle is NOT cancelled within the `executionLockTime` window and there is an executor:
    //   - does not decrease `debt`
    // - removes active bundle id
    // - sets bundle status to `CANCELLED`
    // - emits ChugSplashBundleCancelled
    // - calls registry.announce with ChugSplashBundleCancelled
    function test_cancelActiveChugSplashBundle_success_afterExecutionLockTime() external {
        helper_proposeThenApproveThenFundBundle();
        helper_executeFirstAction();
        uint256 timeClaimed = manager.bundles(bundleId).timeClaimed;
        uint256 actionsExecuted = manager.bundles(bundleId).actionsExecuted;
        uint256 initialDebt = manager.debt();

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

        assertEq(manager.debt(), initialDebt);
        assertEq(manager.activeBundleId(), bytes32(0));
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
    }

    function test_claimExecutorPayment_revert_onlyExecutor() external {
        vm.expectRevert("ChugSplashManager: caller is not an executor");
        vm.prank(owner);
        manager.claimExecutorPayment();
    }

    function test_claimExecutorPayment_revert_noDebt() external {
        vm.expectRevert("ChugSplashManager: no debt to withdraw");
        vm.prank(executor);
        manager.claimExecutorPayment();
    }

    // claimExecutorPayment:
    // - sets debt to 0
    // - increases executor's balance by `debt`
    // - decreases ChugSplashManager balance by `debt`
    // - emits ExecutorPaymentClaimed
    // - calls registry.announce with ExecutorPaymentClaimed
    function test_claimExecutorPayment_success() external {
        helper_proposeThenApproveThenFundBundle();
        helper_executeFirstAction();
        uint256 debt = manager.debt();
        uint256 initialExecutorBalance = address(executor).balance;
        uint256 initialManagerBalance = address(manager).balance;

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ExecutorPaymentClaimed")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ExecutorPaymentClaimed(executor, debt);
        vm.prank(executor);
        manager.claimExecutorPayment();

        assertEq(manager.debt(), 0);
        assertEq(address(manager).balance, initialManagerBalance - debt);
        assertEq(address(executor).balance, debt + initialExecutorBalance);
    }

    // transferProxyOwnership:
    // - reverts if not called by owner
    function test_transferProxyOwnership_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.transferProxyOwnership(firstAction.referenceName, owner);
    }

    // transferProxyOwnership:
    // - reverts if there is a currently active bundle
    function test_transferProxyOwnership_revert_activeBundle() external {
        helper_proposeThenApproveBundle();

        vm.prank(owner);
        vm.expectRevert("ChugSplashManager: bundle is currently active");
        manager.transferProxyOwnership(firstAction.referenceName, owner);
    }

    // transferProxyOwnership:
    // - calls the adapter to change ownership
    // - emits ProxyOwnershipTransferred
    // - calls registry.announce with ProxyOwnershipTransferred
    function test_transferProxyOwnership_success_defaultProxy() external {
        helper_proposeThenApproveThenFundBundle();
        helper_executeMultipleActions();
        helper_completeBundle(executor);
        address payable proxyAddress = manager.getDefaultProxyAddress(firstAction.referenceName);
        helper_transferProxyOwnership(proxyAddress, nonOwner, firstAction.referenceName, bytes32(0));
    }

    function test_transferProxyOwnership_success_transparentProxy() external {
        TransparentUpgradeableProxy transparentProxy = new TransparentUpgradeableProxy(
            address(registry), // Dummy value so that the OpenZeppelin proxy doesn't revert
            address(manager),
            ''
        );
        address payable transparentProxyAddress = payable(address(transparentProxy));
        string memory transparentProxyReferenceName = "TransparentProxy";
        bytes32 proxyType = keccak256(bytes("oz-transparent"));
        registry.addProxyType(proxyType, address(ozTransparentAdapter), address(defaultUpdater));
        helper_setProxyToReferenceName(transparentProxyReferenceName, transparentProxyAddress, proxyType);

        helper_transferProxyOwnership(transparentProxyAddress, nonOwner, transparentProxyReferenceName, proxyType);

        assertEq(manager.proxies(transparentProxyReferenceName), payable(address(0)));
        assertEq(manager.proxyTypes(transparentProxyReferenceName), bytes32(0));
    }

    function test_setProxyToReferenceName_revert_nonOwner() external {
        address payable proxyAddress = manager.getDefaultProxyAddress(referenceName);
        vm.expectRevert('Ownable: caller is not the owner');
        vm.prank(nonOwner);
        manager.setProxyToReferenceName(referenceName, proxyAddress, bytes32(0));
    }

    function test_setProxyToReferenceName_revert_noActiveBundle() external {
        helper_proposeThenApproveBundle();
        address payable proxyAddress = manager.getDefaultProxyAddress(referenceName);

        vm.prank(owner);
        vm.expectRevert("ChugSplashManager: cannot change proxy while bundle is active");
        manager.setProxyToReferenceName(referenceName, proxyAddress, bytes32(0));
    }

    function test_setProxyToReferenceName_revert_zeroAddressProxy() external {
        vm.prank(owner);
        vm.expectRevert("ChugSplashManager: proxy cannot be address(0)");
        manager.setProxyToReferenceName(referenceName, payable(address(0)), bytes32(uint256(64)));
    }

    function test_setProxyToReferenceName_success() external {
        address payable proxyAddress = manager.getDefaultProxyAddress(referenceName);
        bytes32 proxyType = keccak256(bytes("oz-transparent"));
        helper_setProxyToReferenceName(referenceName, proxyAddress, proxyType);
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
        uint256 debt = 1 gwei;
        uint256 amountWithdrawn = managerBalance - debt;
        helper_fundChugSplashManager(managerBalance);
        stdstore
            .target(address(manager))
            .sig("debt()")
            .checked_write(debt);
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
        startHoax(executor);
        manager.executeMultipleActions(actions, actionIndexes, proofs);
        vm.stopPrank();
    }

    function helper_completeBundle(address _executor) internal {
        hoax(_executor);
        manager.completeChugSplashBundle(setImplementationActionArray, setImplementationActionIndexArray, setImplementationProofArray);
    }

    function helper_executeSecondAction() internal {
        hoax(executor);
        manager.executeChugSplashAction(secondAction, actionIndexes[1], proofs[1]);
    }

    function helper_proposeThenApproveThenFundBundle() internal {
        helper_proposeThenApproveBundle();
        helper_fundChugSplashManager(bundleExecutionCost);
    }

    function helper_fundChugSplashManager(uint256 _amount) internal {
        (bool success, ) = address(manager).call{ value: _amount }(new bytes(0));
        assertTrue(success);
    }

    function helper_executeFirstAction() internal {
        hoax(executor);
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function helper_transferProxyOwnership(address payable _proxy, address _newOwner, string memory _referenceName, bytes32 _proxyType) public {
        vm.prank(address(manager));
        assertEq(Proxy(_proxy).admin(), address(manager));

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ProxyOwnershipTransferred")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ProxyOwnershipTransferred(_referenceName, _proxy, _proxyType, _newOwner, _referenceName);
        vm.prank(owner);
        manager.transferProxyOwnership(_referenceName, _newOwner);

        vm.prank(_newOwner);
        assertEq(Proxy(_proxy).admin(), _newOwner);
    }

    function helper_setProxyToReferenceName(string memory _referenceName, address payable _proxyAddress, bytes32 _proxyType) public {
        assertEq(manager.proxies(_referenceName), payable(address(0)));
        assertEq(manager.proxyTypes(_referenceName), bytes32(0));

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announceWithData,
                ("ProxySetToReferenceName", abi.encodePacked(_proxyAddress))
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ProxySetToReferenceName(_referenceName, _proxyAddress, _proxyType, _referenceName);

        vm.prank(owner);
        manager.setProxyToReferenceName(_referenceName, _proxyAddress, _proxyType);

        assertEq(manager.proxies(_referenceName), _proxyAddress);
        assertEq(manager.proxyTypes(_referenceName), _proxyType);
    }
}
