// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { GnosisSafeProxyFactory } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
import { GnosisSafeTransaction } from "./SphinxPeripheryDataTypes.sol";

contract SphinxSimulator {

    address internal immutable SPHINX_SIMULATOR = address(this);

    GnosisSafeProxyFactory internal safeProxyFactory;

    address internal safeSingleton;

    constructor(address _safeProxyFactory, address _safeSingleton) {
        safeProxyFactory = GnosisSafeProxyFactory(_safeProxyFactory);
        safeSingleton = _safeSingleton;
    }

    function simulate(GnosisSafeTransaction[] memory _txns, GnosisSafe _safeProxy, bytes memory _safeInitializerData, uint256 _safeSaltNonce) external returns (bytes memory) {
        if (address(_safeProxy).code.length == 0) {
            safeProxyFactory.createProxyWithNonce(
                safeSingleton,
                _safeInitializerData,
                _safeSaltNonce
            );
            require(address(_safeProxy).code.length > 0, "TODO(docs)");
        }

        try _safeProxy.simulateAndRevert(SPHINX_SIMULATOR, abi.encodeWithSelector(SphinxSimulator.getMerkleLeafGasEstimates.selector, _txns, _safeProxy)) {
            // TODO(docs): should be impossible to reach this because the `simulateAndRevert` call
            // should always revert.
            revert('SphinxSimulator: simulation never reverted');
        } catch (bytes memory retdata) {
            return retdata;
        }
    }

    function getMerkleLeafGasEstimates(GnosisSafeTransaction[] memory _txns, GnosisSafe _safeProxy) external returns (uint256[] memory gasEstimates) {
        require(address(this) == address(_safeProxy), "TODO(docs): must be delegatecalled by safe proxy");

        _safeProxy.enableModule(address(this));

        gasEstimates = new uint256[](_txns.length);

        address to;
        uint256 value;
        bytes memory txData;
        Enum.Operation operation;
        for (uint256 i = 0; i < _txns.length; i++) {
            GnosisSafeTransaction memory txn = _txns[i];

            to = txn.to;
            value = txn.value;
            txData = txn.txData;
            operation = txn.operation;

            uint256 startGas = gasleft();
            bool success = GnosisSafe(_safeProxy).execTransactionFromModule(
                    to,
                    value,
                    txData,
                    operation
                );
            // TODO(docs): we put the buffers off-chain to make it easier to adjust them in the
            // future.
            gasEstimates[i] = startGas - gasleft();

            require(success, "SphinxSimulator: TODO(docs)");
        }
    }
}

// TODO(end): check that all error messages are prefixed with "SphinxSimulator: ".

// TODO(docs): this contract works with gnosis safe v1.3.0 and v1.4.1.

// TODO(later): check that this works for Safe v1.4.1 as well as the two L2 versions.
