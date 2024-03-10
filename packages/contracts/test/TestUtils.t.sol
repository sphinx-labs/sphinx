// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../contracts/forge-std/src/Test.sol";
import { Vm } from "../contracts/forge-std/src/Vm.sol";
import { StdCheats } from "../contracts/forge-std/src/StdCheats.sol";
import { SphinxUtils } from "../contracts/foundry/SphinxUtils.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxLeafWithProof, SphinxLeafType } from "../contracts/core/SphinxDataTypes.sol";
import { IEnum } from "../contracts/foundry/interfaces/IEnum.sol";
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

struct SphinxTransaction {
    address to;
    uint256 value;
    bytes txData;
    IEnum.GnosisSafeOperation operation;
    uint256 gas;
    bool requireSuccess;
}

contract TestUtils is SphinxUtils, IEnum, Test {
    // These are constants thare are used when signing an EIP-712 meta transaction.
    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256(bytes("Sphinx")),
                keccak256(bytes("1.0.0"))
            )
        );
    bytes32 private constant TYPE_HASH = keccak256("MerkleRoot(bytes32 root)");

    enum GnosisSafeVersion {
        NONE,
        L1_1_3_0,
        L2_1_3_0,
        L1_1_4_1,
        L2_1_4_1
    }

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
        IEnum.GnosisSafeOperation operation;
        uint256 safeTxGas;
    }

    struct SphinxMerkleTree {
        bytes32 root;
        SphinxLeafWithProof[] leaves;
    }

    struct NetworkCancellationMerkleTreeInputs {
        uint256 chainId;
        bytes32 merkleRootToCancel;
        uint256 moduleProxyNonce;
    }

    /**
     * @notice The addresses of several Gnosis Safe contracts that'll be used in this
     *         test suite.
     */
    struct GnosisSafeAddresses {
        address multiSend;
        address multiSendCallOnly;
        address compatibilityFallbackHandler;
        address safeProxyFactory;
        address safeSingleton;
        address createCall;
    }

    struct MultiChainCancellationMerkleTreeInputs {
        NetworkCancellationMerkleTreeInputs[] networks;
        Wallet[] ownerWallets;
        SphinxModule moduleProxy;
        address executor;
        address safeProxy;
        string uri;
        bool forceCancellationLeafIndexNonZero;
    }

    struct CancellationMerkleTreeInputs {
        uint256 chainId;
        bytes32 merkleRootToCancel;
        uint256 moduleProxyNonce;
        Wallet[] ownerWallets;
        SphinxModule moduleProxy;
        address executor;
        address safeProxy;
        string uri;
        bool forceCancellationLeafIndexNonZero;
    }

    struct NetworkDeploymentMerkleTreeInputs {
        uint256 chainId;
        SphinxTransaction[] txs;
        uint256 moduleProxyNonce;
    }

    struct DeploymentMerkleTreeInputs {
        uint256 chainId;
        SphinxTransaction[] txs;
        uint256 moduleProxyNonce;
        Wallet[] ownerWallets;
        SphinxModule moduleProxy;
        address executor;
        address safeProxy;
        string uri;
        bool arbitraryChain;
        bool forceNumLeavesValue;
        uint256 overridingNumLeavesValue;
        bool forceApprovalLeafIndexNonZero;
        bool forceExecutionLeavesChainIdNonZero;
        bool forceApprovalLeafChainIdNonZero;
    }

    struct MultiChainDeploymentMerkleTreeInputs {
        NetworkDeploymentMerkleTreeInputs[] networks;
        Wallet[] ownerWallets;
        SphinxModule moduleProxy;
        address executor;
        address safeProxy;
        string uri;
        bool arbitraryChain;
        bool forceNumLeavesValue;
        uint256 overridingNumLeavesValue;
        bool forceApprovalLeafIndexNonZero;
        bool forceExecutionLeavesChainIdNonZero;
        bool forceApprovalLeafChainIdNonZero;
    }

    struct CancellationModuleInputs {
        bytes32 merkleRoot;
        SphinxLeafWithProof cancellationLeafWithProof;
        bytes ownerSignatures;
    }

    struct DeploymentModuleInputs {
        bytes32 merkleRoot;
        SphinxLeafWithProof approvalLeafWithProof;
        SphinxLeafWithProof[] executionLeavesWithProofs;
        bytes ownerSignatures;
    }

    /**
     * @param _ownerWallets An array of `Wallet` structs for the Gnosis Safe owners. These
     *                      must be sorted in ascending order according to the addresses of the
     *                      owners.
     */
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
                operation: Enum.Operation(uint8(_gnosisSafeTxn.operation)),
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

    function packBytes(bytes[] memory arr) public pure returns (bytes memory) {
        bytes memory output;

        for (uint256 i = 0; i < arr.length; i++) {
            output = abi.encodePacked(output, arr[i]);
        }

        return output;
    }

    function getDeploymentMerkleTreeFFI(
        MultiChainDeploymentMerkleTreeInputs memory _treeInputs
    ) public returns (SphinxMerkleTree memory) {
        string[] memory inputs = new string[](15);
        inputs[0] = "npx";
        inputs[1] = "ts-node";
        inputs[2] = "scripts/output-deployment-merkle-tree.ts";
        inputs[3] = vm.toString(abi.encode(_treeInputs.networks));
        inputs[4] = vm.toString(_treeInputs.executor);
        inputs[5] = vm.toString(_treeInputs.safeProxy);
        inputs[6] = vm.toString(address(_treeInputs.moduleProxy));
        inputs[7] = _treeInputs.uri;
        inputs[8] = vm.toString(_treeInputs.arbitraryChain);
        inputs[9] = vm.toString(_treeInputs.forceNumLeavesValue);
        inputs[10] = vm.toString(_treeInputs.overridingNumLeavesValue);
        inputs[11] = vm.toString(_treeInputs.forceApprovalLeafIndexNonZero);
        inputs[12] = vm.toString(_treeInputs.forceExecutionLeavesChainIdNonZero);
        inputs[13] = vm.toString(_treeInputs.forceApprovalLeafChainIdNonZero);
        inputs[14] = "--swc"; // Speeds up ts-node considerably

        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (SphinxMerkleTree));
    }

    function getCancellationMerkleTreeFFI(
        MultiChainCancellationMerkleTreeInputs memory _treeInputs
    ) public returns (SphinxMerkleTree memory) {
        string[] memory inputs = new string[](10);
        inputs[0] = "npx";
        inputs[1] = "ts-node";
        inputs[2] = "scripts/output-cancellation-merkle-tree.ts";
        inputs[3] = vm.toString(abi.encode(_treeInputs.networks));
        inputs[4] = vm.toString(_treeInputs.executor);
        inputs[5] = vm.toString(_treeInputs.safeProxy);
        inputs[6] = vm.toString(address(_treeInputs.moduleProxy));
        inputs[7] = _treeInputs.uri;
        inputs[8] = vm.toString(_treeInputs.forceCancellationLeafIndexNonZero);
        inputs[9] = "--swc"; // Speeds up ts-node considerably

        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (SphinxMerkleTree));
    }

    function getDeploymentModuleInputs(
        DeploymentMerkleTreeInputs memory _treeInputs
    ) internal returns (DeploymentModuleInputs memory) {
        NetworkDeploymentMerkleTreeInputs[]
            memory networkArray = new NetworkDeploymentMerkleTreeInputs[](1);
        networkArray[0] = NetworkDeploymentMerkleTreeInputs({
            chainId: _treeInputs.chainId,
            txs: _treeInputs.txs,
            moduleProxyNonce: _treeInputs.moduleProxyNonce
        });

        MultiChainDeploymentMerkleTreeInputs
            memory multiChainTreeInputs = MultiChainDeploymentMerkleTreeInputs({
                networks: networkArray,
                ownerWallets: _treeInputs.ownerWallets,
                moduleProxy: _treeInputs.moduleProxy,
                executor: _treeInputs.executor,
                safeProxy: _treeInputs.safeProxy,
                uri: _treeInputs.uri,
                arbitraryChain: _treeInputs.arbitraryChain,
                forceNumLeavesValue: _treeInputs.forceNumLeavesValue,
                overridingNumLeavesValue: _treeInputs.overridingNumLeavesValue,
                forceApprovalLeafIndexNonZero: _treeInputs.forceApprovalLeafIndexNonZero,
                forceExecutionLeavesChainIdNonZero: _treeInputs.forceExecutionLeavesChainIdNonZero,
                forceApprovalLeafChainIdNonZero: _treeInputs.forceApprovalLeafChainIdNonZero
            });

        SphinxMerkleTree memory tree = getDeploymentMerkleTreeFFI(multiChainTreeInputs);

        bytes32 merkleRoot = tree.root;
        SphinxLeafWithProof memory approvalLeafWithProof = tree.leaves[0];
        SphinxLeafWithProof[] memory executionLeavesWithProofs = new SphinxLeafWithProof[](
            tree.leaves.length - 1
        );
        for (uint256 i = 1; i < tree.leaves.length; i++) {
            executionLeavesWithProofs[i - 1] = tree.leaves[i];
        }
        bytes memory ownerSignatures = signMerkleRoot(_treeInputs.ownerWallets, tree.root);
        return
            DeploymentModuleInputs(
                merkleRoot,
                approvalLeafWithProof,
                executionLeavesWithProofs,
                ownerSignatures
            );
    }

    function signMerkleRoot(
        Wallet[] memory _owners,
        bytes32 _merkleRoot
    ) private pure returns (bytes memory) {
        require(_owners.length > 0, "Sphinx: owners array must have at least one element");

        bytes memory typedData = abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPE_HASH, _merkleRoot))
        );

        bytes memory signatures;
        for (uint256 i = 0; i < _owners.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(_owners[i].privateKey, keccak256(typedData));
            signatures = abi.encodePacked(signatures, r, s, v);
        }

        return signatures;
    }

    function getNumExecutionLeavesOnChain(
        SphinxLeafWithProof[] memory _leavesWithProofs,
        uint256 _chainId
    ) internal pure returns (uint256) {
        uint256 numExecutionLeavesOnChain = 0;
        for (uint256 i = 0; i < _leavesWithProofs.length; i++) {
            SphinxLeafWithProof memory leafWithProof = _leavesWithProofs[i];
            if (
                leafWithProof.leaf.leafType == SphinxLeafType.EXECUTE &&
                leafWithProof.leaf.chainId == _chainId
            ) {
                numExecutionLeavesOnChain += 1;
            }
        }
        return numExecutionLeavesOnChain;
    }

    function getMultiChainDeploymentModuleInputs(
        MultiChainDeploymentMerkleTreeInputs memory _treeInputs
    ) internal returns (DeploymentModuleInputs[] memory) {
        SphinxMerkleTree memory tree = getDeploymentMerkleTreeFFI(_treeInputs);

        DeploymentModuleInputs[] memory moduleInputArray = new DeploymentModuleInputs[](
            _treeInputs.networks.length
        );
        for (uint256 i = 0; i < _treeInputs.networks.length; i++) {
            NetworkDeploymentMerkleTreeInputs memory network = _treeInputs.networks[i];

            SphinxLeafWithProof memory approvalLeafWithProof;
            bool foundApprovalLeaf = false;
            for (uint256 j = 0; j < tree.leaves.length; j++) {
                SphinxLeafWithProof memory leafWithProof = tree.leaves[j];
                if (
                    leafWithProof.leaf.leafType == SphinxLeafType.APPROVE &&
                    leafWithProof.leaf.chainId == network.chainId
                ) {
                    approvalLeafWithProof = leafWithProof;
                    foundApprovalLeaf = true;
                }
            }
            assert(foundApprovalLeaf);

            uint256 numExecutionLeavesOnChain = getNumExecutionLeavesOnChain(
                tree.leaves,
                network.chainId
            );
            SphinxLeafWithProof[] memory executionLeavesWithProofs = new SphinxLeafWithProof[](
                numExecutionLeavesOnChain
            );
            uint256 executionLeafIndex = 0;
            for (uint256 k = 0; k < tree.leaves.length; k++) {
                SphinxLeafWithProof memory leafWithProof = tree.leaves[k];
                if (
                    leafWithProof.leaf.leafType == SphinxLeafType.EXECUTE &&
                    leafWithProof.leaf.chainId == network.chainId
                ) {
                    executionLeavesWithProofs[executionLeafIndex] = leafWithProof;
                    executionLeafIndex += 1;
                }
            }
            assert(executionLeafIndex == numExecutionLeavesOnChain);

            moduleInputArray[i] = DeploymentModuleInputs({
                merkleRoot: tree.root,
                approvalLeafWithProof: approvalLeafWithProof,
                executionLeavesWithProofs: executionLeavesWithProofs,
                ownerSignatures: signMerkleRoot(_treeInputs.ownerWallets, tree.root)
            });
        }

        return moduleInputArray;
    }

    function getCancellationModuleInputs(
        CancellationMerkleTreeInputs memory _treeInputs
    ) internal returns (CancellationModuleInputs memory) {
        NetworkCancellationMerkleTreeInputs[]
            memory networkArray = new NetworkCancellationMerkleTreeInputs[](1);
        networkArray[0] = NetworkCancellationMerkleTreeInputs({
            chainId: _treeInputs.chainId,
            merkleRootToCancel: _treeInputs.merkleRootToCancel,
            moduleProxyNonce: _treeInputs.moduleProxyNonce
        });

        MultiChainCancellationMerkleTreeInputs
            memory multiChainTreeInputs = MultiChainCancellationMerkleTreeInputs({
                networks: networkArray,
                ownerWallets: _treeInputs.ownerWallets,
                moduleProxy: _treeInputs.moduleProxy,
                executor: _treeInputs.executor,
                safeProxy: _treeInputs.safeProxy,
                uri: _treeInputs.uri,
                forceCancellationLeafIndexNonZero: _treeInputs.forceCancellationLeafIndexNonZero
            });

        SphinxMerkleTree memory tree = getCancellationMerkleTreeFFI(multiChainTreeInputs);

        bytes32 merkleRoot = tree.root;
        SphinxLeafWithProof memory cancellationLeafWithProof = tree.leaves[0];
        bytes memory ownerSignatures = signMerkleRoot(_treeInputs.ownerWallets, tree.root);
        return CancellationModuleInputs(merkleRoot, cancellationLeafWithProof, ownerSignatures);
    }

    function getMultiChainCancellationModuleInputs(
        MultiChainCancellationMerkleTreeInputs memory _treeInputs
    ) internal returns (CancellationModuleInputs[] memory) {
        SphinxMerkleTree memory tree = getCancellationMerkleTreeFFI(_treeInputs);

        CancellationModuleInputs[] memory moduleInputArray = new CancellationModuleInputs[](
            _treeInputs.networks.length
        );
        for (uint256 i = 0; i < _treeInputs.networks.length; i++) {
            moduleInputArray[i] = CancellationModuleInputs({
                merkleRoot: tree.root,
                cancellationLeafWithProof: tree.leaves[i],
                ownerSignatures: signMerkleRoot(_treeInputs.ownerWallets, tree.root)
            });
        }
        return moduleInputArray;
    }

    function deployCodeViaCreate2(
        string memory _initCodePath,
        bytes32 _salt
    ) internal virtual returns (address addr) {
        bytes memory initCode = vm.getCode(_initCodePath);
        assembly {
            addr := create2(0, add(initCode, 0x20), mload(initCode), _salt)
        }

        require(addr != address(0), "TestUtils: create2 deployment failed");
    }

    function deployGnosisSafeContracts_1_3_0() public returns (GnosisSafeContracts_1_3_0 memory) {
        // Deploy the Gnosis Safe Proxy Factory and the Gnosis Safe singletons using the exact
        // initcode in the artifact files. This isn't strictly necessary, but we do it anyways
        // to emulate the production environment.
        address safeProxyFactoryAddr = deployCodeViaCreate2(
            "contract-artifacts/gnosis-safe/v1.3.0/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json",
            bytes32(0)
        );
        address safeSingletonL1Addr = deployCodeViaCreate2(
            "contract-artifacts/gnosis-safe/v1.3.0/GnosisSafe.sol/GnosisSafe.json",
            bytes32(0)
        );
        address safeSingletonL2Addr = deployCodeViaCreate2(
            "contract-artifacts/gnosis-safe/v1.3.0/GnosisSafeL2.sol/GnosisSafeL2.json",
            bytes32(0)
        );

        return
            GnosisSafeContracts_1_3_0({
                simulateTxAccessor: new SimulateTxAccessor_1_3_0{ salt: bytes32(0) }(),
                safeProxyFactory: GnosisSafeProxyFactory_1_3_0(safeProxyFactoryAddr),
                // Deploy handlers
                defaultCallbackHandler: new DefaultCallbackHandler_1_3_0{ salt: bytes32(0) }(),
                compatibilityFallbackHandler: new CompatibilityFallbackHandler_1_3_0{
                    salt: bytes32(0)
                }(),
                // Deploy libraries
                createCall: new CreateCall_1_3_0{ salt: bytes32(0) }(),
                multiSend: new MultiSend_1_3_0{ salt: bytes32(0) }(),
                multiSendCallOnly: new MultiSendCallOnly_1_3_0{ salt: bytes32(0) }(),
                signMessageLib: new SignMessageLib_1_3_0{ salt: bytes32(0) }(),
                // Deploy singletons
                safeL1Singleton: GnosisSafe_1_3_0(payable(safeSingletonL1Addr)),
                safeL2Singleton: GnosisSafeL2_1_3_0(payable(safeSingletonL2Addr))
            });
    }

    function deployGnosisSafeContracts_1_4_1() public returns (GnosisSafeContracts_1_4_1 memory) {
        // Deploy the Gnosis Safe Proxy Factory and the Gnosis Safe singletons using the exact
        // initcode in the artifact files. This isn't strictly necessary, but we do it anyways
        // to emulate the production environment.
        address safeProxyFactoryAddr = deployCodeViaCreate2(
            "contract-artifacts/gnosis-safe/v1.4.1/proxies/SafeProxyFactory.sol/SafeProxyFactory.json",
            bytes32(0)
        );
        address safeSingletonL1Addr = deployCodeViaCreate2(
            "contract-artifacts/gnosis-safe/v1.4.1/Safe.sol/Safe.json",
            bytes32(0)
        );
        address safeSingletonL2Addr = deployCodeViaCreate2(
            "contract-artifacts/gnosis-safe/v1.4.1/SafeL2.sol/SafeL2.json",
            bytes32(0)
        );

        return
            GnosisSafeContracts_1_4_1({
                simulateTxAccessor: new SimulateTxAccessor_1_4_1{ salt: bytes32(0) }(),
                safeProxyFactory: SafeProxyFactory_1_4_1(safeProxyFactoryAddr),
                // Deploy handlers
                tokenCallbackHandler: new TokenCallbackHandler_1_4_1{ salt: bytes32(0) }(),
                compatibilityFallbackHandler: new CompatibilityFallbackHandler_1_4_1{
                    salt: bytes32(0)
                }(),
                // Deploy libraries
                createCall: new CreateCall_1_4_1{ salt: bytes32(0) }(),
                multiSend: new MultiSend_1_4_1{ salt: bytes32(0) }(),
                multiSendCallOnly: new MultiSendCallOnly_1_4_1{ salt: bytes32(0) }(),
                signMessageLib: new SignMessageLib_1_4_1{ salt: bytes32(0) }(),
                // Deploy singletons
                safeL1Singleton: Safe_1_4_1(payable(safeSingletonL1Addr)),
                safeL2Singleton: SafeL2_1_4_1(payable(safeSingletonL2Addr))
            });
    }

    function deployGnosisSafeContracts(
        GnosisSafeVersion _gnosisSafeVersion
    ) internal returns (GnosisSafeAddresses memory) {
        if (_gnosisSafeVersion == GnosisSafeVersion.L1_1_3_0) {
            GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
            return
                GnosisSafeAddresses({
                    multiSend: address(safeContracts.multiSend),
                    multiSendCallOnly: address(safeContracts.multiSendCallOnly),
                    compatibilityFallbackHandler: address(
                        safeContracts.compatibilityFallbackHandler
                    ),
                    safeProxyFactory: address(safeContracts.safeProxyFactory),
                    safeSingleton: address(safeContracts.safeL1Singleton),
                    createCall: address(safeContracts.createCall)
                });
        } else if (_gnosisSafeVersion == GnosisSafeVersion.L2_1_3_0) {
            GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
            return
                GnosisSafeAddresses({
                    multiSend: address(safeContracts.multiSend),
                    multiSendCallOnly: address(safeContracts.multiSendCallOnly),
                    compatibilityFallbackHandler: address(
                        safeContracts.compatibilityFallbackHandler
                    ),
                    safeProxyFactory: address(safeContracts.safeProxyFactory),
                    safeSingleton: address(safeContracts.safeL2Singleton),
                    createCall: address(safeContracts.createCall)
                });
        } else if (_gnosisSafeVersion == GnosisSafeVersion.L1_1_4_1) {
            GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
            return
                GnosisSafeAddresses({
                    multiSend: address(safeContracts.multiSend),
                    multiSendCallOnly: address(safeContracts.multiSendCallOnly),
                    compatibilityFallbackHandler: address(
                        safeContracts.compatibilityFallbackHandler
                    ),
                    safeProxyFactory: address(safeContracts.safeProxyFactory),
                    safeSingleton: address(safeContracts.safeL1Singleton),
                    createCall: address(safeContracts.createCall)
                });
        } else if (_gnosisSafeVersion == GnosisSafeVersion.L2_1_4_1) {
            GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
            return
                GnosisSafeAddresses({
                    multiSend: address(safeContracts.multiSend),
                    multiSendCallOnly: address(safeContracts.multiSendCallOnly),
                    compatibilityFallbackHandler: address(
                        safeContracts.compatibilityFallbackHandler
                    ),
                    safeProxyFactory: address(safeContracts.safeProxyFactory),
                    safeSingleton: address(safeContracts.safeL2Singleton),
                    createCall: address(safeContracts.createCall)
                });
        } else {
            revert("Unknown Gnosis Safe version. Should never happen.");
        }
    }

    // Used off-chain to get the ABI of the `SphinxMerkleTree` struct.
    function sphinxMerkleTreeType() external returns (SphinxMerkleTree memory) {}

    // Used off-chain to get the ABI of the `SphinxTransaction` struct.
    function sphinxTransactionArrayType() external returns (SphinxTransaction[][] memory) {}

    // Used off-chain to get the ABI of `NetworkDeploymentMerkleTreeInputs[]`.
    function networkDeploymentMerkleTreeInputsArrayType()
        external
        returns (NetworkDeploymentMerkleTreeInputs[] memory)
    {}

    // Used off-chain to get the ABI of `NetworkCancellationMerkleTreeInputs[]`.
    function networkCancellationMerkleTreeInputsArrayType()
        external
        returns (NetworkCancellationMerkleTreeInputs[] memory)
    {}
}
