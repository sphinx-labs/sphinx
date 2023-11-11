// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// TODO(end): rm unnnecessary imports
import { console } from "sphinx-forge-std/console.sol";
import "sphinx-forge-std/Test.sol";
import { StdUtils } from "sphinx-forge-std/StdUtils.sol";
import { SphinxModuleFactory } from "../contracts/core/SphinxModuleFactory.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
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
import { GnosisSafeL2 } from "@gnosis.pm/safe-contracts/GnosisSafeL2.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";
import {
    SphinxMerkleTree,
    SphinxLeafWithProof,
    SphinxTransaction
} from "../contracts/core/SphinxDataTypes.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { TestUtils } from "./TestUtils.t.sol";

// TODO(e2e):
// for each Safe type:
// - deploy and enable in Safe initializer
// - deploy and enable module after Safe deployment

contract SphinxModuleFactory_Test is Test, Enum, TestUtils, SphinxModuleFactory {
    // selector of Error(string)
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    SphinxModuleFactory moduleFactory;
    GnosisSafe safe;
    Wallet[] ownerWallets;
    address[] owners;
    uint256 threshold = 3;

    function setUp() public {
        // Deploy all Gnosis Safe contracts
        new SimulateTxAccessor();
        GnosisSafeProxyFactory safeProxyFactory = new GnosisSafeProxyFactory();
        // Deploy handlers
        new DefaultCallbackHandler();
        CompatibilityFallbackHandler compatibilityFallbackHandler = new CompatibilityFallbackHandler();
        // Deploy libraries
        new CreateCall();
        new MultiSend();
        new MultiSendCallOnly();
        // Deploy singletons
        new GnosisSafeL2();
        GnosisSafe gnosisSafeSingleton = new GnosisSafe();

        moduleFactory = new SphinxModuleFactory();

        Wallet[] memory wallets = getSphinxWalletsSortedByAddress(5);
        // We can't assign the wallets directly to the `owners` array because Solidity throws an
        // error if we try to assign a memory array to a storage array. So, instead, we have to
        // iterate over the memory array and push each element to the storage array.
        for (uint256 i = 0; i < wallets.length; i++) {
            ownerWallets.push(wallets[i]);
            owners.push(wallets[i].addr);
        }

        bytes memory safeInitializerData = abi.encodePacked(
            gnosisSafeSingleton.setup.selector,
            abi.encode(
                owners,
                threshold,
                address(0),
                new bytes(0),
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
    }

    /////////////////////////// deploySphinxModule ///////////////////////////////////////

    // Must revert if a SphinxModule already exists at an address.
    function test_deploySphinxModule_revert_alreadyDeployed() external {
        helper_test_deploySphinxModule({ _saltNonce: 0, _caller: address(this) });

        vm.expectRevert("Create2: Failed on deploy");
        moduleFactory.deploySphinxModule({ _safeProxy: address(safe), _saltNonce: 0 });
    }

    // Must:
    // - Deploy a `SphinxModule`.
    // - Emit a `SphinxModuleDeployed` event.
    // - Initialize the `SphinxModule` with the correct Gnosis Safe proxy address.
    // - Return the deployed `SphinxModule`.
    function test_deploySphinxModule_success() external {
        helper_test_deploySphinxModule({ _saltNonce: 0, _caller: address(this) });
    }

    // Must be possible to deploy more than one SphinxModule for a given caller.
    function test_deploySphinxModule_success_deployMultiple() external {
        SphinxModule module1 = helper_test_deploySphinxModule({ _saltNonce: 0, _caller: address(this) });

        SphinxModule module2 = helper_test_deploySphinxModule({ _saltNonce: 1, _caller: address(this) });
        assertTrue(address(module1) != address(module2));
    }

    /////////////////////////// deploySphinxModuleFromSafe //////////////////////////////////

    // Must revert if delegatecalled
    function test_deploySphinxModuleFromSafe_revert_delegateCallNotAllowed() external {
        uint256 saltNonce = 0;
        bytes memory encodedFunctionCall = abi.encodeWithSelector(
            moduleFactory.deploySphinxModuleFromSafe.selector,
            (saltNonce)
        );
        (bool success, bytes memory retdata) = address(moduleFactory).delegatecall(
            encodedFunctionCall
        );
        assertFalse(success);
        assertEq(
            retdata,
            abi.encodePacked(
                ERROR_SELECTOR,
                abi.encode("SphinxModuleFactory: delegatecall not allowed")
            )
        );
    }

    // Must revert if a SphinxModule already exists at an address.
    function test_deploySphinxModuleFromSafe_revert_alreadyDeployed() external {
        helper_test_deploySphinxModuleFromSafe({ _saltNonce: 0 });

        vm.expectRevert("Create2: Failed on deploy");
        vm.prank(address(safe));
        moduleFactory.deploySphinxModuleFromSafe({ _saltNonce: 0 });
    }

    // Must:
    // - Deploy a `SphinxModule`.
    // - Emit a `SphinxModuleDeployed` event.
    // - Initialize the `SphinxModule` with the correct Gnosis Safe proxy address.
    function test_deploySphinxModuleFromSafe_success() external {
        helper_test_deploySphinxModuleFromSafe({ _saltNonce: 0 });
    }

    // Must be possible to deploy more than one SphinxModule for a given Safe.
    function test_deploySphinxModuleFromSafe_success_deployMultiple() external {
        SphinxModule module1 = helper_test_deploySphinxModuleFromSafe({ _saltNonce: 0 });

        SphinxModule module2 = helper_test_deploySphinxModuleFromSafe({ _saltNonce: 1 });
        assertTrue(address(module1) != address(module2));
    }

    //////////////////////////////////// enableSphinxModuleFromSafe //////////////////////////////////////////

    function test_enableSphinxModuleFromSafe_revert_mustBeDelegateCalled() external {
        vm.expectRevert("SphinxModuleFactory: must be delegatecalled");
        moduleFactory.enableSphinxModuleFromSafe({ _saltNonce: 0 });
    }

    function test_enableSphinxModuleFromSafe_success() external {
        SphinxModule module = helper_test_deploySphinxModuleFromSafe({ _saltNonce: 0 });
        assertFalse(safe.isModuleEnabled(address(module)));

        // TODO(docs): we can't prank the safe then delegatecall the SphinxModuleFactory because
        // `address(this)` will be the address of this test contract, which will cause the
        // delegatecall to fail. this is a byproduct of the fact that you can't change
        // `address(this)` in the scope of a forge test. to change `adddress(this)`, you must call
        // another contract. so, we call the safe, which then delegatecalls into the
        // SphinxModuleFactory.

        uint256 saltNonce = 0;
        bytes memory encodedDelegateCall = abi.encodeWithSelector(
            moduleFactory.enableSphinxModuleFromSafe.selector,
            (saltNonce)
        );
        GnosisSafeTransaction memory gnosisSafeTxn = GnosisSafeTransaction({
            to: address(moduleFactory),
            value: 0,
            txData: encodedDelegateCall,
            operation: Operation.DelegateCall,
            safeTxGas: 1_000_000
        });
        bytes memory ownerSignatures = signSafeTransaction({
            _ownerWallets: ownerWallets,
            _safe: safe,
            _gnosisSafeTxn: gnosisSafeTxn
        });
        vm.expectEmit(address(safe));
        emit SphinxModuleEnabled(address(module), address(safe));
        bool success = safe.execTransaction({
            to: gnosisSafeTxn.to,
            value: gnosisSafeTxn.value,
            data: gnosisSafeTxn.txData,
            operation: gnosisSafeTxn.operation,
            safeTxGas: gnosisSafeTxn.safeTxGas,
            signatures: ownerSignatures,
            // TODO(docs): the following fields are unused:
            baseGas: 0,
            gasPrice: 0,
            gasToken: address(0),
            refundReceiver: payable(address(0))
        });

        assertTrue(success);
        assertTrue(safe.isModuleEnabled(address(module)));
    }

    //////////////////////////////////// computeSphinxModuleAddress //////////////////////////////////////////

    function test_computeSphinxModuleAddress_success() external {
        address caller = address(0x1234);
        address expectedModuleAddress = moduleFactory.computeSphinxModuleAddress({
            _safeProxy: address(safe),
            _caller: caller,
            _saltNonce: 0
        });
        assertEq(expectedModuleAddress.code.length, 0);

        SphinxModule module = helper_test_deploySphinxModule({ _saltNonce: 0, _caller: caller });

        assertGt(address(module).code.length, 0);
        assertEq(address(module), expectedModuleAddress);
    }

    //////////////////////////////////// Helper functions //////////////////////////////////////////

    function helper_test_deploySphinxModule(uint256 _saltNonce, address _caller) internal returns (SphinxModule) {
        address expectedModuleAddress = moduleFactory.computeSphinxModuleAddress({
            _safeProxy: address(safe),
            _caller: _caller,
            _saltNonce: _saltNonce
        });
        assertEq(expectedModuleAddress.code.length, 0);

        vm.expectEmit(address(moduleFactory));
        emit SphinxModuleDeployed(SphinxModule(expectedModuleAddress), address(safe));
        vm.prank(_caller);
        SphinxModule module = moduleFactory.deploySphinxModule({
            _safeProxy: address(safe),
            _saltNonce: _saltNonce
        });
        assertGt(address(module).code.length, 0);
        assertEq(address(module), expectedModuleAddress);
        assertEq(address(module.safeProxy()), address(safe));

        return module;
    }

    function helper_test_deploySphinxModuleFromSafe(
        uint256 _saltNonce
    ) internal returns (SphinxModule) {
        address expectedModuleAddress = moduleFactory.computeSphinxModuleAddress({
            _safeProxy: address(safe),
            _caller: address(safe),
            _saltNonce: _saltNonce
        });
        assertEq(expectedModuleAddress.code.length, 0);

        vm.expectEmit(address(moduleFactory));
        emit SphinxModuleDeployed(SphinxModule(expectedModuleAddress), address(safe));
        vm.prank(address(safe));
        moduleFactory.deploySphinxModuleFromSafe({ _saltNonce: _saltNonce });
        assertGt(address(expectedModuleAddress).code.length, 0);
        assertEq(address(SphinxModule(expectedModuleAddress).safeProxy()), address(safe));

        return SphinxModule(expectedModuleAddress);
    }
}
