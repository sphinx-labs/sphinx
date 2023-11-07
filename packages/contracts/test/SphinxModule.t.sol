// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { console } from "forge-std/console.sol";
import "forge-std/Test.sol";
import { SphinxModuleFactory } from "../contracts/SphinxModuleFactory.sol";
import { SphinxModule } from "../contracts/SphinxModule.sol";
import { GnosisSafeProxyFactory } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
import { SimulateTxAccessor } from "@gnosis.pm/safe-contracts/accessors/SimulateTxAccessor.sol";
import { DefaultCallbackHandler } from "@gnosis.pm/safe-contracts/handler/DefaultCallbackHandler.sol";
import { CompatibilityFallbackHandler } from "@gnosis.pm/safe-contracts/handler/CompatibilityFallbackHandler.sol";
import { CreateCall } from "@gnosis.pm/safe-contracts/libraries/CreateCall.sol";
import { MultiSend } from "@gnosis.pm/safe-contracts/libraries/MultiSend.sol";
import { MultiSendCallOnly } from "@gnosis.pm/safe-contracts/libraries/MultiSendCallOnly.sol";
import { SignMessageLib } from "@gnosis.pm/safe-contracts/libraries/SignMessageLib.sol";
import { GnosisSafeL2 } from "@gnosis.pm/safe-contracts/GnosisSafeL2.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";

contract SphinxModule_Test is Test {

    address[] owners = new address[](5);
    uint256 threshold = 3;

    function setUp() public {
    }

    function test_TODO_success() external {
        // Deploy all Gnosis Safe contracts
        SimulateTxAccessor simulateTxAccessor = new SimulateTxAccessor();
        GnosisSafeProxyFactory safeProxyFactory = new GnosisSafeProxyFactory();
        // Deploy handlers
        DefaultCallbackHandler defaultCallbackHandler = new DefaultCallbackHandler();
        CompatibilityFallbackHandler compatibilityFallbackHandler = new CompatibilityFallbackHandler();
        // Deploy libraries
        CreateCall createCall = new CreateCall();
        MultiSend multiSend = new MultiSend();
        MultiSendCallOnly multiSendCallOnly = new MultiSendCallOnly();
        SignMessageLib signMessageLib = new SignMessageLib();
        // Deploy singletons
        GnosisSafeL2 gnosisSafeL2Singleton = new GnosisSafeL2();
        GnosisSafe gnosisSafeSingleton = new GnosisSafe();

        SphinxModuleFactory moduleFactory = new SphinxModuleFactory();

        owners[0] = address(0x1000);
        owners[1] = address(0x2000);
        owners[2] = address(0x3000);
        owners[3] = address(0x4000);
        owners[4] = address(0x5000);

        bytes memory setupModulesData = abi.encodeWithSelector(gnosisSafeSingleton.enableModule.selector, (address(0x1111)));
        bytes memory safeInitializerData = abi.encodePacked(gnosisSafeSingleton.setup.selector, abi.encode(owners, threshold, address(gnosisSafeSingleton), setupModulesData, address(compatibilityFallbackHandler), address(0), 0, address(0)));

        (GnosisSafeProxy safeProxy, SphinxModule module) = moduleFactory.deploySphinxModuleAndSafeProxy(
            safeProxyFactory,
            address(gnosisSafeSingleton),
            safeInitializerData,
            0,
            bytes32(0)
        );
        GnosisSafe safe = GnosisSafe(payable(address(safeProxy)));
        console.log(address(safeProxy).code.length);
        console.log(safe.isModuleEnabled(address(0x1111)));
        console.log(safe.isOwner(address(0x1000)));
    }
}
