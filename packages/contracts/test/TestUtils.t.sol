// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Vm } from "sphinx-forge-std/Vm.sol";
import { SphinxUtils } from "../contracts/foundry/SphinxUtils.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import {
    SphinxMerkleTree,
    SphinxTransaction,
    SphinxLeafWithProof
} from "../contracts/core/SphinxDataTypes.sol";
import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";

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
    )
        internal
        view
        returns (bytes memory)
    {
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

    function getMerkleTreeFFI(TODOStruct memory _todoStruct)
        public
        returns (SphinxMerkleTree memory)
    {
        string[] memory inputs = new string[](14);
        inputs[0] = "npx";
        inputs[1] = "ts-node";
        inputs[2] = "scripts/output-merkle-tree.ts";
        inputs[3] = vm.toString(_todoStruct.chainId);
        inputs[4] = vm.toString(_todoStruct.nonceInModule);
        inputs[5] = vm.toString(_todoStruct.executor);
        inputs[6] = vm.toString(_todoStruct.safeProxy);
        inputs[7] = vm.toString(address(_todoStruct.module));
        inputs[8] = _todoStruct.deploymentUri;
        inputs[9] = vm.toString(abi.encode(_todoStruct.txs));
        inputs[10] = vm.toString(_todoStruct.forceNumLeafsValue);
        inputs[11] = vm.toString(_todoStruct.overridingNumLeafsValue);
        inputs[12] = vm.toString(_todoStruct.forceApprovalLeafIndexNonZero);
        inputs[13] = "--swc"; // Speeds up ts-node considerably
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (SphinxMerkleTree));
    }

    // TODO: mv
    struct TODOStruct {
        SphinxTransaction[] txs;
        Wallet[] ownerWallets;
        uint256 chainId;
        SphinxModule module;
        uint256 nonceInModule;
        address executor;
        address safeProxy;
        string deploymentUri;
        bool forceNumLeafsValue;
        uint256 overridingNumLeafsValue;
        bool forceApprovalLeafIndexNonZero;
    }

    // TODO: mv
    struct TODOOutput {
        bytes32 merkleRoot;
        SphinxLeafWithProof approvalLeafWithProof;
        SphinxLeafWithProof[] executionLeafsWithProofs;
        bytes ownerSignatures;
    }

    function getTODOOutput(TODOStruct memory _todoStruct) internal returns (TODOOutput memory) {
        SphinxMerkleTree memory tree = getMerkleTreeFFI(_todoStruct);

        bytes32 merkleRoot = tree.root;
        SphinxLeafWithProof memory approvalLeafWithProof = tree.leafs[0];
        SphinxLeafWithProof[] memory executionLeafsWithProofs =
            new SphinxLeafWithProof[](tree.leafs.length - 1);
        for (uint256 i = 1; i < tree.leafs.length; i++) {
            executionLeafsWithProofs[i - 1] = tree.leafs[i];
        }
        bytes memory ownerSignatures = getOwnerSignatures(_todoStruct.ownerWallets, tree.root);
        return
            TODOOutput(merkleRoot, approvalLeafWithProof, executionLeafsWithProofs, ownerSignatures);
    }

    // TODO(docs)
    function sphinxMerkleTreeType() external returns (SphinxMerkleTree memory) { }
    function sphinxTransactionArrayType() external returns (SphinxTransaction[] memory) { }
}
