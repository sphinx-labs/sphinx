// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { SphinxModuleProxyFactory } from "../contracts/core/SphinxModuleProxyFactory.sol";
import { SphinxGnosisSafeProxyFactory } from "../contracts/core/SphinxGnosisSafeProxyFactory.sol";
import { TestUtils } from "./TestUtils.t.sol";
import {
    GnosisSafeProxy as GnosisSafeProxy_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";

contract SphinxGnosisSafeProxyFactory_Test is TestUtils {

    SphinxModuleProxyFactory moduleProxyFactory = new SphinxModuleProxyFactory();
    address[] owners = [address(0x1111), address(0x2222), address(0x3333)];
    uint256 threshold = 2;

    function test_TODO() external {
        uint256 saltNonce = 0;

        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        // TODO(later): why do we need to do uint256(...)?
        bytes memory safeInitCode = abi.encodePacked(type(GnosisSafeProxy_1_3_0).creationCode, uint256(uint160(address(safeContracts.safeL1Singleton))));

        bytes memory safeInitializerData = makeGnosisSafeInitializerData({
            _moduleProxyFactory: moduleProxyFactory,
            _saltNonce: saltNonce,
            _owners: owners,
            _threshold: threshold,
            _multiSend: address(safeContracts.multiSend),
            _fallbackHandler: address(safeContracts.compatibilityFallbackHandler)
        });

        SphinxGnosisSafeProxyFactory safeProxyFactory = new SphinxGnosisSafeProxyFactory();
        safeProxyFactory.deployGnosisSafeWithSphinxModule({
            _safeInitCode: safeInitCode,
            _safeInitializer: safeInitializerData,
            _saltNonce: saltNonce,
            _moduleProxyFactory: address(moduleProxyFactory)
        });
    }

    // TODO(docs): singleton isn't deployed
    
}

// TODO(later): check the SphinxMOduleProxyFactory.t.sol file.
