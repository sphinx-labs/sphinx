// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ISphinxGnosisSafeProxyFactory } from "./interfaces/ISphinxGnosisSafeProxyFactory.sol";
import { ISphinxModuleProxyFactory } from "./interfaces/ISphinxModuleProxyFactory.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
// Import contracts from Gnosis Safe v1.3.0, which we'll use as interfaces in this file. All of
// these contracts have the same interface as Gnosis Safe v1.4.1 for the functions used in this
// contract.
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
// TODO(end): rm
import { console2 as console } from "../forge-std/src/console2.sol";

contract SphinxGnosisSafeProxyFactory is ISphinxGnosisSafeProxyFactory {
    ISphinxModuleProxyFactory private immutable moduleProxyFactory;

    constructor(address _moduleProxyFactory) {
        moduleProxyFactory = ISphinxModuleProxyFactory(_moduleProxyFactory);
    }

    function deployGnosisSafeWithSphinxModule(
        bytes memory _safeInitCode, // TODO(docs): we pass in the bytecode so that it matches the
            // bytecode that would be deployed by Gnosis Safe's default proxy factory. if we deploy
            // them directly from this contract, their bytecode will differ because of different
            // compilation settings and metadata hashes. it may not be important to keep identical
            // bytecode, but we do it in case gnosis safe off-chain tooling requires it.
        bytes memory _safeInitializer,
        uint256 _saltNonce // TODO(docs): for simplicity, we use the same salt nonce to deploy the
            // gnosis safe proxy and the sphinx module proxy.
    )
        public
    {
        // Create the Gnosis Safe proxy's `CREATE2` salt. This salt ensures that the proxy's address
        // changes if its initializer data changes. The initializer data is hashed because it's
        // cheaper than concatenating it.
        bytes32 salt = keccak256(abi.encodePacked(keccak256(_safeInitializer), _saltNonce));

        // TODO(docs): we don't check that the sphinx module is deployed because it's not necessary.
        // (if the safe proxy hasn't been deployed, we know that the module proxy hasn't been
        // deployed either because...)

        address safeProxy = Create2.computeAddress(salt, keccak256(_safeInitCode));
        // TODO(docs): it's not strictly necessary to check this, but we do it anyways to provide a
        // useful error message if the safe proxy has already been deployed.
        require(safeProxy.code.length == 0, "TODO(docs)");

        Create2.deploy(0, salt, _safeInitCode);

        (bool success,) = safeProxy.call(_safeInitializer);
        require(success, "TODO(docs)");

        // Get the address of the Sphinx Module proxy that will be deployed.
        address moduleProxy = moduleProxyFactory.computeSphinxModuleProxyAddress(
            safeProxy, // TODO(later): `safeProxy` isn't defined yet
            safeProxy,
            _saltNonce
        );

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

// TODO(end): queue: grammarly in audit notion page. also, coverage. also, check for unnecessary
// imports.

// TODO(later-later): reconsider event parameters in `DeployedGnosisSafeWithSphinxModule`.

// TODO(later-later): check for parity with Safe v1.3.0 and v1.4.1.

// TODO(later-later): add the griefing vector as a test case.

// TODO(later): consider checking the inverse of the final require statements at the beginning of
// the function.

// TODO(later-later): push to a private branch

// TODO(later-later): validation

// TODO(later-later): consider removing every Merkle leaf field.

// TODO(later-later): problem: is it true that every time you release a new module version, the
// addresses of deployed gnosis safes will change?

// TODO(later-later): i think we need to be careful to ensure that a given gnosis safe only signs a
// single meta transaction with a given `merkleRootNonce`. e.g. if they sign two meta txns with a
// `merkleRootNonce === 0`, i think either one could be executed first, invalidating the other. this
// may be problematic in a couple situations:
// 1. the user signs a meta transaction, then needs to modify an aspect of their deployment.
// 2. if the private key of the executor gets leaked, do we need to change the address of the merkle
//    leaf's `executor` field? if so, we may need the user to sign a new meta txn. also, the initial
//    merkle root could be executed by anyone.

// TODO(later-later): i don't think the `SphinxModuleProxyFactory.sol:deploySphinxModuleProxy`
// function should return an address. it seems unnecessary. i'm not talking about the
// SphinxGnosisSafeProxyFactory.

// TODO(later): can we remove the `approve` leaf?
