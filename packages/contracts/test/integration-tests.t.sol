// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Test } from "forge-std/Test.sol";
import { Proxy } from "../contracts/libraries/Proxy.sol";
import { ChugSplashManager } from "../contracts/ChugSplashManager.sol";
import { ChugSplashRegistry } from "../contracts/ChugSplashRegistry.sol";
import { ChugSplashBootLoader } from "../contracts/ChugSplashBootLoader.sol";
import { MockChugSplashManager } from "./MockChugSplashManager.sol";
import { MockChugSplashRegistry } from "./MockChugSplashRegistry.sol";
import { Create2 } from "../contracts/libraries/Create2.sol";

contract Integration_Tests is Test {
    address owner = address(128);
    address executor = address(256);
    bytes32 salt = bytes32(hex"11");
    string projectName = "TestProject";
    uint256 ownerBondAmount = 10e8 gwei; // 0.1 ETH
    uint256 executionLockTime = 15 minutes;
    uint256 executorPaymentPercentage = 20;
    ChugSplashBootLoader bootloader;
    ChugSplashManager manager;
    Proxy registryProxy;

    function setUp() external {
        bootloader = new ChugSplashBootLoader{ salt: salt }();

        address registryProxyAddress = Create2.compute(
            address(this),
            salt,
            abi.encodePacked(type(Proxy).creationCode, abi.encode(address(owner)))
        );

        bootloader.initialize(
            owner,
            executionLockTime,
            ownerBondAmount,
            executorPaymentPercentage,
            address(1),
            registryProxyAddress,
            salt
        );

        registryProxy = new Proxy{ salt: salt }(owner);

        vm.startPrank(owner);
        registryProxy.upgradeTo(address(bootloader.registryImplementation()));
        vm.stopPrank();

        ChugSplashRegistry registry = ChugSplashRegistry(address(registryProxy));
        registry.register(projectName, owner);
        manager = registry.projects(projectName);
        registryProxy = Proxy(payable(address(registry)));
    }

    function test_upgrade_managerAndRegistryImplementations() external {
        ChugSplashManager newManagerImplementation = ChugSplashManager(
            payable(address(new MockChugSplashManager()))
        );
        ChugSplashRegistry newRegistryImplementation = ChugSplashRegistry(
            address(new MockChugSplashRegistry(address(newManagerImplementation)))
        );

        vm.startPrank(owner);
        registryProxy.upgradeTo(address(newRegistryImplementation));

        assertEq(registryProxy.implementation(), address(newRegistryImplementation));
        vm.stopPrank();
        assertEq(
            ChugSplashRegistry(address(registryProxy)).managerImplementation(),
            address(newManagerImplementation)
        );
        assertEq(manager.computeBundleId(bytes32(0), 0, ""), bytes32(uint256(1)));
    }
}
