// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Vm } from "sphinx-forge-std/Vm.sol";
import { SphinxUtils } from "../contracts/foundry/SphinxUtils.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxLeafWithProof } from "../contracts/core/SphinxDataTypes.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
// Gnosis Safe v1.3.0
import {
    GnosisSafeProxyFactory as GnosisSafeProxyFactory_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import {
    GnosisSafeProxy as GnosisSafeProxy_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";
import {
    SimulateTxAccessor as SimulateTxAccessor_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/accessors/SimulateTxAccessor.sol";
import {
    DefaultCallbackHandler as DefaultCallbackHandler_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/handler/DefaultCallbackHandler.sol";
import {
    CompatibilityFallbackHandler as CompatibilityFallbackHandler_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/handler/CompatibilityFallbackHandler.sol";
import {
    CreateCall as CreateCall_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/libraries/CreateCall.sol";
import {
    MultiSend as MultiSend_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/libraries/MultiSend.sol";
import {
    MultiSendCallOnly as MultiSendCallOnly_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/libraries/MultiSendCallOnly.sol";
import {
    SignMessageLib as SignMessageLib_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/libraries/SignMessageLib.sol";
import {
    GnosisSafeL2 as GnosisSafeL2_1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafeL2.sol";
import { GnosisSafe as GnosisSafe_1_3_0 } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
// Gnosis Safe v1.4.1
import {
    SimulateTxAccessor as SimulateTxAccessor_1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/accessors/SimulateTxAccessor.sol";
import {
    SafeProxyFactory as SafeProxyFactory_1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/proxies/SafeProxyFactory.sol";
import {
    TokenCallbackHandler as TokenCallbackHandler_1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/handler/TokenCallbackHandler.sol";
import {
    CompatibilityFallbackHandler as CompatibilityFallbackHandler_1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/handler/CompatibilityFallbackHandler.sol";
import {
    CreateCall as CreateCall_1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/libraries/CreateCall.sol";
import {
    MultiSend as MultiSend_1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/libraries/MultiSend.sol";
import {
    MultiSendCallOnly as MultiSendCallOnly_1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/libraries/MultiSendCallOnly.sol";
import {
    SignMessageLib as SignMessageLib_1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/libraries/SignMessageLib.sol";
import { SafeL2 as SafeL2_1_4_1 } from "@gnosis.pm/safe-contracts-1.4.1/SafeL2.sol";
import { Safe as Safe_1_4_1 } from "@gnosis.pm/safe-contracts-1.4.1/Safe.sol";

contract TestUtils is SphinxUtils, Enum {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct GnosisSafeContracts_1_3_0 {
        SimulateTxAccessor_1_3_0 simulateTxAccessor;
        GnosisSafeProxyFactory_1_3_0 safeProxyFactory;
        DefaultCallbackHandler_1_3_0 defaultCallbackHandler;
        CompatibilityFallbackHandler_1_3_0 compatibilityFallbackHandler;
        CreateCall_1_3_0 createCall;
        MultiSend_1_3_0 multiSend;
        MultiSendCallOnly_1_3_0 multiSendCallOnly;
        SignMessageLib_1_3_0 signMessageLib;
        GnosisSafeL2_1_3_0 safeL2Singleton;
        GnosisSafe_1_3_0 safeL1Singleton;
    }

    struct GnosisSafeContracts_1_4_1 {
        SimulateTxAccessor_1_4_1 simulateTxAccessor;
        SafeProxyFactory_1_4_1 safeProxyFactory;
        TokenCallbackHandler_1_4_1 tokenCallbackHandler;
        CompatibilityFallbackHandler_1_4_1 compatibilityFallbackHandler;
        CreateCall_1_4_1 createCall;
        MultiSend_1_4_1 multiSend;
        MultiSendCallOnly_1_4_1 multiSendCallOnly;
        SignMessageLib_1_4_1 signMessageLib;
        SafeL2_1_4_1 safeL2Singleton;
        Safe_1_4_1 safeL1Singleton;
    }

    struct GnosisSafeTransaction {
        address to;
        uint256 value;
        bytes txData;
        Enum.Operation operation;
        uint256 safeTxGas;
    }

    struct SphinxTransaction {
        address to;
        uint256 value;
        bytes txData;
        Enum.Operation operation;
        uint256 gas;
        bool requireSuccess;
    }

    struct SphinxMerkleTree {
        bytes32 root;
        SphinxLeafWithProof[] leaves;
    }

    // TODO(docs): wallets must be sorted in ascending order according to their addresses.
    function signSafeTransaction(
        Wallet[] memory _ownerWallets,
        GnosisSafe_1_3_0 _safe,
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

    function getDeploymentMerkleTreeFFI(
        DeploymentMerkleTreeInputs memory _treeInputs
    ) public returns (SphinxMerkleTree memory) {
        string[] memory inputs = new string[](17);
        inputs[0] = "npx";
        inputs[1] = "ts-node";
        inputs[2] = "scripts/output-deployment-merkle-tree.ts";
        inputs[3] = vm.toString(_treeInputs.chainId);
        inputs[4] = vm.toString(_treeInputs.nonceInModuleProxy);
        inputs[5] = vm.toString(_treeInputs.executor);
        inputs[6] = vm.toString(_treeInputs.safeProxy);
        inputs[7] = vm.toString(address(_treeInputs.moduleProxy));
        inputs[8] = _treeInputs.deploymentUri;
        inputs[9] = vm.toString(abi.encode(_treeInputs.txs));
        inputs[10] = vm.toString(_treeInputs.arbitraryChain);
        inputs[11] = vm.toString(_treeInputs.forceNumLeavesValue);
        inputs[12] = vm.toString(_treeInputs.overridingNumLeavesValue);
        inputs[13] = vm.toString(_treeInputs.forceApprovalLeafIndexNonZero);
        inputs[14] = vm.toString(_treeInputs.forceExecutionLeavesChainIdNonZero);
        inputs[15] = vm.toString(_treeInputs.forceApprovalLeafChainIdNonZero);
        inputs[16] = "--swc"; // Speeds up ts-node considerably
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (SphinxMerkleTree));
    }

    function getCancellationMerkleTreeFFI(
        CancellationMerkleTreeInputs memory _treeInputs
    ) public returns (SphinxMerkleTree memory) {
        string[] memory inputs = new string[](12);
        inputs[0] = "npx";
        inputs[1] = "ts-node";
        inputs[2] = "scripts/output-cancellation-merkle-tree.ts";
        inputs[3] = vm.toString(_treeInputs.chainId);
        inputs[4] = vm.toString(_treeInputs.nonceInModuleProxy);
        inputs[5] = vm.toString(_treeInputs.executor);
        inputs[6] = vm.toString(_treeInputs.safeProxy);
        inputs[7] = vm.toString(address(_treeInputs.moduleProxy));
        inputs[8] = _treeInputs.uri;
        inputs[9] = vm.toString(abi.encode(_treeInputs.merkleRootToCancel));
        inputs[10] = vm.toString(_treeInputs.forceCancellationLeafIndexNonZero);
        inputs[11] = "--swc"; // Speeds up ts-node considerably
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (SphinxMerkleTree));
    }

    // TODO: mv
    struct CancellationMerkleTreeInputs {
        Wallet[] ownerWallets;
        uint256 chainId;
        SphinxModule moduleProxy;
        uint256 nonceInModuleProxy;
        bytes32 merkleRootToCancel;
        address executor;
        address safeProxy;
        string uri;
        bool forceCancellationLeafIndexNonZero;
    }

    // TODO: mv
    struct DeploymentMerkleTreeInputs {
        SphinxTransaction[] txs;
        Wallet[] ownerWallets;
        uint256 chainId;
        SphinxModule moduleProxy;
        uint256 nonceInModuleProxy;
        address executor;
        address safeProxy;
        string deploymentUri;
        bool arbitraryChain;
        bool forceNumLeavesValue;
        uint256 overridingNumLeavesValue;
        bool forceApprovalLeafIndexNonZero;
        bool forceExecutionLeavesChainIdNonZero;
        bool forceApprovalLeafChainIdNonZero;
    }

    // TODO: mv
    struct CancellationModuleInputs {
        bytes32 merkleRoot;
        SphinxLeafWithProof cancellationLeafWithProof;
        bytes ownerSignatures;
    }

    // TODO: mv
    struct DeploymentModuleInputs {
        bytes32 merkleRoot;
        SphinxLeafWithProof approvalLeafWithProof;
        SphinxLeafWithProof[] executionLeavesWithProofs;
        bytes ownerSignatures;
    }

    function getDeploymentModuleInputs(
        DeploymentMerkleTreeInputs memory _treeInputs
    ) internal returns (DeploymentModuleInputs memory) {
        SphinxMerkleTree memory tree = getDeploymentMerkleTreeFFI(_treeInputs);

        bytes32 merkleRoot = tree.root;
        SphinxLeafWithProof memory approvalLeafWithProof = tree.leaves[0];
        SphinxLeafWithProof[] memory executionLeavesWithProofs = new SphinxLeafWithProof[](
            tree.leaves.length - 1
        );
        for (uint256 i = 1; i < tree.leaves.length; i++) {
            executionLeavesWithProofs[i - 1] = tree.leaves[i];
        }
        bytes memory ownerSignatures = getOwnerSignatures(_treeInputs.ownerWallets, tree.root);
        return
            DeploymentModuleInputs(
                merkleRoot,
                approvalLeafWithProof,
                executionLeavesWithProofs,
                ownerSignatures
            );
    }

    function getCancellationModuleInputs(
        CancellationMerkleTreeInputs memory _treeInputs
    ) internal returns (CancellationModuleInputs memory) {
        SphinxMerkleTree memory tree = getCancellationMerkleTreeFFI(_treeInputs);

        bytes32 merkleRoot = tree.root;
        SphinxLeafWithProof memory cancellationLeafWithProof = tree.leaves[0];
        bytes memory ownerSignatures = getOwnerSignatures(_treeInputs.ownerWallets, tree.root);
        return CancellationModuleInputs(merkleRoot, cancellationLeafWithProof, ownerSignatures);
    }

    function deployGnosisSafeContracts_1_3_0() public returns (GnosisSafeContracts_1_3_0 memory) {
        return
            GnosisSafeContracts_1_3_0({
                simulateTxAccessor: new SimulateTxAccessor_1_3_0(),
                safeProxyFactory: new GnosisSafeProxyFactory_1_3_0(),
                // Deploy handlers
                defaultCallbackHandler: new DefaultCallbackHandler_1_3_0(),
                compatibilityFallbackHandler: new CompatibilityFallbackHandler_1_3_0(),
                // Deploy libraries
                createCall: new CreateCall_1_3_0(),
                multiSend: new MultiSend_1_3_0(),
                multiSendCallOnly: new MultiSendCallOnly_1_3_0(),
                signMessageLib: new SignMessageLib_1_3_0(),
                // Deploy singletons
                safeL2Singleton: new GnosisSafeL2_1_3_0(),
                safeL1Singleton: new GnosisSafe_1_3_0()
            });
    }

    function deployGnosisSafeContracts_1_4_1() public returns (GnosisSafeContracts_1_4_1 memory) {
        return
            GnosisSafeContracts_1_4_1({
                simulateTxAccessor: new SimulateTxAccessor_1_4_1(),
                safeProxyFactory: new SafeProxyFactory_1_4_1(),
                // Deploy handlers
                tokenCallbackHandler: new TokenCallbackHandler_1_4_1(),
                compatibilityFallbackHandler: new CompatibilityFallbackHandler_1_4_1(),
                // Deploy libraries
                createCall: new CreateCall_1_4_1(),
                multiSend: new MultiSend_1_4_1(),
                multiSendCallOnly: new MultiSendCallOnly_1_4_1(),
                signMessageLib: new SignMessageLib_1_4_1(),
                // Deploy singletons
                safeL2Singleton: new SafeL2_1_4_1(),
                safeL1Singleton: new Safe_1_4_1()
            });
    }

    // TODO(docs)
    function sphinxMerkleTreeType() external returns (SphinxMerkleTree memory) {}

    function sphinxTransactionArrayType() external returns (SphinxTransaction[] memory) {}
}
