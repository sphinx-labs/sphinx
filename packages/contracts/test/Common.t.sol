// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { GnosisSafeProxyFactory } from
    "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
import { SimulateTxAccessor } from "@gnosis.pm/safe-contracts/accessors/SimulateTxAccessor.sol";
import { DefaultCallbackHandler } from
    "@gnosis.pm/safe-contracts/handler/DefaultCallbackHandler.sol";
import { CompatibilityFallbackHandler } from
    "@gnosis.pm/safe-contracts/handler/CompatibilityFallbackHandler.sol";
import { CreateCall } from "@gnosis.pm/safe-contracts/libraries/CreateCall.sol";
import { MultiSend } from "@gnosis.pm/safe-contracts/libraries/MultiSend.sol";
import { MultiSendCallOnly } from "@gnosis.pm/safe-contracts/libraries/MultiSendCallOnly.sol";
import { GnosisSafeL2 } from "@gnosis.pm/safe-contracts/GnosisSafeL2.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";

contract Common {
    struct GnosisSafeContracts {
        SimulateTxAccessor simulateTxAccessor;
        GnosisSafeProxyFactory safeProxyFactory;
        DefaultCallbackHandler defaultCallbackHandler;
        CompatibilityFallbackHandler compatibilityFallbackHandler;
        CreateCall createCall;
        MultiSend multiSend;
        MultiSendCallOnly multiSendCallOnly;
        GnosisSafeL2 gnosisSafeL2Singleton;
        GnosisSafe gnosisSafeSingleton;
    }

    GnosisSafeContracts internal gnosisSafeContracts;

    function setUp() public virtual {
        // Deploy all Gnosis Safe contracts
        gnosisSafeContracts.simulateTxAccessor = new SimulateTxAccessor();
        gnosisSafeContracts.safeProxyFactory = new GnosisSafeProxyFactory();
        // Deploy Gnosis Safe handlers
        gnosisSafeContracts.defaultCallbackHandler = new DefaultCallbackHandler();
        gnosisSafeContracts.compatibilityFallbackHandler = new CompatibilityFallbackHandler();
        // Deploy Gnosis Safe libraries
        gnosisSafeContracts.createCall = new CreateCall();
        gnosisSafeContracts.multiSend = new MultiSend();
        gnosisSafeContracts.multiSendCallOnly = new MultiSendCallOnly();
        // Deploy Gnosis Safe singletons
        gnosisSafeContracts.gnosisSafeL2Singleton = new GnosisSafeL2();
        gnosisSafeContracts.gnosisSafeSingleton = new GnosisSafe();
    }
}
