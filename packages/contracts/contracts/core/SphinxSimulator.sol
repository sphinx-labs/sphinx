// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { GnosisSafeProxyFactory } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";

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

    // TODO(later-later): maybe these should be input parameters to the function?
    constructor(address _safeProxyFactory, address _safeSingleton) {
        safeProxyFactory = GnosisSafeProxyFactory(_safeProxyFactory);
        safeSingleton = _safeSingleton;
    }

    function simulate1(GnosisSafeTransaction[] memory _txns, GnosisSafe _safeProxy, bytes memory _safeInitializerData, uint256 _safeSaltNonce) external returns (bytes memory) {
        if (address(_safeProxy).code.length == 0) {
            safeProxyFactory.createProxyWithNonce(
                safeSingleton,
                _safeInitializerData,
                _safeSaltNonce
            );
            require(address(_safeProxy).code.length > 0, "TODO(docs)");
        }

        // TODO(later-later): address(this) -> constant var.
        try _safeProxy.simulateAndRevert(address(this), abi.encodeWithSelector(SphinxSimulator.simulate2.selector, _txns, _safeProxy)) {
            // TODO(later-later): what should we do here? it should be impossible to reach this.
        } catch (bytes memory retdata) {
            return retdata;
        }
    }

    function simulate2(GnosisSafeTransaction[] memory _txns, GnosisSafe _safeProxy) external returns (uint256[] memory gasEstimates) {
        require(address(this) == address(_safeProxy), "TODO(docs): must be delegatecalled by safe proxy");

        gasEstimates = new uint256[](_txns.length);
        for (uint256 i = 0; i < _txns.length; i++) {
            GnosisSafeTransaction memory txn = _txns[i];
            uint256 startGas = gasleft();
            bool success = execute(txn.to, txn.value, txn.txData, txn.operation, gasleft());
            uint256 finalGas = gasleft();
            // TODO(later-later): consider not adjusting gas estimates on-chain. makes it easier to adjust
            // the buffers in the future.
            gasEstimates[i] = 60_000 + ((startGas - finalGas) * 11) / 10;

            require(success, "SphinxSimulator: Gnosis Safe call failed");
        }
    }

    function execute(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 txGas
    ) internal returns (bool success) {
        if (operation == Enum.Operation.DelegateCall) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                success := delegatecall(txGas, to, add(data, 0x20), mload(data), 0, 0)
            }
        } else {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                success := call(txGas, to, value, add(data, 0x20), mload(data), 0, 0)
            }
        }
    }
}

// TODO(later-later): do you need logic specific to the Safe L2 contracts?

// TODO(later-later): do you need logic specific to the Safe v1.4.1 L1 contract?

// TODO(later-later): check that this works for Safe v1.4.1 as well as the two L2 versions.
