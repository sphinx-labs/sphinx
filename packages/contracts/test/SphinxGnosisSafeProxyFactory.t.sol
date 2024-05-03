// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { SphinxModuleProxyFactory } from "../contracts/core/SphinxModuleProxyFactory.sol";
import { ISphinxGnosisSafeProxyFactory } from "../contracts/core/interfaces/ISphinxGnosisSafeProxyFactory.sol";
import { SphinxGnosisSafeProxyFactory } from "../contracts/core/SphinxGnosisSafeProxyFactory.sol";
import "./TestUtils.t.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

contract AbstractSphinxGnosisProxyFactory_Test is TestUtils, ISphinxGnosisSafeProxyFactory {
    address[] owners = [address(0x1111), address(0x2222), address(0x3333)];
    uint256 threshold = 2;

    address multiSend;
    SphinxModuleProxyFactory moduleProxyFactory;
    SphinxGnosisSafeProxyFactory safeProxyFactory;
    address compatibilityFallbackHandler;
    address safeSingleton;
    bytes safeProxyInitCode;

    function setUp(
        address _multiSend,
        address _compatibilityFallbackHandler,
        address _safeSingleton,
        bytes memory _safeProxyInitCode
    ) internal {
        moduleProxyFactory = new SphinxModuleProxyFactory();
        safeProxyFactory = new SphinxGnosisSafeProxyFactory(address(moduleProxyFactory));

        multiSend = _multiSend;
        compatibilityFallbackHandler = _compatibilityFallbackHandler;
        safeSingleton = _safeSingleton;
        safeProxyInitCode = _safeProxyInitCode;
    }

    function test_deployThenEnable_success_zeroSaltNonce() external {
        helper_test_deployThenEnable({_saltNonce: 0});
    }

    function test_deployThenEnable_success_nonzeroSaltNonce() external {
        helper_test_deployThenEnable({_saltNonce: 1});
    }

    // function test_deployThenEnable_success_

    // TODO: caller's address does not impact deployed addresses. (add this as a high-level
    // invariant?)

    // // TODO(docs): singleton isn't deployed
    // function test_TODO2() external {
    //     uint256 saltNonce = 0;

    //     GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
    //     // TODO(later): why do we need to do uint256(...)? oh, it's because we always need to abi
    //     // encode the constructor arg(s).
    //     bytes memory safeInitCode = abi.encodePacked(
    //         type(GnosisSafeProxy_1_3_0).creationCode,
    //         uint256(uint160(address(safeContracts.safeL1Singleton)))
    //     );

    //     bytes memory safeInitializerData = makeGnosisSafeInitializerData({
    //         _moduleProxyFactory: moduleProxyFactory,
    //         _saltNonce: saltNonce,
    //         _owners: owners,
    //         _threshold: threshold,
    //         _multiSend: address(safeContracts.multiSend),
    //         _fallbackHandler: address(safeContracts.compatibilityFallbackHandler)
    //     });

    //     vm.etch(address(safeContracts.safeL1Singleton), hex"");

    //     safeProxyFactory.deployThenEnable({
    //         _initCode: safeInitCode,
    //         _initializer: safeInitializerData,
    //         _saltNonce: saltNonce
    //     });
    // }

    function helper_test_deployThenEnable(uint256 _saltNonce) internal returns (address safeProxy, address moduleProxy) {
        bytes memory safeInitCodeWithArgs = abi.encodePacked(
            safeProxyInitCode,
            abi.encode(safeSingleton)
        );
        bytes memory safeInitializerData = makeGnosisSafeInitializerData({
            _moduleProxyFactory: moduleProxyFactory,
            _saltNonce: _saltNonce,
            _owners: owners,
            _threshold: threshold,
            _multiSend: multiSend,
            _fallbackHandler: compatibilityFallbackHandler
        });
        bytes32 salt = keccak256(abi.encodePacked(keccak256(safeInitializerData), _saltNonce));
        safeProxy = Create2.computeAddress({salt: salt, bytecodeHash: keccak256(safeInitCodeWithArgs), deployer: address(safeProxyFactory)});
        moduleProxy = moduleProxyFactory.computeSphinxModuleProxyAddress(
            safeProxy,
            safeProxy,
            _saltNonce
        );

        vm.assertEq(safeProxy.code.length, 0);
        vm.assertEq(moduleProxy.code.length, 0);

        vm.expectEmit(address(safeProxyFactory));
        emit DeployedGnosisSafeWithSphinxModule(address(safeProxy), moduleProxy, _saltNonce);

        safeProxyFactory.deployThenEnable({
            _initCode: safeInitCodeWithArgs,
            _initializer: safeInitializerData,
            _saltNonce: _saltNonce
        });

        GnosisSafe_1_3_0 safe = GnosisSafe_1_3_0(payable(safeProxy));

        address[] memory actualOwners = safe.getOwners();
        uint256 actualThreshold = safe.getThreshold();

        vm.assertGt(safeProxy.code.length, 0);
        vm.assertGt(moduleProxy.code.length, 0);
        vm.assertTrue(safe.isModuleEnabled(moduleProxy));

        vm.assertEq(actualThreshold, threshold);
        vm.assertEq(owners.length, actualOwners.length);
        for (uint256 i = 0; i < actualOwners.length; i++) {
            vm.assertEq(actualOwners[i], owners[i]);
        }
    }
}

contract SphinxGnosisProxyFactory_GnosisSafe_L1_1_3_0_Test is
    AbstractSphinxGnosisProxyFactory_Test
{
    function setUp() public {
        GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
        AbstractSphinxGnosisProxyFactory_Test.setUp({
            _multiSend: address(safeContracts.multiSend),
            _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
            _safeSingleton: address(safeContracts.safeL1Singleton),
            _safeProxyInitCode: getGnosisSafeProxyInitCode_1_3_0()
        });
    }
}

// contract SphinxGnosisProxyFactory_GnosisSafe_L2_1_3_0_Test is
//     AbstractSphinxGnosisProxyFactory_Test
// {
//     function setUp() public {
//         GnosisSafeContracts_1_3_0 memory safeContracts = deployGnosisSafeContracts_1_3_0();
//         AbstractSphinxGnosisProxyFactory_Test.setUp({
//             _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
//             _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
//             _gnosisSafeSingleton: address(safeContracts.safeL2Singleton)
//         });
//     }
// }

// contract SphinxGnosisProxyFactory_GnosisSafe_L1_1_4_1_Test is
//     AbstractSphinxGnosisProxyFactory_Test
// {
//     function setUp() public {
//         GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
//         AbstractSphinxGnosisProxyFactory_Test.setUp({
//             _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
//             _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
//             _gnosisSafeSingleton: address(safeContracts.safeL1Singleton)
//         });
//     }
// }

// contract SphinxGnosisProxyFactory_GnosisSafe_L2_1_4_1_Test is
//     AbstractSphinxGnosisProxyFactory_Test
// {
//     function setUp() public {
//         GnosisSafeContracts_1_4_1 memory safeContracts = deployGnosisSafeContracts_1_4_1();
//         AbstractSphinxGnosisProxyFactory_Test.setUp({
//             _compatibilityFallbackHandler: address(safeContracts.compatibilityFallbackHandler),
//             _gnosisSafeProxyFactory: address(safeContracts.safeProxyFactory),
//             _gnosisSafeSingleton: address(safeContracts.safeL2Singleton)
//         });
//     }
// }

// TODO(later): check the SphinxMOduleProxyFactory.t.sol file. e.g. use all four Gnosis Safe
// versions.
