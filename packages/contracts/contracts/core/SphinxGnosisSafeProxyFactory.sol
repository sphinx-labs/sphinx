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
    function deployGnosisSafeWithSphinxModule(
        bytes memory _safeInitCode,
        bytes memory _safeInitializer,
        uint256 _saltNonce, // TODO(docs): for simplicity, we use the same salt nonce to deploy the gnosis safe proxy and the sphinx module proxy.
        address _moduleProxy
    ) public returns (address safeProxy) {
        // Create the Gnosis Safe proxy's `CREATE2` salt. This salt ensures that the proxy's address
        // changes if its initializer data changes. This salt is created in the exact same manner as
        // the salt created in the Gnosis Safe Proxy Factory contract. The initializer data
        // is hashed because it's cheaper than concatenating it.
        bytes32 salt = keccak256(abi.encodePacked(keccak256(_safeInitializer), _saltNonce));

        safeProxy = Create2.deploy(0, salt, _safeInitCode);

        (bool success, ) = safeProxy.call(_safeInitializer);
        require(success, "TODO(docs)");

        // Check that the Sphinx Module proxy is deployed and that it's enabled in the Gnosis Safe
        // proxy. We don't need to check that the Gnosis Safe proxy is deployed because we deployed
        // it via `CREATE2` above, which must have succeeded if we were able to make it to this
        // point.
        require(
            _moduleProxy.code.length > 0,
            "SphinxGnosisSafeProxyFactory: module proxy not deployed"
        );
        require(
            GnosisSafe(payable(safeProxy)).isModuleEnabled(_moduleProxy),
            "SphinxGnosisSafeProxyFactory: module proxy not enabled"
        );

        emit DeployedGnosisSafeWithSphinxModule(
            safeProxy,
            _moduleProxy,
            _saltNonce
        );
    }
}

// TODO(end): queue: grammarly in audit notion page. also, coverage. also, check for unnecessary
// imports.

// TODO(later-later): test: supposedly the safeSingleton checks that the owners and threshold are
// valid. also, Safe v1.4.1 uses `isContract` to prevent a proxy being deployed uninitialized.
// should we add logic for this, or is it not necessary? you should test this by checking what
// happens when the singleton isn't deployed.

// TODO(later-later): check for parity with Safe v1.3.0 and v1.4.1.

// TODO(later-later): add the griefing vector as a test case.

// TODO(later): consider checking the inverse of the final require statements at the beginning of
// the function.
