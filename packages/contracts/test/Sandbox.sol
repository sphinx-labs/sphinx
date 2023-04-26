// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Test } from "forge-std/Test.sol";
import { ChugSplashManager } from "../contracts/ChugSplashManager.sol";
import { ChugSplashManagerProxy } from "../contracts/ChugSplashManagerProxy.sol";
import { ChugSplashRegistry } from "../contracts/ChugSplashRegistry.sol";
import { Version } from "../contracts/Semver.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IGasPriceCalculator } from "../contracts/interfaces/IGasPriceCalculator.sol";

contract Sandbox is Test {

    bytes initData = hex"000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001";

    address owner = address(128);
    address badImpl = address(64);

    ChugSplashRegistry registry;

    function setUp() external {
        vm.startPrank(owner);
        registry = new ChugSplashRegistry(owner);
        ChugSplashManager managerImpl = new ChugSplashManager(registry, IGasPriceCalculator(address(0)), IAccessControl(address(0)), 0, 0, 0, 0, Version(1, 0, 0));

        registry.addVersion(address(managerImpl));
    }

    function test() external {
        assertTrue(true);
        registry.claim(bytes32(0), owner, Version(1, 0, 0), initData);
    }
}
