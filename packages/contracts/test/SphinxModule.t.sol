// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.15;

// import "forge-std/Test.sol";
// import { SphinxModule } from "../contracts/SphinxModule.sol";
// import { GnosisSafeProxyFactory } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
// import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
// import { SimulateTxAccessor } from "@gnosis.pm/safe-contracts/accessors/SimulateTxAccessor.sol";
// import { DefaultCallbackHandler } from "@gnosis.pm/safe-contracts/handler/DefaultCallbackHandler.sol";
// import { CompatibilityFallbackHandler } from "@gnosis.pm/safe-contracts/handler/CompatibilityFallbackHandler.sol";
// import { CreateCall } from "@gnosis.pm/safe-contracts/libraries/CreateCall.sol";
// import { MultiSend } from "@gnosis.pm/safe-contracts/libraries/MultiSend.sol";
// import { MultiSendCallOnly } from "@gnosis.pm/safe-contracts/libraries/MultiSendCallOnly.sol";
// import { SignMessageLib } from "@gnosis.pm/safe-contracts/libraries/SignMessageLib.sol";
// import { GnosisSafeL2 } from "@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol";
// import { GnosisSafe } from "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";

// contract SphinxModule_Test is Test {
//     SphinxModule module;

//     function setUp() public {
//         SimulateTxAccessor simulateTxAccessor = new SimulateTxAccessor();
//         GnosisSafeProxyFactory safeFactory = new GnosisSafeProxyFactory();
//         // Deploy handlers
//         DefaultCallbackHandler defaultCallbackHandler = new DefaultCallbackHandler();
//         CompatibilityFallbackHandler compatibilityFallbackHandler = new CompatibilityFallbackHandler();
//         // Deploy libraries
//         CreateCall createCall = new CreateCall();
//         MultiSend multiSend = new MultiSend();
//         MultiSendCallOnly multiSendCallOnly = new MultiSendCallOnly();
//         SignMessageLib signMessageLib = new SignMessageLib();
//         // Deploy singletons
//         GnosisSafeL2 gnosisSafeL2 = new GnosisSafeL2();
//         GnosisSafe gnosisSafe = new GnosisSafe();

//         safeFactory.createProxyWithNonce()
//         module = new SphinxModule(address(safeProxy));
//     }

//     function test_TODO_success() external {

//     }
// }
