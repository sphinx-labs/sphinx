// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Vm} from "sphinx-forge-std/Vm.sol";
import {SphinxUtils} from "../contracts/foundry/SphinxUtils.sol";
import {Wallet} from "../contracts/foundry/SphinxPluginTypes.sol";
import {Enum} from "@gnosis.pm/safe-contracts/common/Enum.sol";
import {GnosisSafe} from "@gnosis.pm/safe-contracts/GnosisSafe.sol";

contract TestUtils is SphinxUtils, Enum {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct GnosisSafeTransaction {
        address to;
        uint256 value;
        bytes txData;
        Enum.Operation operation;
        uint256 safeTxGas;
    }

    // TODO(docs): wallets must be sorted in ascending order according to their addresses.
    function signSafeTransaction(
        Wallet[] memory _ownerWallets,
        GnosisSafe _safe,
        GnosisSafeTransaction memory _gnosisSafeTxn
    ) internal view returns (bytes memory) {
        bytes[] memory signatures = new bytes[](_ownerWallets.length);
        for (uint256 i = 0; i < _ownerWallets.length; i++) {
            uint256 nonce = _safe.nonce();
            bytes32 txHash = _safe.getTransactionHash({
                to: _gnosisSafeTxn.to,
                value: _gnosisSafeTxn.value,
                data: _gnosisSafeTxn.txData,
                operation: _gnosisSafeTxn.operation,
                safeTxGas: _gnosisSafeTxn.safeTxGas,
                _nonce: nonce,
                // The following fields are for refunding the caller. We don't use them.
                baseGas: 0,
                gasPrice: 0,
                gasToken: address(0),
                refundReceiver: address(0)
            });
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(_ownerWallets[i].privateKey, txHash);
            signatures[i] = abi.encodePacked(r, s, v);
        }

        return packBytes(signatures);
    }
}
