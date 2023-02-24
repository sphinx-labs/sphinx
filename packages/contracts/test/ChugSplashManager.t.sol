// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.9;

// import {
//     TransparentUpgradeableProxy
// } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
// import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// import {
//     ChugSplashAction,
//     ChugSplashActionType,
//     ChugSplashBundleState,
//     ChugSplashBundleStatus,
//     ChugSplashActionWithProof,
//     ChugSplashBundle
// } from "../contracts/ChugSplashDataTypes.sol";
// import { Test, stdStorage, StdStorage } from "forge-std/Test.sol";
// import { Proxy } from "../contracts/libraries/Proxy.sol";
// import { ChugSplashManager } from "../contracts/ChugSplashManager.sol";
// import { ChugSplashRegistry } from "../contracts/ChugSplashRegistry.sol";
// import { ChugSplashRecorder } from "../contracts/ChugSplashRecorder.sol";
// import { ChugSplashBootLoader } from "../contracts/ChugSplashBootLoader.sol";
// import { DefaultAdapter } from "../contracts/adapters/DefaultAdapter.sol";
// import { DefaultUpdater } from "../contracts/updaters/DefaultUpdater.sol";
// import { OZUUPSAdapter } from "../contracts/adapters/OZUUPSAdapter.sol";
// import { OZUUPSUpdater } from "../contracts/updaters/OZUUPSUpdater.sol";
// import { OZTransparentAdapter } from "../contracts/adapters/OZTransparentAdapter.sol";
// import { Create2 } from "../contracts/libraries/Create2.sol";

// contract ChugSplashManager_Test is Test {
//     using stdStorage for StdStorage;

//     event ChugSplashBundleProposed(
//         bytes32 indexed bundleId,
//         bytes32 bundleRoot,
//         uint256 bundleSize,
//         string configUri
//     );

//     event ChugSplashBundleApproved(bytes32 indexed bundleId);

//     event ChugSplashBundleCancelled(
//         bytes32 indexed bundleId,
//         address indexed owner,
//         uint256 actionsExecuted
//     );

//     event ProxyOwnershipTransferred(
//         string indexed referenceNameHash,
//         address indexed proxy,
//         bytes32 indexed proxyType,
//         address newOwner,
//         string referenceName
//     );

//     event ChugSplashBundleClaimed(bytes32 indexed bundleId, address indexed executor);

//     event ProxySetToReferenceName(
//         string indexed referenceNameHash,
//         address indexed proxy,
//         bytes32 indexed proxyType,
//         string referenceName
//     );

//     event ChugSplashActionExecuted(
//         bytes32 indexed bundleId,
//         address indexed proxy,
//         address indexed executor,
//         uint256 actionIndex
//     );

//     event ChugSplashBundleCompleted(
//         bytes32 indexed bundleId,
//         address indexed executor,
//         uint256 actionsExecuted
//     );

//     event ExecutorPaymentClaimed(address indexed executor, uint256 amount);

//     event OwnerWithdrewETH(address indexed owner, uint256 amount);

//     event ProposerAdded(address indexed proposer, address indexed owner);

//     event ProposerRemoved(address indexed proposer, address indexed owner);

//     event ETHDeposited(address indexed from, uint256 indexed amount);

//     event DefaultProxyDeployed(
//         string indexed referenceNameHash,
//         address indexed proxy,
//         bytes32 indexed bundleId,
//         string referenceName
//     );

//     event ImplementationDeployed(
//         string indexed referenceNameHash,
//         address indexed implementation,
//         bytes32 indexed bundleId,
//         string referenceName
//     );

//     bytes32 constant EIP1967_IMPLEMENTATION_KEY =
//         0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

//     address proposer = address(64);
//     address owner = address(128);
//     address nonOwner = address(256);
//     address executor1 = address(512);
//     address executor2 = address(1024);
//     bytes32 salt = bytes32(hex"11");
//     uint256 initialTimestamp = 1641070800;
//     uint256 bundleExecutionCost = 2 ether;
//     string projectName = "TestProject";
//     uint256 ownerBondAmount = 10e8 gwei; // 0.1 ETH
//     uint256 executionLockTime = 15 minutes;
//     uint256 executorPaymentPercentage = 20;
//     ChugSplashAction[] setImplActionArray;
//     uint256[] setImplActionIndexArray;
//     bytes32[][] setImplSiblingArray;

//     // Path from the project root to the JSON file that contains the bundle info.
//     string bundleInfoPath = "/test/bundle-info.json";

//     ChugSplashBootLoader bootloader;
//     ChugSplashManager manager;
//     ChugSplashRegistry registry;
//     ChugSplashRecorder recorder;
//     DefaultAdapter defaultAdapter;
//     DefaultUpdater defaultUpdater;
//     OZUUPSAdapter ozUUPSAdapter;
//     OZUUPSUpdater ozUUPSUpdater;
//     OZTransparentAdapter ozTransparentAdapter;
//     ChugSplashManager managerImplementation;

//     function setUp() external {
//         // The `tx.gasprice` is zero by default in Foundry. We assert that the gas price is greater
//         // than zero here since some tests rely on a non-zero gas price. You can set the gas price
//         // by calling: forge test --gas-price <positive-integer>
//         assertGt(tx.gasprice, 0);

//         vm.warp(initialTimestamp);

//         bootloader = new ChugSplashBootLoader{ salt: salt }();
//         recorder = bootloader.recorder();

//         address registryProxyAddress = Create2.compute(
//             address(this),
//             salt,
//             abi.encodePacked(type(Proxy).creationCode, abi.encode(address(owner)))
//         );

//         managerImplementation = new ChugSplashManager{ salt: salt }(
//             ChugSplashRegistry(registryProxyAddress),
//             recorder,
//             executionLockTime,
//             ownerBondAmount,
//             executorPaymentPercentage
//         );
//         managerImplementation.initialize(projectName, owner);

//         bootloader.initialize(
//             owner,
//             executionLockTime,
//             ownerBondAmount,
//             executorPaymentPercentage,
//             address(managerImplementation),
//             registryProxyAddress,
//             salt
//         );

//         Proxy registryProxy = new Proxy{ salt: salt }(owner);

//         vm.startPrank(owner);
//         registryProxy.upgradeTo(address(bootloader.registryImplementation()));
//         vm.stopPrank();

//         // Convert the registry proxy to a ChugSplashRegistry type
//         registry = ChugSplashRegistry(address(registryProxy));

//         registry.register(projectName, owner);

//         vm.startPrank(owner);
//         address[] memory executors = new address[](2);
//         executors[0] = executor1;
//         executors[1] = executor2;
//         registry.initialize(owner, address(bootloader.rootManagerProxy()), executors);
//         vm.stopPrank();

//         manager = registry.projects(projectName);
//         defaultUpdater = new DefaultUpdater();
//         defaultAdapter = new DefaultAdapter(address(defaultUpdater));
//         ozUUPSUpdater = new OZUUPSUpdater();
//         ozUUPSAdapter = new OZUUPSAdapter(address(ozUUPSUpdater));
//         ozTransparentAdapter = new OZTransparentAdapter(address(defaultUpdater));

//         recorder.addProxyType(bytes32(0), address(defaultAdapter));
//     }

//     // constructor:
//     // - initializes variables correctly
//     function test_constructor_success() external {
//         assertEq(address(manager.registry()), address(registry));
//         assertEq(manager.executionLockTime(), executionLockTime);
//         assertEq(manager.ownerBondAmount(), ownerBondAmount);
//         assertEq(manager.executorPaymentPercentage(), executorPaymentPercentage);
//         assertEq(manager.name(), projectName);
//         assertEq(manager.owner(), owner);
//     }

//     // initialize:
//     // - reverts if called twice
//     function test_initialize_revert_calledTwice() external {
//         vm.expectRevert("Initializable: contract is already initialized");
//         manager.initialize(projectName, address(owner));
//     }

//     // computeBundleId:
//     // - returns bundle id
//     function test_computeBundleId_success() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         string memory configUri = helper_readConfigUri(bundleInfoPath);
//         bytes32 expectedBundleId = keccak256(
//             abi.encode(bundle.root, bundle.actions.length, configUri)
//         );
//         assertEq(
//             manager.computeBundleId(bundle.root, bundle.actions.length, configUri),
//             expectedBundleId
//         );
//     }

//     function test_getSelectedExecutor_success() external {
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);
//         helper_proposeThenApproveThenFundThenClaimBundle();
//         assertEq(manager.getSelectedExecutor(bundleId), executor1);
//     }

//     // proposeChugSplashBundle:
//     // - reverts if bundle's status is not `EMPTY`
//     function test_proposeChugSplashBundle_revert_nonEmpty() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         string memory configUri = helper_readConfigUri(bundleInfoPath);

//         vm.startPrank(owner);
//         manager.proposeChugSplashBundle(bundle.root, bundle.actions.length, configUri);
//         vm.expectRevert("ChugSplashManager: bundle already exists");
//         manager.proposeChugSplashBundle(bundle.root, bundle.actions.length, configUri);
//     }

//     function test_proposeChugSplashBundle_success_proposer() external {
//         vm.prank(owner);
//         manager.addProposer(proposer);
//         test_proposeChugSplashBundle_success(proposer);
//     }

//     function test_proposeChugSplashBundle_success_owner() external {
//         test_proposeChugSplashBundle_success(owner);
//     }

//     // proposeChugSplashBundle:
//     // - updates bundles mapping
//     function test_proposeChugSplashBundle_success(address _caller) internal {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         string memory configUri = helper_readConfigUri(bundleInfoPath);
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);

//         vm.expectEmit(true, true, true, true);
//         emit ChugSplashBundleProposed(bundleId, bundle.root, bundle.actions.length, configUri);
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ChugSplashBundleProposed"))
//         );

//         vm.prank(_caller);
//         manager.proposeChugSplashBundle(bundle.root, bundle.actions.length, configUri);
//         ChugSplashBundleState memory bundleState = manager.bundles(bundleId);
//         assertEq(uint8(bundleState.status), uint8(ChugSplashBundleStatus.PROPOSED));
//         assertEq(bundleState.executions.length, bundle.actions.length);
//         for (uint i = 0; i < bundleState.executions.length; i++) {
//             assertEq(bundleState.executions[i], false);
//         }
//         assertEq(bundleState.merkleRoot, bundle.root);
//     }

//     // approveChugSplashBundle:
//     // - reverts if not called by owner
//     function test_approveChugSplashBundle_revert_nonOwner() external {
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);

//         vm.prank(nonOwner);
//         vm.expectRevert("Ownable: caller is not the owner");
//         manager.approveChugSplashBundle(bundleId);
//     }

//     // approveChugSplashBundle:
//     // - reverts if the manager's balance minus the debt is less than the owner bond amount
//     function test_approveChugSplashBundle_revert_balance() external {
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);

//         assertEq(address(manager).balance, 0);
//         uint256 totalDebt = 1 gwei;
//         uint256 insufficientAmount = ownerBondAmount + totalDebt - 1;

//         stdstore.target(address(manager)).sig("totalDebt()").checked_write(totalDebt);

//         (bool success, ) = address(manager).call{ value: insufficientAmount }(new bytes(0));
//         assertTrue(success);
//         vm.expectRevert("ChugSplashManager: insufficient balance in manager");
//         vm.prank(owner);
//         manager.approveChugSplashBundle(bundleId);
//     }

//     // approveChugSplashBundle:
//     // - reverts if bundle's status is not `PROPOSED`
//     function test_approveChugSplashBundle_revert_notProposed() external {
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);

//         (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
//         assertTrue(success);

//         vm.expectRevert(
//             "ChugSplashManager: bundle does not exist or has already been approved or completed"
//         );
//         vm.prank(owner);
//         manager.approveChugSplashBundle(bundleId);
//     }

//     // approveChugSplashBundle:
//     // - reverts if there is an active bundle
//     function test_approveChugSplashBundle_revert_activeBundle() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         string memory configUri = helper_readConfigUri(bundleInfoPath);
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);

//         (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
//         assertTrue(success);

//         stdstore.target(address(manager)).sig("activeBundleId()").checked_write(bytes32(hex"1337"));

//         vm.startPrank(owner);
//         manager.proposeChugSplashBundle(bundle.root, bundle.actions.length, configUri);

//         vm.expectRevert(
//             "ChugSplashManager: another bundle has been approved and not yet completed"
//         );
//         manager.approveChugSplashBundle(bundleId);
//     }

//     // approveChugSplashBundle:
//     // - updates bundles mapping
//     function test_approveChugSplashBundle_success() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         string memory configUri = helper_readConfigUri(bundleInfoPath);
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);

//         (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
//         assertTrue(success);

//         vm.startPrank(owner);
//         manager.proposeChugSplashBundle(bundle.root, bundle.actions.length, configUri);

//         vm.expectEmit(true, true, true, true);
//         emit ChugSplashBundleApproved(bundleId);
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ChugSplashBundleApproved"))
//         );
//         manager.approveChugSplashBundle(bundleId);
//         assertEq(manager.activeBundleId(), bundleId);
//         assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.APPROVED));
//     }

//     function test_executeChugSplashAction_revert_onlySelectedExecutor() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         ChugSplashAction[] memory actions = helper_getActions(bundle);
//         uint256[] memory actionIndexes = helper_getActionIndexes(actions);
//         bytes32[][] memory siblings = helper_getSiblings(bundle);

//         helper_proposeThenApproveThenFundThenClaimBundle();
//         vm.expectRevert("ChugSplashManager: caller is not approved executor for active bundle ID");
//         manager.executeChugSplashAction(actions[0], actionIndexes[0], siblings[0]);
//     }

//     function test_executeChugSplashAction_revert_alreadyExecuted() external {
//         helper_proposeThenApproveThenFundThenClaimBundle();
//         helper_executeFirstAction();

//         vm.expectRevert("ChugSplashManager: action has already been executed");
//         helper_executeFirstAction();
//     }

//     function test_executeChugSplashAction_revert_invalidProof() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         ChugSplashAction[] memory actions = helper_getActions(bundle);
//         uint256[] memory actionIndexes = helper_getActionIndexes(actions);
//         bytes32[][] memory siblings = helper_getSiblings(bundle);

//         helper_proposeThenApproveThenFundThenClaimBundle();

//         hoax(executor1);
//         vm.expectRevert("ChugSplashManager: invalid bundle action proof");
//         manager.executeChugSplashAction(
//             actions[0],
//             actionIndexes[1], // Incorrect action index
//             siblings[0]
//         );
//     }

//     function test_executeChugSplashAction_revert_noAdapter() external {
//         helper_proposeThenApproveThenFundThenClaimBundle();

//         vm.mockCall(
//             address(recorder),
//             abi.encodeWithSelector(recorder.adapters.selector, bytes32(0)),
//             abi.encode(address(0))
//         );
//         vm.expectRevert("ChugSplashManager: proxy type has no adapter");
//         helper_executeFirstAction();
//     }

//     function test_executeChugSplashAction_success_deployProxyAndImplementation() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);
//         uint256 arrayIndex = helper_indexOfActionType(
//             bundle,
//             ChugSplashActionType.DEPLOY_IMPLEMENTATION
//         );
//         ChugSplashAction memory action = bundle.actions[arrayIndex].action;
//         uint256 actionIndex = bundle.actions[arrayIndex].proof.actionIndex;
//         bytes32[] memory siblings = bundle.actions[arrayIndex].proof.siblings;

//         helper_proposeThenApproveThenFundThenClaimBundle();
//         address payable proxyAddress = manager.getDefaultProxyAddress(action.referenceName);
//         assertEq(proxyAddress.code.length, 0);
//         address implementationAddress = Create2.compute(
//             address(manager),
//             keccak256(bytes(action.referenceName)),
//             action.data
//         );
//         assertEq(implementationAddress.code.length, 0);
//         uint256 initialTotalDebt = manager.totalDebt();
//         uint256 initialExecutorDebt = manager.debt(executor1);

//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(
//                 ChugSplashRecorder.announceWithData,
//                 ("DefaultProxyDeployed", abi.encodePacked(proxyAddress))
//             )
//         );
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ImplementationDeployed"))
//         );
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(
//                 ChugSplashRecorder.announceWithData,
//                 ("ChugSplashActionExecuted", abi.encodePacked(proxyAddress))
//             )
//         );
//         vm.expectEmit(true, true, true, true);
//         emit DefaultProxyDeployed(
//             action.referenceName,
//             proxyAddress,
//             bundleId,
//             action.referenceName
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ImplementationDeployed(
//             action.referenceName,
//             implementationAddress,
//             bundleId,
//             action.referenceName
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ChugSplashActionExecuted(bundleId, proxyAddress, executor1, actionIndex);

//         hoax(executor1);
//         manager.executeChugSplashAction(action, actionIndex, siblings);
//         uint256 finalTotalDebt = manager.totalDebt();
//         uint256 finalExecutorDebt = manager.debt(executor1);

//         ChugSplashBundleState memory bundleState = manager.bundles(bundleId);
//         uint256 executionGasUsed = 760437;
//         uint256 estExecutorPayment = (tx.gasprice *
//             executionGasUsed *
//             (100 + executorPaymentPercentage)) / 100;

//         assertGt(proxyAddress.code.length, 0);
//         assertGt(implementationAddress.code.length, 0);
//         assertEq(bundleState.actionsExecuted, 1);
//         assertTrue(bundleState.executions[actionIndex]);
//         bytes32 implementationSalt = keccak256(bytes(action.referenceName));
//         assertEq(manager.implementations(implementationSalt), implementationAddress);
//         assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
//         assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
//     }

//     function test_executeChugSplashAction_success_setStorage() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);
//         uint256 arrayIndex = helper_indexOfActionType(bundle, ChugSplashActionType.SET_STORAGE);
//         ChugSplashAction memory action = bundle.actions[arrayIndex].action;
//         uint256 actionIndex = bundle.actions[arrayIndex].proof.actionIndex;
//         bytes32[] memory siblings = bundle.actions[arrayIndex].proof.siblings;

//         helper_proposeThenApproveThenFundThenClaimBundle();
//         uint256 initialTotalDebt = manager.totalDebt();
//         uint256 initialExecutorDebt = manager.debt(executor1);
//         address payable proxyAddress = manager.getDefaultProxyAddress(
//             bundle.actions[0].action.referenceName
//         );
//         (bytes32 storageKey, uint8 offset, bytes memory segment) = abi.decode(
//             action.data,
//             (bytes32, uint8, bytes)
//         );

//         vm.expectCall(
//             address(defaultUpdater),
//             abi.encodeCall(defaultUpdater.setStorage, (storageKey, offset, segment))
//         );
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(
//                 ChugSplashRecorder.announceWithData,
//                 ("ChugSplashActionExecuted", abi.encodePacked(proxyAddress))
//             )
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ChugSplashActionExecuted(bundleId, proxyAddress, executor1, actionIndex);

//         hoax(executor1);
//         manager.executeChugSplashAction(action, actionIndex, siblings);

//         uint256 finalTotalDebt = manager.totalDebt();
//         uint256 finalExecutorDebt = manager.debt(executor1);

//         ChugSplashBundleState memory bundleState = manager.bundles(bundleId);
//         vm.prank(address(manager));
//         address implementationAddress = Proxy(proxyAddress).implementation();
//         uint256 executionGasUsed = 67190;
//         uint256 estExecutorPayment = (tx.gasprice *
//             executionGasUsed *
//             (100 + executorPaymentPercentage)) / 100;

//         assertEq(bundleState.actionsExecuted, 1);
//         assertTrue(bundleState.executions[actionIndex]);
//         assertEq(implementationAddress, address(defaultUpdater));
//         assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
//         assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
//     }

//     function test_completeChugSplashBundle_revert_onlySelectedExecutor() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         helper_populateSetImplArrays(bundle);

//         vm.expectRevert("ChugSplashManager: caller is not approved executor for active bundle ID");
//         helper_completeBundle(executor2);
//     }

//     function test_completeChugSplashBundle_revert_invalidProof() external {
//         helper_proposeThenApproveThenFundThenClaimBundle();
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         helper_populateSetImplArrays(bundle);
//         setImplSiblingArray[0][0] = bytes32(0);
//         vm.expectRevert("ChugSplashManager: invalid bundle action proof");
//         helper_completeBundle(executor1);
//     }

//     function test_completeChugSplashBundle_revert_incompleteBundle() external {
//         helper_proposeThenApproveThenFundThenClaimBundle();
//         helper_executeFirstAction();
//         vm.expectRevert("ChugSplashManager: bundle was not completed");
//         helper_completeBundle(executor1);
//     }

//     // function test_completeChugSplashBundle_success_defaultProxy() external {
//     //     bytes32 bundleId = helper_getBundleId(bundleInfoPath);
//     //     ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//     //     helper_proposeThenApproveThenFundThenClaimBundle();
//     //     helper_executeMultipleActions(bundleInfoPath);
//     //     helper_populateSetImplArrays(bundle);

//     //     ChugSplashBundleState memory prevBundleState = manager.bundles(bundleId);
//     //     address payable proxyAddress = manager.getDefaultProxyAddress(
//     //         setImplActionArray[0].referenceName
//     //     );
//     //     uint256 initialTotalDebt = manager.totalDebt();
//     //     uint256 initialExecutorDebt = manager.debt(executor1);
//     //     uint256 actionIndex = setImplActionIndexArray[0];
//     //     uint256 numActions = actionIndex + 1;

//     //     vm.expectCall(
//     //         address(registry),
//     //         abi.encodeCall(
//     //             ChugSplashRecorder.announceWithData,
//     //             ("ChugSplashActionExecuted", abi.encodePacked(proxyAddress))
//     //         )
//     //     );
//     //     vm.expectEmit(true, true, true, true);
//     //     emit ChugSplashActionExecuted(bundleId, proxyAddress, executor1, actionIndex);
//     //     vm.expectCall(
//     //         address(registry),
//     //         abi.encodeCall(ChugSplashRecorder.announce, ("ChugSplashBundleCompleted"))
//     //     );
//     //     vm.expectEmit(true, true, true, true);
//     //     emit ChugSplashBundleCompleted(bundleId, executor1, numActions);
//     //     helper_completeBundle(executor1);

//     //     uint256 finalTotalDebt = manager.totalDebt();
//     //     uint256 finalExecutorDebt = manager.debt(executor1);
//     //     Outdated salt:
//     //     bytes32 implementationSalt = keccak256(
//     //         abi.encode(bundleId, bytes(setImplActionArray[0].referenceName))
//     //     );
//     //     address expectedImplementation = manager.implementations(implementationSalt);
//     //     ChugSplashBundleState memory bundleState = manager.bundles(bundleId);
//     //     uint256 gasUsed = 45472;
//     //     uint256 estExecutorPayment = (tx.gasprice * gasUsed *
//     //        ( 100 + executorPaymentPercentage)) / 100;
//     //     vm.prank(address(manager));
//     //     address implementation = Proxy(proxyAddress).implementation();

//     //     assertEq(bundleState.actionsExecuted, prevBundleState.actionsExecuted + 1);
//     //     assertTrue(bundleState.executions[bundle.actions.length]);
//     //     assertEq(implementation, expectedImplementation);
//     //     assertEq(uint8(bundleState.status), uint8(ChugSplashBundleStatus.COMPLETED));
//     //     assertEq(manager.activeBundleId(), bytes32(0));
//     //     assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
//     //     assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
//     // }

//     // function test_completeChugSplashBundle_success_transparentProxy() external {
//     //     TransparentUpgradeableProxy transparentProxy = new TransparentUpgradeableProxy(
//     //         Dummy implementation so the OpenZeppelin proxy doesn't revert:
//     //         address(managerImplementation),
//     //         address(manager),
//     //         ""
//     //     );
//     //     address payable transparentProxyAddress = payable(address(transparentProxy));
//     //     bytes32 proxyType = keccak256(bytes("oz-transparent"));
//     //     recorder.addProxyType(proxyType, address(ozTransparentAdapter), address(defaultUpdater));
//     //     helper_setProxyToReferenceName(referenceName, transparentProxyAddress, proxyType);
//     //     helper_proposeThenApproveThenFundThenClaimBundle();
//     //     helper_executeMultipleActions();
//     //     ChugSplashBundleState memory prevBundle = manager.bundles(bundleId);
//     //     uint256 initialTotalDebt = manager.totalDebt();
//     //     uint256 initialExecutorDebt = manager.debt(executor1);
//     //     uint256 actionIndex = setImplActionIndexArray[0];
//     //     uint256 numActions = actionIndex + 1;

//     //     vm.expectCall(
//     //         address(registry),
//     //         abi.encodeCall(
//     //             ChugSplashRecorder.announceWithData,
//     //             ("ChugSplashActionExecuted", abi.encodePacked(transparentProxyAddress))
//     //         )
//     //     );
//     //     vm.expectEmit(true, true, true, true);
//     //     emit ChugSplashActionExecuted(bundleId, transparentProxyAddress, executor1, actionIndex);
//     //     vm.expectCall(
//     //         address(registry),
//     //         abi.encodeCall(ChugSplashRecorder.announce, ("ChugSplashBundleCompleted"))
//     //     );
//     //     vm.expectEmit(true, true, true, true);
//     //     emit ChugSplashBundleCompleted(bundleId, executor1, numActions);
//     //     helper_completeBundle(executor1);

//     //     uint256 finalTotalDebt = manager.totalDebt();
//     //     uint256 finalExecutorDebt = manager.debt(executor1);
//     //     Outdated salt:
//     //     bytes32 implementationSalt = keccak256(
//     //         abi.encode(bundleId, bytes(firstAction.referenceName))
//     //     );
//     //     address expectedImplementation = manager.implementations(implementationSalt);
//     //     ChugSplashBundleState memory bundle = manager.bundles(bundleId);
//     //     uint256 gasUsed = 45472;
//     //     uint256 estExecutorPayment = (tx.gasprice * gasUsed * (100 + executorPaymentPercentage))
//     //          / 100;
//     //     vm.prank(address(manager));
//     //     address implementation = transparentProxy.implementation();

//     //     assertEq(bundle.actionsExecuted, prevBundle.actionsExecuted + 1);
//     //     assertTrue(bundle.executions[actions.length]);
//     //     assertEq(implementation, expectedImplementation);
//     //     assertEq(uint8(bundle.status), uint8(ChugSplashBundleStatus.COMPLETED));
//     //     assertEq(manager.activeBundleId(), bytes32(0));
//     //     assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
//     //     assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
//     // }

//     // cancelActiveChugSplashBundle:
//     // - reverts if not called by owner
//     function test_cancelActiveChugSplashBundle_revert_nonOwner() external {
//         vm.prank(nonOwner);
//         vm.expectRevert("Ownable: caller is not the owner");
//         manager.cancelActiveChugSplashBundle();
//     }

//     // cancelActiveChugSplashBundle:
//     // - reverts if no bundle is active
//     function test_cancelActiveChugSplashBundle_revert_noActiveBundle() external {
//         vm.prank(owner);
//         vm.expectRevert("ChugSplashManager: no bundle is currently active");
//         manager.cancelActiveChugSplashBundle();
//     }

//     function test_cancelActiveChugSplashBundle_success_withinExecutionLockTime() external {
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);
//         helper_proposeThenApproveThenFundThenClaimBundle();
//         helper_executeFirstAction();
//         uint256 timeClaimed = manager.bundles(bundleId).timeClaimed;
//         uint256 actionsExecuted = manager.bundles(bundleId).actionsExecuted;
//         uint256 initialDebt = manager.totalDebt();

//         vm.warp(executionLockTime + timeClaimed);
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ChugSplashBundleCancelled"))
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ChugSplashBundleCancelled(bundleId, owner, actionsExecuted);
//         vm.prank(owner);
//         manager.cancelActiveChugSplashBundle();

//         assertEq(manager.totalDebt(), initialDebt + ownerBondAmount);
//         assertEq(manager.activeBundleId(), bytes32(0));
//         assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
//     }

//     // cancelActiveChugSplashBundle:
//     // - if bundle is NOT cancelled within the `executionLockTime` window and there is an executor:
//     //   - does not decrease `debt`
//     // - removes active bundle id
//     // - sets bundle status to `CANCELLED`
//     // - emits ChugSplashBundleCancelled
//     // - calls registry.announce with ChugSplashBundleCancelled
//     function test_cancelActiveChugSplashBundle_success_afterExecutionLockTime() external {
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);
//         helper_proposeThenApproveThenFundThenClaimBundle();
//         helper_executeFirstAction();
//         uint256 timeClaimed = manager.bundles(bundleId).timeClaimed;
//         uint256 actionsExecuted = manager.bundles(bundleId).actionsExecuted;
//         uint256 initialDebt = manager.totalDebt();

//         vm.warp(executionLockTime + timeClaimed + 1);
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ChugSplashBundleCancelled"))
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ChugSplashBundleCancelled(bundleId, owner, actionsExecuted);
//         vm.prank(owner);
//         manager.cancelActiveChugSplashBundle();

//         assertEq(manager.totalDebt(), initialDebt);
//         assertEq(manager.activeBundleId(), bytes32(0));
//         assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
//     }

//     // claimBundle:
//     // - reverts if there is no active bundle
//     function test_claimBundle_revert_onlyExecutor() external {
//         vm.expectRevert("ChugSplashManager: caller is not an executor");
//         vm.prank(owner);
//         manager.claimBundle();
//     }

//     // claimBundle:
//     // - reverts if there is no active bundle
//     function test_claimBundle_revert_noActiveBundle() external {
//         vm.expectRevert("ChugSplashManager: no bundle is currently active");
//         vm.prank(executor1);
//         manager.claimBundle();
//     }

//     // claimBundle:
//     // - reverts if bundle is currently claimed by another executor
//     function test_claimBundle_revert_alreadyClaimed() external {
//         helper_proposeThenApproveBundle();
//         helper_claimBundle(executor1);

//         vm.warp(initialTimestamp + executionLockTime);
//         vm.expectRevert("ChugSplashManager: bundle is currently claimed by an executor");
//         helper_claimBundle(executor2);
//     }

//     // claimBundle:
//     // - see helper_claimBundle
//     // - if there was no previous executor:
//     //   - increases `totalDebt` by `executorBondAmount`
//     function test_claimBundle_success_noPreviousExecutor() external {
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);
//         helper_proposeThenApproveBundle();

//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ChugSplashBundleClaimed"))
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ChugSplashBundleClaimed(bundleId, executor1);
//         helper_claimBundle(executor1);

//         ChugSplashBundleState memory bundle = manager.bundles(bundleId);

//         assertEq(bundle.timeClaimed, block.timestamp);
//         assertEq(bundle.selectedExecutor, executor1);
//     }

//     // claimBundle:
//     // - see helper_claimBundle
//     // - if there was a previous executor:
//     //   - `totalDebt` remains the same
//     function test_claimBundle_success_withPreviousExecutor() external {
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);
//         helper_proposeThenApproveBundle();
//         helper_claimBundle(executor1);
//         uint256 secondClaimedBundleTimestamp = initialTimestamp + executionLockTime + 1;
//         vm.warp(secondClaimedBundleTimestamp);

//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ChugSplashBundleClaimed"))
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ChugSplashBundleClaimed(bundleId, executor2);
//         helper_claimBundle(executor2);

//         ChugSplashBundleState memory bundle = manager.bundles(bundleId);

//         assertEq(bundle.timeClaimed, secondClaimedBundleTimestamp);
//         assertEq(bundle.selectedExecutor, executor2);
//     }

//     function test_claimExecutorPayment_revert_onlyExecutor() external {
//         vm.expectRevert("ChugSplashManager: caller is not an executor");
//         vm.prank(owner);
//         manager.claimExecutorPayment();
//     }

//     // claimExecutorPayment:
//     // - sets debt to 0
//     // - increases executor's balance by `debt`
//     // - decreases ChugSplashManager balance by `debt`
//     // - emits ExecutorPaymentClaimed
//     // - calls registry.announce with ExecutorPaymentClaimed
//     function test_claimExecutorPayment_success() external {
//         helper_proposeThenApproveThenFundThenClaimBundle();
//         helper_executeFirstAction();
//         uint256 executorDebt = manager.debt(executor1);
//         uint256 initialTotalDebt = manager.totalDebt();
//         uint256 initialExecutorBalance = address(executor1).balance;

//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ExecutorPaymentClaimed"))
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ExecutorPaymentClaimed(executor1, executorDebt);
//         vm.prank(executor1);
//         manager.claimExecutorPayment();

//         assertEq(address(executor1).balance, executorDebt + initialExecutorBalance);
//         assertEq(manager.debt(executor1), 0);
//         assertEq(manager.totalDebt(), initialTotalDebt - executorDebt);
//     }

//     // transferProxyOwnership:
//     // - reverts if not called by owner
//     function test_transferProxyOwnership_revert_nonOwner() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         ChugSplashAction[] memory actions = helper_getActions(bundle);

//         vm.prank(nonOwner);
//         vm.expectRevert("Ownable: caller is not the owner");
//         manager.transferProxyOwnership(actions[0].referenceName, owner);
//     }

//     // transferProxyOwnership:
//     // - reverts if there is a currently active bundle
//     function test_transferProxyOwnership_revert_activeBundle() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         ChugSplashAction[] memory actions = helper_getActions(bundle);
//         helper_proposeThenApproveBundle();

//         vm.prank(owner);
//         vm.expectRevert("ChugSplashManager: bundle is currently active");
//         manager.transferProxyOwnership(actions[0].referenceName, owner);
//     }

//     // transferProxyOwnership:
//     // - calls the adapter to change ownership
//     // - emits ProxyOwnershipTransferred
//     // - calls registry.announce with ProxyOwnershipTransferred
//     function test_transferProxyOwnership_success_defaultProxy() external {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         ChugSplashAction[] memory actions = helper_getActions(bundle);
//         string memory referenceName = actions[0].referenceName;
//         helper_proposeThenApproveThenFundThenClaimBundle();
//         helper_executeMultipleActions(bundleInfoPath);
//         helper_populateSetImplArrays(bundle);
//         helper_completeBundle(executor1);
//         address payable proxyAddress = manager.getDefaultProxyAddress(referenceName);
//         helper_transferProxyOwnership(proxyAddress, nonOwner, referenceName, bytes32(0));
//     }

//     function test_transferProxyOwnership_success_transparentProxy() external {
//         TransparentUpgradeableProxy transparentProxy = new TransparentUpgradeableProxy(
//             address(registry), // Dummy value so that the OpenZeppelin proxy doesn't revert
//             address(manager),
//             ""
//         );
//         address payable transparentProxyAddress = payable(address(transparentProxy));
//         string memory transparentProxyReferenceName = "TransparentProxy";
//         bytes32 proxyType = keccak256(bytes("oz-transparent"));
//         recorder.addProxyType(proxyType, address(ozTransparentAdapter));
//         helper_setProxyToReferenceName(
//             transparentProxyReferenceName,
//             transparentProxyAddress,
//             proxyType
//         );

//         helper_transferProxyOwnership(
//             transparentProxyAddress,
//             nonOwner,
//             transparentProxyReferenceName,
//             proxyType
//         );

//         assertEq(manager.proxies(transparentProxyReferenceName), payable(address(0)));
//         assertEq(manager.proxyTypes(transparentProxyReferenceName), bytes32(0));
//     }

//     function test_setProxyToReferenceName_revert_nonOwner() external {
//         string memory dummyReferenceName = "Token";
//         address payable proxyAddress = manager.getDefaultProxyAddress(dummyReferenceName);
//         vm.expectRevert("Ownable: caller is not the owner");
//         vm.prank(nonOwner);
//         manager.setProxyToReferenceName(dummyReferenceName, proxyAddress, bytes32(0));
//     }

//     function test_setProxyToReferenceName_revert_noActiveBundle() external {
//         string memory dummyReferenceName = "Token";
//         helper_proposeThenApproveBundle();
//         address payable proxyAddress = manager.getDefaultProxyAddress(dummyReferenceName);

//         vm.prank(owner);
//         vm.expectRevert("ChugSplashManager: cannot change proxy while bundle is active");
//         manager.setProxyToReferenceName(dummyReferenceName, proxyAddress, bytes32(0));
//     }

//     function test_setProxyToReferenceName_revert_zeroAddressProxy() external {
//         string memory dummyReferenceName = "Token";
//         vm.prank(owner);
//         vm.expectRevert("ChugSplashManager: proxy cannot be address(0)");
//         manager.setProxyToReferenceName(
//             dummyReferenceName,
//             payable(address(0)),
//             bytes32(uint256(64))
//         );
//     }

//     function test_setProxyToReferenceName_success() external {
//         string memory dummyReferenceName = "Token";
//         address payable proxyAddress = manager.getDefaultProxyAddress(dummyReferenceName);
//         bytes32 proxyType = keccak256(bytes("oz-transparent"));
//         helper_setProxyToReferenceName(dummyReferenceName, proxyAddress, proxyType);
//     }

//     function test_addProposer_revert_nonOwner() external {
//         vm.prank(nonOwner);
//         vm.expectRevert("Ownable: caller is not the owner");
//         manager.addProposer(proposer);
//     }

//     function test_addProposer_revert_alreadyAdded() external {
//         vm.startPrank(owner);
//         manager.addProposer(proposer);
//         vm.expectRevert("ChugSplashManager: proposer was already added");
//         manager.addProposer(proposer);
//     }

//     function test_addProposer_success() external {
//         assertFalse(manager.proposers(proposer));

//         vm.expectEmit(true, true, true, true);
//         emit ProposerAdded(proposer, owner);
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ProposerAdded"))
//         );
//         vm.prank(owner);
//         manager.addProposer(proposer);

//         assertTrue(manager.proposers(proposer));
//     }

//     function test_removeProposer_revert_nonOwner() external {
//         vm.prank(nonOwner);
//         vm.expectRevert("Ownable: caller is not the owner");
//         manager.removeProposer(proposer);
//     }

//     function test_removeProposer_revert_alreadyRemoved() external {
//         vm.prank(owner);
//         vm.expectRevert("ChugSplashManager: proposer was already removed");
//         manager.removeProposer(proposer);
//     }

//     function test_removeProposer_success() external {
//         vm.startPrank(owner);
//         manager.addProposer(proposer);

//         assertTrue(manager.proposers(proposer));

//         vm.expectEmit(true, true, true, true);
//         emit ProposerRemoved(proposer, owner);
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ProposerRemoved"))
//         );
//         manager.removeProposer(proposer);

//         assertFalse(manager.proposers(proposer));
//     }

//     // withdrawOwnerETH:
//     // - reverts if not called by owner
//     function test_withdrawOwnerETH_revert_nonOwner() external {
//         vm.prank(nonOwner);
//         vm.expectRevert("Ownable: caller is not the owner");
//         manager.withdrawOwnerETH();
//     }

//     // withdrawOwnerETH:
//     // - reverts if there is an active bundle
//     function test_withdrawOwnerETH_revert_noActiveBundle() external {
//         helper_proposeThenApproveBundle();

//         vm.prank(owner);
//         vm.expectRevert("ChugSplashManager: cannot withdraw funds while bundle is active");
//         manager.withdrawOwnerETH();
//     }

//     function test_withdrawOwnerETH_success() external {
//         uint256 managerBalance = 1 ether;
//         uint256 totalDebt = 1 gwei;
//         uint256 amountWithdrawn = managerBalance - totalDebt;
//         helper_fundChugSplashManager(managerBalance);
//         stdstore.target(address(manager)).sig("totalDebt()").checked_write(totalDebt);
//         uint256 prevOwnerBalance = address(owner).balance;

//         vm.expectEmit(true, true, true, true);
//         emit OwnerWithdrewETH(owner, amountWithdrawn);
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("OwnerWithdrewETH"))
//         );
//         vm.prank(owner);
//         manager.withdrawOwnerETH();

//         assertEq(address(owner).balance, prevOwnerBalance + amountWithdrawn);
//     }

//     function test_receive_success() external {
//         uint256 amountDeposited = 1 ether;
//         uint256 prevManagerBalance = address(manager).balance;

//         hoax(owner);
//         vm.expectEmit(true, true, true, true);
//         emit ETHDeposited(owner, amountDeposited);
//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ETHDeposited"))
//         );
//         helper_fundChugSplashManager(amountDeposited);

//         assertEq(address(manager).balance, prevManagerBalance + amountDeposited);
//     }

//     function helper_proposeThenApproveBundle() internal {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         string memory configUri = helper_readConfigUri(bundleInfoPath);
//         bytes32 bundleId = helper_getBundleId(bundleInfoPath);

//         startHoax(owner);
//         manager.proposeChugSplashBundle(bundle.root, bundle.actions.length, configUri);
//         (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
//         assertTrue(success);
//         manager.approveChugSplashBundle(bundleId);
//         vm.stopPrank();
//     }

//     function helper_executeMultipleActions(string memory _bundleInfoPath) internal {
//         ChugSplashBundle memory bundle = helper_readBundle(_bundleInfoPath);
//         startHoax(executor1);
//         for (uint i = 0; i < bundle.actions.length; i++) {
//             if (bundle.actions[i].action.actionType != ChugSplashActionType.SET_IMPLEMENTATION) {
//                 manager.executeChugSplashAction(
//                     bundle.actions[i].action,
//                     bundle.actions[i].proof.actionIndex,
//                     bundle.actions[i].proof.siblings
//                 );
//             }
//         }
//         vm.stopPrank();
//     }

//     function helper_completeBundle(address _executor) internal {
//         hoax(_executor);
//         manager.completeChugSplashBundle(
//             setImplActionArray,
//             setImplActionIndexArray,
//             setImplSiblingArray
//         );
//     }

//     // function helper_executeSecondAction() internal {
//     //     hoax(executor1);
//     //     manager.executeChugSplashAction(secondAction, actionIndexes[1], proofs[1]);
//     // }

//     function helper_proposeThenApproveThenFundThenClaimBundle() internal {
//         helper_proposeThenApproveBundle();
//         helper_fundChugSplashManager(bundleExecutionCost);
//         helper_claimBundle(executor1);
//     }

//     function helper_fundChugSplashManager(uint256 _amount) internal {
//         (bool success, ) = address(manager).call{ value: _amount }(new bytes(0));
//         assertTrue(success);
//     }

//     function helper_executeFirstAction() internal {
//         ChugSplashBundle memory bundle = helper_readBundle(bundleInfoPath);
//         ChugSplashAction[] memory actions = helper_getActions(bundle);
//         uint256[] memory actionIndexes = helper_getActionIndexes(actions);
//         bytes32[][] memory siblings = helper_getSiblings(bundle);

//         hoax(executor1);
//         manager.executeChugSplashAction(actions[0], actionIndexes[0], siblings[0]);
//     }

//     function helper_transferProxyOwnership(
//         address payable _proxy,
//         address _newOwner,
//         string memory _referenceName,
//         bytes32 _proxyType
//     ) public {
//         vm.prank(address(manager));
//         assertEq(Proxy(_proxy).admin(), address(manager));

//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(ChugSplashRecorder.announce, ("ProxyOwnershipTransferred"))
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ProxyOwnershipTransferred(
//             _referenceName,
//             _proxy,
//             _proxyType,
//             _newOwner,
//             _referenceName
//         );
//         vm.prank(owner);
//         manager.transferProxyOwnership(_referenceName, _newOwner);

//         vm.prank(_newOwner);
//         assertEq(Proxy(_proxy).admin(), _newOwner);
//     }

//     function helper_setProxyToReferenceName(
//         string memory _referenceName,
//         address payable _proxyAddress,
//         bytes32 _proxyType
//     ) public {
//         assertEq(manager.proxies(_referenceName), payable(address(0)));
//         assertEq(manager.proxyTypes(_referenceName), bytes32(0));

//         vm.expectCall(
//             address(registry),
//             abi.encodeCall(
//                 ChugSplashRecorder.announceWithData,
//                 ("ProxySetToReferenceName", abi.encodePacked(_proxyAddress))
//             )
//         );
//         vm.expectEmit(true, true, true, true);
//         emit ProxySetToReferenceName(_referenceName, _proxyAddress, _proxyType, _referenceName);

//         vm.prank(owner);
//         manager.setProxyToReferenceName(_referenceName, _proxyAddress, _proxyType);

//         assertEq(manager.proxies(_referenceName), _proxyAddress);
//         assertEq(manager.proxyTypes(_referenceName), _proxyType);
//     }

//     function helper_claimBundle(address _executor) internal {
//         vm.prank(_executor);
//         manager.claimBundle();
//     }

//     /**
//      * @notice Helper function to read a bundle given the path to its JSON file. We use this
//      *         helper function instead of declaring a ChugSplashBundle struct in storage because
//      *         the Solidity compiler hasn't supported copying dynamic arrays from memory into
//      *         storage yet.
//      *
//      * @param _bundlePath Path from the project root to the JSON file that contains the bundle.
//      */
//     function helper_readBundle(
//         string memory _bundlePath
//     ) internal returns (ChugSplashBundle memory) {
//         string memory root = vm.projectRoot();
//         string memory path = string.concat(root, _bundlePath);
//         string memory json = vm.readFile(path);
//         bytes memory parsedJson = vm.parseJson(json, "bundle");

//         ChugSplashBundle memory bundle = abi.decode(parsedJson, (ChugSplashBundle));
//         return bundle;
//     }

//     function helper_readConfigUri(string memory _bundlePath) internal returns (string memory) {
//         string memory root = vm.projectRoot();
//         string memory path = string.concat(root, _bundlePath);
//         string memory json = vm.readFile(path);
//         bytes memory parsedJson = vm.parseJson(json, "configUri");

//         string memory configUri = abi.decode(parsedJson, (string));
//         return configUri;
//     }

//     function helper_getBundleId(string memory _bundleInfoPath) internal returns (bytes32) {
//         ChugSplashBundle memory bundle = helper_readBundle(_bundleInfoPath);
//         string memory configUri = helper_readConfigUri(_bundleInfoPath);
//         bytes32 bundleId = manager.computeBundleId(bundle.root, bundle.actions.length, configUri);
//         return bundleId;
//     }

//     function helper_getActions(
//         ChugSplashBundle memory _bundle
//     ) internal pure returns (ChugSplashAction[] memory) {
//         ChugSplashAction[] memory actions = new ChugSplashAction[](_bundle.actions.length);
//         for (uint i = 0; i < _bundle.actions.length; i++) {
//             actions[i] = _bundle.actions[i].action;
//         }
//         return actions;
//     }

//     function helper_getActionIndexes(
//         ChugSplashAction[] memory _actions
//     ) internal pure returns (uint256[] memory) {
//         uint256[] memory actionIndexes = new uint256[](_actions.length);
//         for (uint i = 0; i < _actions.length; i++) {
//             actionIndexes[i] = i;
//         }
//         return actionIndexes;
//     }

//     function helper_getSiblings(
//         ChugSplashBundle memory _bundle
//     ) internal pure returns (bytes32[][] memory) {
//         bytes32[][] memory proofs = new bytes32[][](_bundle.actions.length);
//         for (uint i = 0; i < _bundle.actions.length; i++) {
//             proofs[i] = _bundle.actions[i].proof.siblings;
//         }
//         return proofs;
//     }

//     function helper_indexOfActionType(
//         ChugSplashBundle memory _bundle,
//         ChugSplashActionType _actionType
//     ) internal pure returns (uint256) {
//         for (uint i = 0; i < _bundle.actions.length; i++) {
//             if (_actionType == _bundle.actions[i].action.actionType) {
//                 return i;
//             }
//         }
//         revert("ChugSplashManager_Test: could not find action type in bundle");
//     }

//     function helper_populateSetImplArrays(ChugSplashBundle memory _bundle) internal {
//         for (uint i = 0; i < _bundle.actions.length; i++) {
//             if (_bundle.actions[i].action.actionType == ChugSplashActionType.SET_IMPLEMENTATION) {
//                 setImplActionArray.push(_bundle.actions[i].action);
//                 setImplActionIndexArray.push(_bundle.actions[i].proof.actionIndex);
//                 setImplSiblingArray.push(_bundle.actions[i].proof.siblings);
//             }
//         }
//     }
// }
