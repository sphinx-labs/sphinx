// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {
    ISphinxModuleProxyFactory
} from "../contracts/core/interfaces/ISphinxModuleProxyFactory.sol";
import { SphinxModuleProxyFactory } from "../contracts/core/SphinxModuleProxyFactory.sol";
import { SphinxModule } from "../contracts/core/SphinxModule.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import {
    GnosisSafeProxyFactory
} from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
import { Wallet } from "../contracts/foundry/SphinxPluginTypes.sol";
import { TestUtils } from "./TestUtils.t.sol";

/**
 * @notice An abstract contract that contains all of the unit tests for the `SphinxModuleProxyFactory`.
 *         This contract is inherited by four contracts, which are at the bottom of this file.
 *         Each of the four contracts is for testing a different type of Gnosis Safe against
 *         the `SphinxModuleProxyFactory`. These four Gnosis Safes are:
 *         1. `GnosisSafe` from Gnosis Safe v1.3.0
 *         2. `GnosisSafeL2` from Gnosis Safe v1.3.0
 *         3. `Safe` from Gnosis Safe v1.4.1
 *         4. `SafeL2` from Gnosis Safe v1.4.1
 *
 *         Since all of the test functions in this contract are public, they'll run for each
 *         version of Gnosis Safe, ensuring that the `SphinxModuleProxyFactory` is compatible with
 *         each type.
 */
abstract contract AbstractSphinxModuleProxyFactory_Test is
    Enum,
    TestUtils,
    ISphinxModuleProxyFactory
{
    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    SphinxModuleProxyFactory moduleProxyFactory;
    GnosisSafe safeProxy;
    Wallet[] ownerWallets;
    address[] owners;

    function setUp(
        address _compatibilityFallbackHandler,
        address _gnosisSafeProxyFactory,
        address _gnosisSafeSingleton
    ) internal {
        moduleProxyFactory = new SphinxModuleProxyFactory();

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
            3, // Gnosis Safe owner threshold
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
                        _gnosisSafeSingleton,
                        safeInitializerData,
                        0
                    )
                )
            )
        );
    }

    /////////////////////////// constructor ///////////////////////////////////////

    // Must:
    // - Deploy a `SphinxModule` implementation contract at a `CREATE2` address determined by the
    //   address of the `SphinxModuleProxyFactory` and a `bytes32(0)` salt.
    function test_constructor_success() external {
        address expectedModuleImpl = computeCreate2Address({
            salt: bytes32(0),
            initcodeHash: keccak256(type(SphinxModule).creationCode),
            deployer: address(moduleProxyFactory)
        });
        address actualModule = moduleProxyFactory.SPHINX_MODULE_IMPL();
        assertEq(actualModule, expectedModuleImpl);
    }

    /////////////////////////// deploySphinxModuleProxy ///////////////////////////////////////

    // Must revert if the Gnosis Safe's address is `address(0)`.
    function test_deploySphinxModuleProxy_revert_zeroAddress() external {
        vm.expectRevert("SphinxModule: invalid Safe address");
        moduleProxyFactory.deploySphinxModuleProxy({ _safeProxy: address(0), _saltNonce: 0 });
    }

    // Must revert if a contract already exists at the `CREATE2` address.
    function test_deploySphinxModuleProxy_revert_alreadyDeployed() external {
        helper_test_deploySphinxModuleProxy({ _saltNonce: 0, _caller: address(this) });

        vm.expectRevert("ERC1167: create2 failed");
        moduleProxyFactory.deploySphinxModuleProxy({
            _safeProxy: address(safeProxy),
            _saltNonce: 0
        });
    }

    // A successful call must:
    // - Deploy an EIP-1167 proxy at the correct `CREATE2` address, using the `SphinxModule`
    //   implementation deployed in the `SphinxModuleProxyFactory`'s constructor.
    // - Emit a `SphinxModuleProxyDeployed` event in the `SphinxModuleProxyFactory`.
    // - Initialize the `SphinxModuleProxy` using the correct Gnosis Safe address.
    // - Return the address of the `SphinxModuleProxy`.
    function test_deploySphinxModuleProxy_success() external {
        helper_test_deploySphinxModuleProxy({ _saltNonce: 0, _caller: address(this) });
    }

    // Must be possible to deploy more than one `SphinxModuleProxy` for a given caller.
    function test_deploySphinxModuleProxy_success_deployMultiple() external {
        SphinxModule module1 = helper_test_deploySphinxModuleProxy({
            _saltNonce: 0,
            _caller: address(this)
        });

        SphinxModule module2 = helper_test_deploySphinxModuleProxy({
            _saltNonce: 1,
            _caller: address(this)
        });
        assertTrue(address(module1) != address(module2));
    }

    /////////////////////////// deploySphinxModuleProxyFromSafe //////////////////////////////////

    // Must revert if a contract already exists at the `CREATE2` address.
    function test_deploySphinxModuleProxyFromSafe_revert_alreadyDeployed() external {
        helper_test_deploySphinxModuleProxyFromSafe({ _saltNonce: 0 });

        vm.expectRevert("ERC1167: create2 failed");
        vm.prank(address(safeProxy));
        moduleProxyFactory.deploySphinxModuleProxyFromSafe({ _saltNonce: 0 });
    }

    // - Must:
    //   - Deploy an EIP-1167 proxy at the correct `CREATE2` address, using the `SphinxModule`
    //     implementation deployed in the `SphinxModuleProxyFactory`'s constructor.
    //   - Emit a `SphinxModuleProxyDeployed` event in the `SphinxModuleProxyFactory`.
    //   - Initialize the `SphinxModuleProxy` using the caller's address as the Gnosis Safe address.
    function test_deploySphinxModuleProxyFromSafe_success() external {
        helper_test_deploySphinxModuleProxyFromSafe({ _saltNonce: 0 });
    }

    // Must be possible to deploy more than one `SphinxModuleProxy` for a given Safe.
    function test_deploySphinxModuleProxyFromSafe_success_deployMultiple() external {
        SphinxModule module1 = helper_test_deploySphinxModuleProxyFromSafe({ _saltNonce: 0 });

        SphinxModule module2 = helper_test_deploySphinxModuleProxyFromSafe({ _saltNonce: 1 });
        assertTrue(address(module1) != address(module2));
    }

    ////////////////////////////// enableSphinxModuleProxyFromSafe ////////////////////////////

    // Must revert if not delegatecalled.
    function test_enableSphinxModuleProxyFromSafe_revert_mustBeDelegateCalled() external {
        vm.expectRevert("SphinxModuleProxyFactory: must be delegatecalled");
        moduleProxyFactory.enableSphinxModuleProxyFromSafe({ _saltNonce: 0 });
    }

    // A successful delegatecall must:
    // - Enable the `SphinxModuleProxy` as a module in the Gnosis Safe.
    function test_enableSphinxModuleProxyFromSafe_success() external {
        helper_test_enableSphinxModule({ _saltNonce: 0 });
    }

    // Must be possible to enable more than one `SphinxModuleProxy` for a given Safe.
    function test_enableSphinxModuleProxyFromSafe_success_enableMultiple() external {
        helper_test_enableSphinxModule({ _saltNonce: 0 });
        helper_test_enableSphinxModule({ _saltNonce: 1 });
    }

    /////////////////////////// computeSphinxModuleProxyAddress ////////////////////////

    // Must return the correct `CREATE2` address of a `SphinxModuleProxy` deployed by the
    // `SphinxModuleProxyFactory`.
    function test_computeSphinxModuleProxyAddress_success() external {
        address caller = address(0x1234);
        address expectedModuleAddress = moduleProxyFactory.computeSphinxModuleProxyAddress({
            _safeProxy: address(safeProxy),
            _caller: caller,
            _saltNonce: 0
        });
        assertEq(expectedModuleAddress.code.length, 0);

        SphinxModule moduleProxy = helper_test_deploySphinxModuleProxy({
            _saltNonce: 0,
            _caller: caller
        });

        assertGt(address(moduleProxy).code.length, 0);
        assertEq(address(moduleProxy), expectedModuleAddress);
    }

    //////////////////////////////////// Helper functions //////////////////////////////////////////

    function helper_test_deploySphinxModuleProxy(
        uint256 _saltNonce,
        address _caller
    ) internal returns (SphinxModule) {
        address expectedModuleAddress = moduleProxyFactory.computeSphinxModuleProxyAddress({
            _safeProxy: address(safeProxy),
            _caller: _caller,
            _saltNonce: _saltNonce
        });
        assertEq(expectedModuleAddress.code.length, 0);

        vm.expectEmit(address(moduleProxyFactory));
        emit SphinxModuleProxyDeployed(expectedModuleAddress, address(safeProxy));
        vm.prank(_caller);
        address moduleProxy = moduleProxyFactory.deploySphinxModuleProxy({
            _safeProxy: address(safeProxy),
            _saltNonce: _saltNonce
        });
        bytes memory expectedModuleProxyCode = abi.encodePacked(
            hex"363d3d373d3d3d363d73",
            moduleProxyFactory.SPHINX_MODULE_IMPL(),
            hex"5af43d82803e903d91602b57fd5bf3"
        );
        assertEq(moduleProxy.code, expectedModuleProxyCode);
        assertEq(moduleProxy, expectedModuleAddress);
        assertEq(address(SphinxModule(moduleProxy).safeProxy()), address(safeProxy));

        return SphinxModule(moduleProxy);
    }

    function helper_test_deploySphinxModuleProxyFromSafe(
        uint256 _saltNonce
    ) internal returns (SphinxModule) {
        address expectedModuleAddress = moduleProxyFactory.computeSphinxModuleProxyAddress({
            _safeProxy: address(safeProxy),
            _caller: address(safeProxy),
            _saltNonce: _saltNonce
        });
        assertEq(expectedModuleAddress.code.length, 0);

        vm.expectEmit(address(moduleProxyFactory));
        emit SphinxModuleProxyDeployed(expectedModuleAddress, address(safeProxy));
        vm.prank(address(safeProxy));
        moduleProxyFactory.deploySphinxModuleProxyFromSafe({ _saltNonce: _saltNonce });
        bytes memory expectedModuleProxyCode = abi.encodePacked(
            hex"363d3d373d3d3d363d73",
            moduleProxyFactory.SPHINX_MODULE_IMPL(),
            hex"5af43d82803e903d91602b57fd5bf3"
        );
        assertEq(expectedModuleAddress.code, expectedModuleProxyCode);
        assertEq(address(SphinxModule(expectedModuleAddress).safeProxy()), address(safeProxy));

        return SphinxModule(expectedModuleAddress);
    }

    function helper_test_enableSphinxModule(uint256 _saltNonce) internal {
        SphinxModule moduleProxy = helper_test_deploySphinxModuleProxyFromSafe({
            _saltNonce: _saltNonce
        });
        assertFalse(safeProxy.isModuleEnabled(address(moduleProxy)));

        // We enable the `SphinxModuleProxy` by creating a transaction that's signed by the Gnosis
        // Safe owners then executed within the Gnosis Safe. We can't shortcut this process by
        // pranking the Gnosis Safe then delegatecalling the `SphinxModuleProxyFactory` because
        // `address(this)` in the `SphinxModuleProxyFactory` will be the address of this test
        // contract, which will cause the delegatecall to fail. This is a byproduct of the fact that
        // Forge doesn't let us change `address(this)` in the scope of a Forge test. To change
        // `adddress(this)`, we must call another contract. So, we call the Gnosis Safe, which then
        // delegatecalls into the `SphinxModuleProxyFactory`.
        bytes memory encodedDelegateCall = abi.encodeWithSelector(
            moduleProxyFactory.enableSphinxModuleProxyFromSafe.selector,
            (_saltNonce)
        );
        GnosisSafeTransaction memory gnosisSafeTxn = GnosisSafeTransaction({
            to: address(moduleProxyFactory),
            value: 0,
            txData: encodedDelegateCall,
            operation: GnosisSafeOperation.DelegateCall,
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
            operation: Enum.Operation(uint8(gnosisSafeTxn.operation)),
            safeTxGas: gnosisSafeTxn.safeTxGas,
            signatures: ownerSignatures,
            // The following fields are for refunding the caller. We don't use them.
            baseGas: 0,
            gasPrice: 0,
            gasToken: address(0),
            refundReceiver: payable(address(0))
        });

        assertTrue(success);
        assertTrue(safeProxy.isModuleEnabled(address(moduleProxy)));
    }

    function computeSphinxModuleProxyAddress(
        address _safeProxy,
        address _caller,
        uint256 _saltNonce
    ) external view override returns (address) {}

    function deploySphinxModuleProxy(
        address _safeProxy,
        uint256 _saltNonce
    ) external override returns (address sphinxModule) {}

    function deploySphinxModuleProxyFromSafe(uint256 _saltNonce) external override {}

    function enableSphinxModuleProxyFromSafe(uint256 _saltNonce) external override {}

    function SPHINX_MODULE_IMPL() external view override returns (address) {}
}

contract SphinxModuleProxyFactory_GnosisSafe_L1_1_3_0_Test is
    AbstractSphinxModuleProxyFactory_Test
{
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxModuleProxyFactory_Test.setUp({
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
            _gnosisSafeSingleton: address(safeContracts.safeL1Singleton)
        });
    }
}

contract SphinxModuleProxyFactory_GnosisSafe_L2_1_3_0_Test is
    AbstractSphinxModuleProxyFactory_Test
{
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxModuleProxyFactory_Test.setUp({
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
            _gnosisSafeSingleton: address(safeContracts.safeL2Singleton)
        });
    }
}

contract SphinxModuleProxyFactory_GnosisSafe_L1_1_4_1_Test is
    AbstractSphinxModuleProxyFactory_Test
{
    function setUp() public {
        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        AbstractSphinxModuleProxyFactory_Test.setUp({
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
            _gnosisSafeSingleton: address(safeContracts.safeL1Singleton)
        });
    }
}

contract SphinxModuleProxyFactory_GnosisSafe_L2_1_4_1_Test is
    AbstractSphinxModuleProxyFactory_Test
{
    function setUp() public {
        GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
        AbstractSphinxModuleProxyFactory_Test.setUp({
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
            _gnosisSafeSingleton: address(safeContracts.safeL2Singleton)
        });
    }
}
