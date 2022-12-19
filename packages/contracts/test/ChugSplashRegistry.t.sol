// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Test } from "forge-std/Test.sol";
import { ChugSplashManager } from "../contracts/ChugSplashManager.sol";
import { ChugSplashManagerProxy } from "../contracts/ChugSplashManagerProxy.sol";
import { ChugSplashRegistry } from "../contracts/ChugSplashRegistry.sol";
import { ProxyUpdater } from "../contracts/ProxyUpdater.sol";
import { Create2 } from "../contracts/libraries/Create2.sol";

contract ChugSplashRegistry_Test is Test {

    event ChugSplashProjectRegistered(
        string indexed projectNameHash,
        address indexed creator,
        address indexed manager,
        address owner,
        string projectName
    );

    event EventAnnounced(string indexed eventNameHash, address indexed manager, string eventName);

    event EventAnnouncedWithData(
        string indexed eventNameHash,
        address indexed manager,
        bytes indexed dataHash,
        string eventName,
        bytes data
    );

    event ProxyTypeAdded(bytes32 proxyType, address adapter);

    address owner = address(128);
    address adapter = address(256);
    bytes32 proxyType = bytes32(hex"1337");
    address dummyRegistryProxyAddress = address(1);
    string projectName = 'TestProject';
    uint256 ownerBondAmount = 10e8 gwei; // 0.1 ETH
    uint256 executorBondAmount = 1 ether;
    uint256 executionLockTime = 15 minutes;
    uint256 executorPaymentPercentage = 20;

    ChugSplashRegistry registry;
    ChugSplashManager manager;
    ProxyUpdater proxyUpdater;

    function setUp() external {
        proxyUpdater = new ProxyUpdater();

        manager = new ChugSplashManager{ salt: bytes32(0) }(
            ChugSplashRegistry(dummyRegistryProxyAddress),
            projectName,
            owner,
            address(proxyUpdater),
            executorBondAmount,
            executionLockTime,
            ownerBondAmount,
            executorPaymentPercentage
        );

        registry = new ChugSplashRegistry{ salt: bytes32(0) }(
            address(proxyUpdater),
            ownerBondAmount,
            executorBondAmount,
            executionLockTime,
            executorPaymentPercentage,
            address(manager)
        );
    }

    function test_constructor_success() external {
        assertEq(address(registry.proxyUpdater()), address(proxyUpdater));
        assertEq(registry.executorBondAmount(), executorBondAmount);
        assertEq(registry.executionLockTime(), executionLockTime);
        assertEq(registry.ownerBondAmount(), ownerBondAmount);
        assertEq(registry.executorPaymentPercentage(), executorPaymentPercentage);
        assertEq(registry.managerImplementation(), address(manager));
    }

    function test_register_revert_nameAlreadyRegistered() external {
        registry.register(projectName, owner);

        vm.expectRevert("ChugSplashRegistry: name already registered");
        registry.register(projectName, owner);
    }

    function test_register_success() external {
        address newManagerAddress = Create2.compute(
            address(registry),
            keccak256(bytes(projectName)),
            abi.encodePacked(type(ChugSplashManagerProxy).creationCode, abi.encode(address(registry), address(registry)))
        );

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit ChugSplashProjectRegistered(projectName, owner, newManagerAddress, owner, projectName);
        registry.register(projectName, owner);

        address payable newManager = payable(address(registry.projects(projectName)));

        vm.startPrank(address(registry));
        assertEq(address(ChugSplashManagerProxy(newManager).registryProxy()), address(registry));
        assertEq(ChugSplashManagerProxy(newManager).admin(), address(registry));
        assertEq(ChugSplashManagerProxy(newManager).implementation(), address(manager));
        vm.stopPrank();

        assertEq(ChugSplashManager(newManager).name(), projectName);
        assertEq(ChugSplashManager(newManager).owner(), owner);
        assertTrue(registry.managers(ChugSplashManager(newManager)));
    }

    function test_announce_revert_onlyManager() external {
        vm.prank(owner);
        vm.expectRevert("ChugSplashRegistry: events can only be announced by ChugSplashManager contracts");
        registry.announce('ChugSplashBundleProposed');
    }

    function test_announce_success() external {
        string memory announcedEvent = "ChugSplashBundleProposed";
        registry.register(projectName, owner);
        ChugSplashManager newManager = registry.projects(projectName);

        vm.prank(address(newManager));
        vm.expectEmit(true, true, true, true);
        emit EventAnnounced(announcedEvent, address(newManager), announcedEvent);
        registry.announce(announcedEvent);
    }

    function test_announceWithData_revert_onlyManager() external {
        vm.prank(owner);
        vm.expectRevert("ChugSplashRegistry: events can only be announced by ChugSplashManager contracts");
        registry.announceWithData('ChugSplashActionExecuted', abi.encodePacked(owner));
    }

    function test_announceWithData_success() external {
        string memory announcedEvent = "ChugSplashActionExecuted";
        registry.register(projectName, owner);
        ChugSplashManager newManager = registry.projects(projectName);
        bytes memory data = abi.encodePacked(newManager);

        vm.prank(address(newManager));
        vm.expectEmit(true, true, true, true);
        emit EventAnnouncedWithData(
            announcedEvent,
            address(newManager),
            data,
            announcedEvent,
            data
        );
        registry.announceWithData(announcedEvent, data);
    }

    function test_addProxyType_revert_existingAdapter() external {
        registry.addProxyType(proxyType, adapter);
        vm.expectRevert("ChugSplashRegistry: proxy type has an existing adapter");
        registry.addProxyType(proxyType, adapter);
    }

    function test_addProxyType_success() external {
        vm.expectEmit(true, true, true, true);
        emit ProxyTypeAdded(proxyType, adapter);
        registry.addProxyType(proxyType, adapter);
        assertEq(registry.adapters(proxyType), adapter);
    }
}