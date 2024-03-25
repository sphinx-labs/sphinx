// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { GnosisSafeProxyFactory } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
import { GnosisSafeTransaction } from "./SphinxPeripheryDataTypes.sol";

// TODO: left off: we should add the SphinxSimulator as a module in the Gnosis Safe so that we can
// call `GnosisSafe(_safeProxy).execTransactionFromModule` directly. if we can do this, scan this
// contract for stuff that we can remove.


contract SphinxSimulator {

    event ExecutionFromModuleSuccess(address indexed module);
    event ExecutionFromModuleFailure(address indexed module);
    event SafeModuleTransaction(address module, address to, uint256 value, bytes data, Enum.Operation operation);

    address internal constant SENTINEL_MODULES = address(0x1);

    address internal immutable SPHINX_SIMULATOR = address(this);

    mapping(address => address) internal modules;

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
            bool success = execute(to, value, txData, operation, gasleft());
            // TODO(docs): we put the buffers off-chain to make it easier to adjust them in the
            // future.
            gasEstimates[i] = startGas - gasleft();

            require(success, "SphinxSimulator: TODO(docs)");
        }
    }

    function execTransactionFromModuleL1(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) public virtual returns (bool success) {
        require(msg.sender != SENTINEL_MODULES && modules[msg.sender] != address(0), "SphinxSimulator: TODO(docs)");
        // TODO(docs): Safe v1.4.1 uses `type(uint).max` instead of `gasleft()`. the former is 2
        // gas cheaper. We use `gasleft()` because it's 2 gas more expensive, and we want to
        // make sure that we're overestimating the gas (even though the difference is very
        // minor). we assume that the execution flow isn't impacted by choosing one or the other
        // because the behavior of `execTransactionFromModule` wasn't changed between v1.3.0 and
        // v1.4.1.
        success = execute(to, value, data, operation, gasleft());
        if (success) emit ExecutionFromModuleSuccess(msg.sender);
        else emit ExecutionFromModuleFailure(msg.sender);
    }

    // TODO:: call this conditionally
    function execTransactionFromModuleL2(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) public returns (bool success) {
        emit SafeModuleTransaction(msg.sender, to, value, data, operation);
        success = execTransactionFromModuleL1(to, value, data, operation);
    }

    function execute(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 txGas
    ) internal returns (bool success) {
        if (operation == Enum.Operation.DelegateCall) {
            assembly {
                success := delegatecall(txGas, to, add(data, 0x20), mload(data), 0, 0)
            }
        } else {
            assembly {
                success := call(txGas, to, value, add(data, 0x20), mload(data), 0, 0)
            }
        }
    }
}

// TODO(end): check that all error messages are prefixed with "SphinxSimulator: ".

// TODO(docs): this contract works with gnosis safe v1.3.0 and v1.4.1.

// TODO(later): check that this works for Safe v1.4.1 as well as the two L2 versions.
