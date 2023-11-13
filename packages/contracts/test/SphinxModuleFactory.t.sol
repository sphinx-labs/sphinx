// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// TODO(end): rm unnnecessary imports
import "sphinx-forge-std/Test.sol";
import { SphinxModuleFactory } from "../contracts/core/SphinxModuleFactory.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
import { Enum } from "@gnosis.pm/safe-contracts/common/Enum.sol";
import {
    SphinxMerkleTree,
    SphinxLeafWithProof,
    SphinxTransaction
} from "../contracts/core/SphinxDataTypes.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { TestUtils } from "./TestUtils.t.sol";
import { Common } from "./Common.t.sol";

// TODO: add an invariant and test for 'must revert if safeProxy == address(0)'.

// TODO(e2e):
// for each Safe type:
// - deploy and enable in Safe initializer
// - deploy and enable module after Safe deployment

contract SphinxModuleFactory_Test is Test, Enum, TestUtils, SphinxModuleFactory, Common {
    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    SphinxModuleFactory moduleFactory;
    GnosisSafe safe;
    Wallet[] ownerWallets;
    address[] owners;
    uint256 threshold = 3;

    function setUp() public override {
        Common.setUp();

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
            gnosisSafeContracts.gnosisSafeSingleton.setup.selector,
            abi.encode(
                owners,
                threshold,
                address(0),
                new bytes(0),
                address(gnosisSafeContracts.compatibilityFallbackHandler),
                address(0),
                0,
                address(0)
            )
        );

        GnosisSafeProxy safeProxy = gnosisSafeContracts.safeProxyFactory.createProxyWithNonce(
            address(gnosisSafeContracts.gnosisSafeSingleton), safeInitializerData, 0
        );

        safe = GnosisSafe(payable(address(safeProxy)));
    }

    /////////////////////////// deploySphinxModule ///////////////////////////////////////

    // Must revert if a contract already exists at the `CREATE2` address.
    function test_deploySphinxModule_revert_alreadyDeployed() external {
        helper_test_deploySphinxModule({ _saltNonce: 0, _caller: address(this) });

        vm.expectRevert("Create2: Failed on deploy");
        moduleFactory.deploySphinxModule({ _safeProxy: address(safe), _saltNonce: 0 });
    }

    // Must revert if delegatecalled
    function test_deploySphinxModule_revert_delegateCallNotAllowed() external {
        uint256 saltNonce = 0;
        bytes memory encodedFunctionCall =
            abi.encodePacked(moduleFactory.deploySphinxModule.selector, abi.encode(safe, saltNonce));
        (bool success, bytes memory retdata) =
            address(moduleFactory).delegatecall(encodedFunctionCall);
        assertFalse(success);
        assertEq(
            retdata,
            abi.encodePacked(
                ERROR_SELECTOR, abi.encode("SphinxModuleFactory: delegatecall not allowed")
            )
        );
    }

    // A successful call must:
    // - Deploy a `SphinxModule`.
    // - Emit a `SphinxModuleDeployed` event.
    // - Initialize the `SphinxModule` with the correct Gnosis Safe proxy address.
    // - Return the deployed `SphinxModule`.
    function test_deploySphinxModule_success() external {
        helper_test_deploySphinxModule({ _saltNonce: 0, _caller: address(this) });
    }

    // Must be possible to deploy more than one SphinxModule for a given caller.
    function test_deploySphinxModule_success_deployMultiple() external {
        SphinxModule module1 =
            helper_test_deploySphinxModule({ _saltNonce: 0, _caller: address(this) });

        SphinxModule module2 =
            helper_test_deploySphinxModule({ _saltNonce: 1, _caller: address(this) });
        assertTrue(address(module1) != address(module2));
    }

    /////////////////////////// deploySphinxModuleFromSafe //////////////////////////////////

    // Must revert if a contract already exists at the `CREATE2` address.
    function test_deploySphinxModuleFromSafe_revert_alreadyDeployed() external {
        helper_test_deploySphinxModuleFromSafe({ _saltNonce: 0 });

        vm.expectRevert("Create2: Failed on deploy");
        vm.prank(address(safe));
        moduleFactory.deploySphinxModuleFromSafe({ _saltNonce: 0 });
    }

    // Must revert if delegatecalled
    function test_deploySphinxModuleFromSafe_revert_delegateCallNotAllowed() external {
        uint256 saltNonce = 0;
        bytes memory encodedFunctionCall =
            abi.encodeWithSelector(moduleFactory.deploySphinxModuleFromSafe.selector, (saltNonce));
        (bool success, bytes memory retdata) =
            address(moduleFactory).delegatecall(encodedFunctionCall);
        assertFalse(success);
        assertEq(
            retdata,
            abi.encodePacked(
                ERROR_SELECTOR, abi.encode("SphinxModuleFactory: delegatecall not allowed")
            )
        );
    }

    // A successful call must:
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

    //////////////////////////////////// enableSphinxModuleFromSafe
    // //////////////////////////////////////////

    // Must revert if not delegatecalled.
    function test_enableSphinxModuleFromSafe_revert_mustBeDelegateCalled() external {
        vm.expectRevert("SphinxModuleFactory: must be delegatecalled");
        moduleFactory.enableSphinxModuleFromSafe({ _saltNonce: 0 });
    }

    // A successful delegatecall must:
    // - Enable the `SphinxModule` as a module in the Gnosis Safe.
    function test_enableSphinxModuleFromSafe_success() external {
        helper_test_enableSphinxModule({ _saltNonce: 0 });
    }

    // Must be possible to enable more than one SphinxModule for a given Safe.
    function test_enableSphinxModuleFromSafe_success_enableMultiple() external {
        helper_test_enableSphinxModule({ _saltNonce: 0 });
        helper_test_enableSphinxModule({ _saltNonce: 1 });
    }

    //////////////////////////////////// computeSphinxModuleAddress
    // //////////////////////////////////////////

    // Must return the correct `CREATE2` address of a `SphinxModule` deployed by the
    // `SphinxModuleFactory`.
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

    function helper_test_deploySphinxModule(
        uint256 _saltNonce,
        address _caller
    )
        internal
        returns (SphinxModule)
    {
        address expectedModuleAddress = moduleFactory.computeSphinxModuleAddress({
            _safeProxy: address(safe),
            _caller: _caller,
            _saltNonce: _saltNonce
        });
        assertEq(expectedModuleAddress.code.length, 0);

        vm.expectEmit(address(moduleFactory));
        emit SphinxModuleDeployed(SphinxModule(expectedModuleAddress), address(safe));
        vm.prank(_caller);
        SphinxModule module =
            moduleFactory.deploySphinxModule({ _safeProxy: address(safe), _saltNonce: _saltNonce });
        assertGt(address(module).code.length, 0);
        assertEq(address(module), expectedModuleAddress);
        assertEq(address(module.safeProxy()), address(safe));

        return module;
    }

    function helper_test_deploySphinxModuleFromSafe(uint256 _saltNonce)
        internal
        returns (SphinxModule)
    {
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

    function helper_test_enableSphinxModule(uint256 _saltNonce) internal {
        SphinxModule module = helper_test_deploySphinxModuleFromSafe({ _saltNonce: _saltNonce });
        assertFalse(safe.isModuleEnabled(address(module)));

        // We enable the `SphinxModule` by creating a transaction that's signed by the Gnosis Safe
        // owners then executed within the Gnosis Safe. We can't shortcut this process by pranking
        // the Gnosis Safe then delegatecalling the `SphinxModuleFactory` because `address(this)` in
        // the `SphinxModuleFactory` will be the address of this test contract, which will cause the
        // delegatecall to fail. This is a byproduct of the fact that Forge doesn't let us change
        // `address(this)` in the scope of a Forge test. To change `adddress(this)`, we must call
        // another contract. So, we call the Gnosis Safe, which then delegatecalls into the
        // `SphinxModuleFactory`.
        bytes memory encodedDelegateCall =
            abi.encodeWithSelector(moduleFactory.enableSphinxModuleFromSafe.selector, (_saltNonce));
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
        bool success = safe.execTransaction({
            to: gnosisSafeTxn.to,
            value: gnosisSafeTxn.value,
            data: gnosisSafeTxn.txData,
            operation: gnosisSafeTxn.operation,
            safeTxGas: gnosisSafeTxn.safeTxGas,
            signatures: ownerSignatures,
            // The following fields are for refunding the caller. We don't use them.
            baseGas: 0,
            gasPrice: 0,
            gasToken: address(0),
            refundReceiver: payable(address(0))
        });

        assertTrue(success);
        assertTrue(safe.isModuleEnabled(address(module)));
    }
}
