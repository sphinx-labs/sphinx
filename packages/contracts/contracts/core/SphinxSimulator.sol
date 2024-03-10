// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { GnosisSafeProxyFactory } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
import { console } from "../forge-std/src/console.sol";


// TODO(later-later): consider defining this elsewhere. you can't import @gnosis in any dependencies
// of Sphinx.sol or SphinxUtils.sol though.
// TODO(docs):
struct GnosisSafeTransaction {
    address to;
    uint256 value;
    bytes txData;
    Enum.Operation operation;
}

// TODO(later): probably move out of contracts/core.`
contract SphinxSimulator {

    GnosisSafeProxyFactory safeProxyFactory;
    address safeSingleton;

    constructor(address _safeProxyFactory, address _safeSingleton) {
        safeProxyFactory = GnosisSafeProxyFactory(_safeProxyFactory);
        safeSingleton = _safeSingleton;
    }

    function simulate(GnosisSafeTransaction[] memory _txns, GnosisSafe _safeProxy, bytes memory _safeInitializerData, uint256 _safeSaltNonce) external returns (uint256[] memory gasEstimates) {
        console.log('entered');
        if (address(_safeProxy).code.length == 0) {
            console.log('deploying safe proxy');
            console.log('safeProxyFactory', address(safeProxyFactory));
            console.log('safeProxyFactory code len', address(safeProxyFactory).code.length);
            console.log('safeSingleton', address(safeSingleton));
            console.log('safeSingleton code len', address(safeSingleton).code.length);
            console.log('initializer data');
            console.logBytes(_safeInitializerData);
            console.log('salt nonce', _safeSaltNonce);
            safeProxyFactory.createProxyWithNonce(
                safeSingleton,
                _safeInitializerData,
                _safeSaltNonce
            );
            console.log('deployed');
            require(address(_safeProxy).code.length > 0, "TODO(docs)");
            console.log('passed check');
        }

        for (uint256 i = 0; i < _txns.length; i++) {
            console.log('starting iteration');
            GnosisSafeTransaction memory txn = _txns[i];
            uint256 startGas = gasleft();
            bool success = _safeProxy.execTransactionFromModule(
                txn.to,
                txn.value,
                txn.txData,
                txn.operation
            );
            console.log('finished iteration');
            uint256 finalGas = gasleft();
            // TODO(later): consider not adjusting gas estimates on-chain. makes it easier to adjust
            // the buffers in the future.
            gasEstimates[i] = 60_000 + ((startGas - finalGas) * 11) / 10;

            require(success, "SphinxSimulator: Gnosis Safe call failed");
            console.log('passed iteration check');
        }
    }

    // TODO(later): rm
    fallback() external {
        console.log('fallback triggered');
    }
}
