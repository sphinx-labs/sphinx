// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { SphinxModule } from "./SphinxModule.sol";
import { GnosisSafeProxyFactory } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";


contract SphinxModuleFactory {

    event SphinxModuleAndSafeFactoryDeployed(
        SphinxModule indexed sphinxModule,
        GnosisSafeProxy indexed safeProxy,
        GnosisSafeProxyFactory safeProxyFactory
    );

    event SphinxModuleDeployed(
        SphinxModule indexed sphinxModule,
        address indexed safeProxy
    );

    function deploySphinxModuleAndSafeProxy(
        GnosisSafeProxyFactory _safeProxyFactory,
        address _safeSingleton,
        bytes memory _safeInitializer,
        uint256 _safeSaltNonce,
        bytes32 _sphinxModuleSalt
    ) external returns (GnosisSafeProxy safeProxy, SphinxModule sphinxModule) {
        safeProxy = _safeProxyFactory.createProxyWithNonce(
            _safeSingleton,
            _safeInitializer,
            _safeSaltNonce
        );
        sphinxModule = new SphinxModule{ salt: _sphinxModuleSalt }(address(safeProxy));
        require(address(sphinxModule) != address(0), "SphinxModuleFactory: deployment failed");
        emit SphinxModuleAndSafeFactoryDeployed(sphinxModule, safeProxy, _safeProxyFactory);
    }

    function deploySphinxModule(
        address _safeProxy,
        bytes32 _salt
    ) external returns (SphinxModule sphinxModule) {
        sphinxModule = new SphinxModule{ salt: _salt }(_safeProxy);
        require(address(sphinxModule) != address(0), "SphinxModuleFactory: deployment failed");
        emit SphinxModuleDeployed(sphinxModule, _safeProxy);
    }
}
