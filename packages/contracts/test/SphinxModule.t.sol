// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { console } from "forge-std/console.sol";
import "forge-std/Test.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
import { SphinxModuleFactory } from "../contracts/SphinxModuleFactory.sol";
import { SphinxModule } from "../contracts/SphinxModule.sol";
import {
    GnosisSafeProxyFactory
} from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
import { SimulateTxAccessor } from "@gnosis.pm/safe-contracts/accessors/SimulateTxAccessor.sol";
import {
    DefaultCallbackHandler
} from "@gnosis.pm/safe-contracts/handler/DefaultCallbackHandler.sol";
import {
    CompatibilityFallbackHandler
} from "@gnosis.pm/safe-contracts/handler/CompatibilityFallbackHandler.sol";
import { CreateCall } from "@gnosis.pm/safe-contracts/libraries/CreateCall.sol";
import { MultiSend } from "@gnosis.pm/safe-contracts/libraries/MultiSend.sol";
import { MultiSendCallOnly } from "@gnosis.pm/safe-contracts/libraries/MultiSendCallOnly.sol";
import { SignMessageLib } from "@gnosis.pm/safe-contracts/libraries/SignMessageLib.sol";
import { GnosisSafeL2 } from "@gnosis.pm/safe-contracts/GnosisSafeL2.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";
import { SphinxMerkleTree } from "../contracts/SphinxDataTypes.sol";

contract SphinxModule_Test is Test, Enum {

    SphinxModule module;
    GnosisSafe safe;

    address[] owners = new address[](5);
    address executor = address(0x6000);
    uint256 threshold = 3;
    string sampleDeploymentUri = "ipfs://Qm1234";

    function setUp() public {
        // Deploy all Gnosis Safe contracts
        new SimulateTxAccessor();
        GnosisSafeProxyFactory safeProxyFactory = new GnosisSafeProxyFactory();
        // Deploy handlers
        new DefaultCallbackHandler();
        CompatibilityFallbackHandler compatibilityFallbackHandler = new CompatibilityFallbackHandler();
        // Deploy libraries
        new CreateCall();
        MultiSend multiSend = new MultiSend();
        new MultiSendCallOnly();
        new SignMessageLib();
        // Deploy singletons
        new GnosisSafeL2();
        GnosisSafe gnosisSafeSingleton = new GnosisSafe();

        SphinxModuleFactory moduleFactory = new SphinxModuleFactory();

        owners[0] = address(0x1000);
        owners[1] = address(0x2000);
        owners[2] = address(0x3000);
        owners[3] = address(0x4000);
        owners[4] = address(0x5000);

        bytes memory encodedDeployModuleCall = abi.encodeWithSelector(moduleFactory.deploySphinxModuleFromSafe.selector, bytes32(0));
        bytes memory firstMultiSendData = abi.encodePacked(uint8(Operation.Call), moduleFactory, uint256(0), encodedDeployModuleCall.length, encodedDeployModuleCall);
        bytes memory encodedEnableModuleCall = abi.encodeWithSelector(moduleFactory.enableSphinxModule.selector, bytes32(0));
        bytes memory secondMultiSendData = abi.encodePacked(uint8(Operation.DelegateCall), moduleFactory, uint256(0), encodedEnableModuleCall.length, encodedEnableModuleCall);

        bytes memory multiSendData = abi.encodeWithSelector(multiSend.multiSend.selector, abi.encodePacked(firstMultiSendData, secondMultiSendData));

        bytes memory safeInitializerData = abi.encodePacked(
            gnosisSafeSingleton.setup.selector,
            abi.encode(
                owners,
                threshold,
                address(multiSend),
                multiSendData,
                address(compatibilityFallbackHandler),
                address(0),
                0,
                address(0)
            )
        );

        GnosisSafeProxy safeProxy = safeProxyFactory.createProxyWithNonce(
                address(gnosisSafeSingleton),
                safeInitializerData,
                0
            );

        safe = GnosisSafe(payable(address(safeProxy)));
        module = SphinxModule(moduleFactory.computeSphinxModuleAddress(address(safe), bytes32(0)));
    }

    function test_TODO_success() external {
        SphinxMerkleTree memory tree = getMerkleTreeFFI();
        console.logBytes32(tree.root);
        bytes memory signatures = getOwnerSignatures(owners, tree.root);

        // module.approve(tree.root, tree.leafs[0].leaf, tree.leafs[0].proof, signatures);
    }

    function getMerkleTreeFFI() public returns (SphinxMerkleTree memory) {
        console.log(address(module));
        console.log(address(module).code.length);
        string[] memory inputs = new string[](10);
        inputs[0] = "npx";
        inputs[1] = "ts-node";
        inputs[2] = "scripts/display-merkle-tree.ts";
        inputs[3] = vm.toString(block.chainid);
        inputs[4] = vm.toString(module.currentNonce());
        inputs[5] = vm.toString(executor);
        inputs[6] = vm.toString(address(safe));
        inputs[7] = sampleDeploymentUri;
        inputs[8] = "TODO";
        inputs[9] = "--swc"; // Speeds up the script considerably
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (SphinxMerkleTree));
    }

    function getOwnerSignatures(address[] memory _owners, bytes32 _root) public returns (bytes memory) {
        bytes memory signatures;
            Wallet[] memory wallets = sphinxUtils.getSphinxWalletsSortedByAddress(
                currentOwnerThreshold
            );
            for (uint256 i = 0; i < currentOwnerThreshold; i++) {
                // Create a list of owner meta transactions. This allows us to run the rest of
                // this function without needing to know the owner private keys. If we don't do
                // this, the rest of this function will fail because there are an insufficent
                // number of owner signatures. It's worth mentioning that another strategy is to
                // set the owner threshold to 0 via `vm.store`, but we do it this way because it
                // allows us to run the meta transaction signature verification logic in the
                // SphinxAuth contract instead of skipping it entirely, which would be the case
                // if we set the owner threshold to 0.
                _sphinxGrantRoleInAuthContract(bytes32(0), wallets[i].addr, _rpcUrl);
                ownerSignatureArray[i] = sphinxUtils.signMetaTxnForAuthRoot(
                    wallets[i].privateKey,
                    _authRoot
                );
            }
    }

    /**
     * @notice Get auto-generated wallets sorted in ascending order according to their addresses.
     *         We don't use `vm.createWallet` because this function must be view/pure, since it may
     *         be called during a broadcast. If it's not view/pure, then this call would be
     *         broadcasted, which is not what we want.
     */
    function getSphinxWalletsSortedByAddress(
        uint256 _numWallets
    ) external pure returns (Wallet[] memory) {
        Wallet[] memory wallets = new Wallet[](_numWallets);
        for (uint256 i = 0; i < _numWallets; i++) {
            uint256 privateKey = getSphinxDeployerPrivateKey(i);
            wallets[i] = Wallet({ addr: vm.addr(privateKey), privateKey: privateKey });
        }

        // Sort the wallets by address
        for (uint256 i = 0; i < wallets.length; i++) {
            for (uint256 j = i + 1; j < wallets.length; j++) {
                if (wallets[i].addr > wallets[j].addr) {
                    Wallet memory temp = wallets[i];
                    wallets[i] = wallets[j];
                    wallets[j] = temp;
                }
            }
        }

        return wallets;
    }

    function sphinxMerkleTreeType() external returns (SphinxMerkleTree memory tree) {}
}
