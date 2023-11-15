// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// TODO(end): rm unnnecessary imports
import "sphinx-forge-std/Test.sol";
import { ISphinxModuleFactory } from "../contracts/core/interfaces/ISphinxModuleFactory.sol";
import { SphinxModuleFactory } from "../contracts/core/SphinxModuleFactory.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";
import { GnosisSafeProxyFactory } from
    "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
import {
    SphinxMerkleTree,
    SphinxLeafWithProof,
    SphinxTransaction
} from "../contracts/core/SphinxDataTypes.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { TestUtils } from "./TestUtils.t.sol";

// TODO: add an invariant and test for 'must revert if safeProxy == address(0)'.

// TODO(e2e):
// for each Safe type:
// - deploy and enable in Safe initializer
// - deploy and enable module after Safe deployment

abstract contract AbstractSphinxModuleFactory_Test is
    Test,
    Enum,
    TestUtils,
    ISphinxModuleFactory
{
    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    SphinxModuleFactory moduleFactory;
    GnosisSafe safeProxy;
    Wallet[] ownerWallets;
    address[] owners;
    uint256 threshold = 3;

    function setUp(
        address _compatibilityFallbackHandler,
        address _gnosisSafeProxyFactory,
        address _gnosisSafeSingleton
    )
        internal
    {
        moduleFactory = new SphinxModuleFactory();

        Wallet[] memory wallets = getSphinxWalletsSortedByAddress(5);
        // We can't assign the wallets directly to the `owners` array because Solidity throws an
        // error if we try to assign a memory array to a storage array. So, instead, we have to
        // iterate over the memory array and push each element to the storage array.
        for (uint256 i = 0; i < wallets.length; i++) {
            ownerWallets.push(wallets[i]);
            owners.push(wallets[i].addr);
        }

        bytes memory safeInitializerData = abi.encodeWithSelector(
            GnosisSafe.setup.selector,
            owners,
            threshold,
            address(0),
            new bytes(0),
            _compatibilityFallbackHandler,
            address(0),
            0,
            address(0)
        );

        safeProxy = GnosisSafe(
            payable(
                address(
                    GnosisSafeProxyFactory(_gnosisSafeProxyFactory).createProxyWithNonce(
                        _gnosisSafeSingleton, safeInitializerData, 0
                    )
                )
            )
        );
    }

    /////////////////////////// constructor ///////////////////////////////////////

    function test_constructor_success() external { }

    /////////////////////////// deploySphinxModule ///////////////////////////////////////

    // Must revert if a contract already exists at the `CREATE2` address.
    function test_deploySphinxModule_revert_alreadyDeployed() external {
        helper_test_deploySphinxModule({ _saltNonce: 0, _caller: address(this) });

        vm.expectRevert("ERC1167: create2 failed");
        moduleFactory.deploySphinxModule({ _safeProxy: address(safeProxy), _saltNonce: 0 });
    }

    // Must revert if delegatecalled
    function test_deploySphinxModule_revert_delegateCallNotAllowed() external {
        uint256 saltNonce = 0;
        bytes memory encodedFunctionCall = abi.encodePacked(
            moduleFactory.deploySphinxModule.selector, abi.encode(safeProxy, saltNonce)
        );
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

        vm.expectRevert("ERC1167: create2 failed");
        vm.prank(address(safeProxy));
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

    ////////////////////////////// enableSphinxModuleFromSafe ////////////////////////////

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

    /////////////////////////// computeSphinxModuleAddress ////////////////////////

    // Must return the correct `CREATE2` address of a `SphinxModule` deployed by the
    // `SphinxModuleFactory`.
    function test_computeSphinxModuleAddress_success() external {
        address caller = address(0x1234);
        address expectedModuleAddress = moduleFactory.computeSphinxModuleAddress({
            _safeProxy: address(safeProxy),
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
            _safeProxy: address(safeProxy),
            _caller: _caller,
            _saltNonce: _saltNonce
        });
        assertEq(expectedModuleAddress.code.length, 0);

        vm.expectEmit(address(moduleFactory));
        emit SphinxModuleDeployed(expectedModuleAddress, address(safeProxy));
        vm.prank(_caller);
        address module = moduleFactory.deploySphinxModule({
            _safeProxy: address(safeProxy),
            _saltNonce: _saltNonce
        });
        assertGt(module.code.length, 0);
        assertEq(module, expectedModuleAddress);
        assertEq(address(SphinxModule(module).safeProxy()), address(safeProxy));

        return SphinxModule(module);
    }

    function helper_test_deploySphinxModuleFromSafe(uint256 _saltNonce)
        internal
        returns (SphinxModule)
    {
        address expectedModuleAddress = moduleFactory.computeSphinxModuleAddress({
            _safeProxy: address(safeProxy),
            _caller: address(safeProxy),
            _saltNonce: _saltNonce
        });
        assertEq(expectedModuleAddress.code.length, 0);

        vm.expectEmit(address(moduleFactory));
        emit SphinxModuleDeployed(expectedModuleAddress, address(safeProxy));
        vm.prank(address(safeProxy));
        moduleFactory.deploySphinxModuleFromSafe({ _saltNonce: _saltNonce });
        assertGt(address(expectedModuleAddress).code.length, 0);
        assertEq(address(SphinxModule(expectedModuleAddress).safeProxy()), address(safeProxy));

        return SphinxModule(expectedModuleAddress);
    }

    function helper_test_enableSphinxModule(uint256 _saltNonce) internal {
        SphinxModule module = helper_test_deploySphinxModuleFromSafe({ _saltNonce: _saltNonce });
        assertFalse(safeProxy.isModuleEnabled(address(module)));

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
            _safe: safeProxy,
            _gnosisSafeTxn: gnosisSafeTxn
        });
        bool success = safeProxy.execTransaction({
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
        assertTrue(safeProxy.isModuleEnabled(address(module)));
    }

    function computeSphinxModuleAddress(
        address _safeProxy,
        address _caller,
        uint256 _saltNonce
    )
        external
        view
        override
        returns (address)
    { }
    function deploySphinxModule(
        address _safeProxy,
        uint256 _saltNonce
    )
        external
        override
        returns (address sphinxModule)
    { }
    function deploySphinxModuleFromSafe(uint256 _saltNonce) external override { }
    function enableSphinxModuleFromSafe(uint256 _saltNonce) external override { }
}

contract SphinxModuleFactory_GnosisSafe_L1_1_3_0_Test is AbstractSphinxModuleFactory_Test {
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxModuleFactory_Test.setUp({
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
            _gnosisSafeSingleton: address(safeContracts.safeL1Singleton)
        });
    }
}

contract SphinxModuleFactory_GnosisSafe_L2_1_3_0_Test is AbstractSphinxModuleFactory_Test {
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxModuleFactory_Test.setUp({
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
            _gnosisSafeSingleton: address(safeContracts.safeL2Singleton)
        });
    }
}

contract SphinxModuleFactory_GnosisSafe_L1_1_4_1_Test is AbstractSphinxModuleFactory_Test {
    function setUp() public {
        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        AbstractSphinxModuleFactory_Test.setUp({
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
            _gnosisSafeSingleton: address(safeContracts.safeL1Singleton)
        });
    }
}

contract SphinxModuleFactory_GnosisSafe_L2_1_4_1_Test is AbstractSphinxModuleFactory_Test {
    function setUp() public {
        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        AbstractSphinxModuleFactory_Test.setUp({
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
            _gnosisSafeSingleton: address(safeContracts.safeL2Singleton)
        });
    }
}
