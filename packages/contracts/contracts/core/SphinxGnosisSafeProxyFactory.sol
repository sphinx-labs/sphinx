// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ISphinxGnosisSafeProxyFactory } from "./interfaces/ISphinxGnosisSafeProxyFactory.sol";
import { ISphinxModuleProxyFactory } from "./interfaces/ISphinxModuleProxyFactory.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
// Import contracts from Gnosis Safe v1.3.0, which we'll use as interfaces in this file. All of
// these contracts have the same interface as Gnosis Safe v1.4.1 for the functions used in this
// contract.
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";

contract SphinxGnosisSafeProxyFactory is ISphinxGnosisSafeProxyFactory {
    ISphinxModuleProxyFactory private immutable moduleProxyFactory;

    constructor(address _moduleProxyFactory) {
        moduleProxyFactory = ISphinxModuleProxyFactory(_moduleProxyFactory);
    }

    function deployThenEnable(
        bytes memory _initCode, // TODO(docs): we pass in the bytecode so that it matches the
            // bytecode that would be deployed by Gnosis Safe's default proxy factory. if we deploy
            // the proxy directly from this contract, its bytecode will differ because of different
            // compilation settings and metadata hashes. it may not be important to keep identical
            // bytecode, but we do it in case gnosis safe off-chain tooling requires it.
        bytes memory _initializer,
        uint256 _saltNonce // TODO(docs): for simplicity, we use the same salt nonce to deploy the
            // gnosis safe proxy and the sphinx module proxy.
    )
        public
    {
        // Create the Gnosis Safe proxy's `CREATE2` salt. This salt ensures that the proxy's address
        // changes if its initializer data changes. The initializer data is hashed because it's
        // cheaper than concatenating it.
        bytes32 salt = keccak256(abi.encodePacked(keccak256(_initializer), _saltNonce));

        // TODO(later): we can't do Create2.computeAddress
        address safeProxy = Create2.computeAddress(salt, keccak256(_initCode));
        address moduleProxy = moduleProxyFactory.computeSphinxModuleProxyAddress(
            safeProxy,
            safeProxy,
            _saltNonce
        );

        // TODO(docs): it's not strictly necessary to check this, but we do it anyways to provide a
        // useful error message if they've already been deployed.
        require(moduleProxy.code.length == 0, "SphinxGnosisSafeProxyFactory: module already deployed");
        require(safeProxy.code.length == 0, "SphinxGnosisSafeProxyFactory: safe already deployed");

        Create2.deploy(0, salt, _initCode);

        (bool success,) = safeProxy.call(_initializer);
        require(success, "SphinxGnosisSafeProxyFactory: initializer failed");

        // Check that the Sphinx Module proxy is deployed and that it's enabled in the Gnosis Safe
        // proxy. We don't need to check that the Gnosis Safe proxy is deployed because we deployed
        // it via `CREATE2` above, which must have succeeded if we were able to make it to this
        // point.
        require(
            moduleProxy.code.length > 0, "SphinxGnosisSafeProxyFactory: module proxy not deployed"
        );
        require(
            GnosisSafe(payable(safeProxy)).isModuleEnabled(moduleProxy),
            "SphinxGnosisSafeProxyFactory: module proxy not enabled"
        );

        emit DeployedGnosisSafeWithSphinxModule(safeProxy, moduleProxy, _saltNonce);
    }
}

// TODO(later-later): Test:
// - Add the griefing vector as a test case.

// TODO(later): zkSync
