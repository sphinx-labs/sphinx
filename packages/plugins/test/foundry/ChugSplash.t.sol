// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Test.sol";
import "../../foundry-contracts/ChugSplash.sol";
import "../../contracts/Storage.sol";
import { SimpleStorage } from "../../contracts/SimpleStorage.sol";
import { Stateless } from "../../contracts/Stateless.sol";
import { ComplexConstructorArgs } from "../../contracts/ComplexConstructorArgs.sol";
import { ChugSplashRegistry } from "@chugsplash/contracts/contracts/ChugSplashRegistry.sol";
import { ChugSplashManager } from "@chugsplash/contracts/contracts/ChugSplashManager.sol";
import { Semver } from "@chugsplash/contracts/contracts/Semver.sol";
import { ChugSplashManagerProxy } from "@chugsplash/contracts/contracts/ChugSplashManagerProxy.sol";
import { IChugSplashManager } from "@chugsplash/contracts/contracts/interfaces/IChugSplashManager.sol";
import { IProxyAdapter } from "@chugsplash/contracts/contracts/interfaces/IProxyAdapter.sol";
import { IProxyUpdater } from "@chugsplash/contracts/contracts/interfaces/IProxyUpdater.sol";
import { IGasPriceCalculator } from "@chugsplash/contracts/contracts/interfaces/IGasPriceCalculator.sol";
import { ICreate3 } from "@chugsplash/contracts/contracts/interfaces/ICreate3.sol";

/* ChugSplash Foundry Library Tests
 *
 * These integration tests are intended to verify that the ChugSplash Foundry Library is properly interfacing with
 * the core ChugSplash library and contracts. We also include sanity check tests here that verify the variable encoding
 * and deployment process is working correctly.
 *
 * However, these tests are not designed to fully test the ChugSplash contracts. You can find the main ChugSplash contract tests here:
 * https://github.com/chugsplash/chugsplash/tree/develop/packages/contracts/test
 */

contract ChugSplashTest is Test {
    type UserDefinedType is uint256;

    address claimedProxy;
    address transferredProxy;
    Storage myStorage;
    SimpleStorage mySimpleStorage;
    SimpleStorage mySimpleStorage2;
    Stateless     myStateless;
    ComplexConstructorArgs myComplexConstructorArgs;
    ChugSplashRegistry registry;
    ChugSplash chugsplash;

    string deployConfig = "./chugsplash/foundry/deploy.t.js";

    bytes32 claimOrgID = keccak256('Claim test');
    string claimConfig = "./chugsplash/foundry/claim.t.js";

    bytes32 transferOrganizationID = keccak256('Transfer test');
    string transferConfig = "./chugsplash/foundry/transfer.t.js";

    struct SimpleStruct { bytes32 a; uint128 b; uint128 c; }

    function setUp() public {
        chugsplash = new ChugSplash();

        // Setup deployment test
        chugsplash.deploy(deployConfig, true);

        // Deploy export proxy test
        chugsplash.deploy(claimConfig, true);
        chugsplash.exportProxy(claimConfig, "MySimpleStorage", true);

        // Start export proxy test
        chugsplash.deploy(transferConfig, true);
        chugsplash.exportProxy(transferConfig, "MySimpleStorage", true);

        // Refresh EVM state to reflect chain state after ChugSplash transactions
        chugsplash.refresh();

        chugsplash.importProxy(transferConfig, chugsplash.getAddress(transferConfig, "MySimpleStorage"), true);
        claimedProxy = payable(chugsplash.getAddress(claimConfig, "MySimpleStorage"));
        transferredProxy = payable(chugsplash.getAddress(transferConfig, "MySimpleStorage"));
        myStorage = Storage(chugsplash.getAddress(deployConfig, "MyStorage"));
        mySimpleStorage = SimpleStorage(chugsplash.getAddress(deployConfig, "MySimpleStorage"));
        myStateless = Stateless(chugsplash.getAddress(deployConfig, "Stateless"));
        myComplexConstructorArgs = ComplexConstructorArgs(chugsplash.getAddress(deployConfig, "ComplexConstructorArgs"));

        registry = ChugSplashRegistry(chugsplash.getRegistryAddress());
    }

    function testDidexportProxy() public {
        assertEq(chugsplash.getEIP1967ProxyAdminAddress(claimedProxy), 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
    }

    function testDidImportProxy() public {
        ChugSplashManager manager = ChugSplashManager(registry.projects(transferOrganizationID));
        assertEq(chugsplash.getEIP1967ProxyAdminAddress(transferredProxy), address(manager));
    }

    function testDidClaim() public {
        assertTrue(address(registry.projects('Doesnt exist')) == address(0), "Unclaimed project detected");
        assertFalse(address(registry.projects(claimOrgID)) == address(0), "Claimed project was not detected");
    }

    function testDeployStatelessImmutableContract() public {
        assertEq(myStateless.hello(), 'Hello, world!');
        assertEq(myStateless.immutableUint(), 1);
    }

    function testDoesResolveReferenceToNonProxiedContract() public {
        assertEq(address(mySimpleStorage.myStateless()), address(myStateless));
        assertEq(mySimpleStorage.hello(), 'Hello, world!');
    }

    function testSetImmutableInt() public {
        assertEq(myStorage.immutableInt(), type(int256).min);
    }

    function testSetImmutableInt8() public {
        assertEq(myStorage.immutableInt8(), type(int8).min);
    }

    function testSetImmutableUint256() public {
        assertEq(myStorage.immutableUint(), type(uint256).max);
    }

    function testSetImmutableUint8() public {
        assertEq(myStorage.immutableUint8(), type(uint8).max);
    }

    function testSetImmutableBool() public {
        assertEq(myStorage.immutableBool(), true);
    }

    function testSetImmutableBytes32() public {
        assertEq(myStorage.immutableBytes32(), 0x1111111111111111111111111111111111111111111111111111111111111111);
    }

    function testSetImmutableUserDefinedType() public {
        assertEq(Storage.UserDefinedType.unwrap(myStorage.immutableUserDefinedType()), type(uint256).max);
    }

    function testSetImmutableBigNumberUint() public {
        assertEq(myStorage.immutableBigNumberUint(), type(uint256).max);
    }

    function testSetImmutableBigNumberInt() public {
        assertEq(myStorage.immutableBigNumberInt(), type(int256).min);
    }

    function testSetContractReference() public {
        assertEq(address(mySimpleStorage.myStorage()), address(myStorage));
    }

    function testSetMinInt256() public {
        assertEq(myStorage.minInt256(), type(int256).min);
    }

    function testSetMinInt8() public {
        assertEq(myStorage.minInt8(), type(int8).min);
    }

    function testSetBigNumberInt256() public {
        assertEq(myStorage.bigNumberInt256(), type(int256).max);
    }

    function testSetBigNumberInt8() public {
        assertEq(myStorage.bigNumberInt8(), type(int8).min);
    }

    function testSetBigNumberUint256() public {
        assertEq(myStorage.bigNumberUint256(), type(uint256).max);
    }

    function testSetBigNumberUint8() public {
        assertEq(myStorage.bigNumberUint8(), type(uint8).max);
    }

    function testSetMinUint8() public {
        assertEq(myStorage.uint8Test(), 255);
    }

    function testSetBool() public {
        assertEq(myStorage.boolTest(), true);
    }

    function testSetString() public {
        assertEq(myStorage.stringTest(), 'testString');
    }

    function testLongString() public {
        assertEq(myStorage.longStringTest(), 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz');
    }

    function testSetBytes() public {
        assertEq(myStorage.bytesTest(), hex"abcd1234");
    }

    function testSetUserDefinedType() public {
        assertEq(Storage.UserDefinedType.unwrap(myStorage.userDefinedTypeTest()), 1000000000000000000);
    }

    function testSetUserDefinedBytes() public {
        assertEq(Storage.UserDefinedBytes32.unwrap(myStorage.userDefinedBytesTest()), 0x1111111111111111111111111111111111111111111111111111111111111111);
    }

    function testSetUserDefinedInt() public {
        assertEq(Storage.UserDefinedInt.unwrap(myStorage.userDefinedInt()),  type(int256).min);
    }

    function testSetUserDefinedInt8() public {
        assertEq(Storage.UserDefinedInt8.unwrap(myStorage.userDefinedInt8()), type(int8).min);
    }

    function testSetUserDefinedUint8() public {
        assertEq(Storage.UserDefinedUint8.unwrap(myStorage.userDefinedUint8()), 255);
    }

    function testSetUserDefinedBool() public {
        assertEq(Storage.UserDefinedBool.unwrap(myStorage.userDefinedBool()), true);
    }

    function testSetUserDefinedBigNumberInt() public {
        assertEq(Storage.UserDefinedInt.unwrap(myStorage.userDefinedBigNumberInt()), 0);
    }

    function testSetStringToUserDefinedTypeMapping() public {
        (Storage.UserDefinedType a) = myStorage.stringToUserDefinedMapping('testKey');
        assertEq(Storage.UserDefinedType.unwrap(a), 1000000000000000000);
    }

    function testSetUserDefinedTypeToStringMapping() public {
        assertEq(myStorage.userDefinedToStringMapping(Storage.UserDefinedType.wrap(1000000000000000000)), 'testVal');
    }

    function testSetComplexStruct() public {
        (int32 a, Storage.UserDefinedType c) = myStorage.complexStruct();
        assertEq(a, 4);
        assertEq(Storage.UserDefinedType.unwrap(c), 1000000000000000000);
        assertEq(myStorage.getComplexStructMappingVal(5), 'testVal');
    }

    function testSetUserDefinedFixedArray() public {
        uint64[2] memory uintFixedArray = [1000000000000000000, 1000000000000000000];
        for (uint i = 0; i < uintFixedArray.length; i++) {
            assertEq(Storage.UserDefinedType.unwrap(myStorage.userDefinedFixedArray(i)), uintFixedArray[i]);
        }
    }

    function testSetUserDefinedNestedArray() public {
        uint64[2][2] memory nestedArray = [
            [1000000000000000000, 1000000000000000000],
            [1000000000000000000, 1000000000000000000]
        ];

        for (uint i = 0; i < nestedArray.length; i++) {
            for (uint j = 0; j < nestedArray[i].length; j++) {
                assertEq(Storage.UserDefinedType.unwrap(myStorage.userDefinedFixedNestedArray(i, j)), nestedArray[i][j]);
            }
        }
    }

    function testSetUserDefinedDynamicArray() public {
        uint64[3] memory uintDynamicArray = [1000000000000000000, 1000000000000000000, 1000000000000000000];
        for (uint i = 0; i < uintDynamicArray.length; i++) {
            assertEq(Storage.UserDefinedType.unwrap(myStorage.userDefinedDynamicArray(i)), uintDynamicArray[i]);
        }
    }

    function testSetLongBytes() public {
        assertEq(myStorage.longBytesTest(), hex"123456789101112131415161718192021222324252627282930313233343536373839404142434445464");
    }

    function testSetContract() public {
        assertEq(address(myStorage.contractTest()), 0x1111111111111111111111111111111111111111);
    }

    function testSetEnum() public {
        assertEq(uint(myStorage.enumTest()), 1);
    }

    function testSetBigNumberEnum() public {
        assertEq(uint(myStorage.bigNumberEnumTest()), 1);
    }

    function testSetStruct() public {
        (bytes32 a, uint128 b, uint128 c) = myStorage.simpleStruct();
        assertEq(a, hex"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        assertEq(b, 12345);
        assertEq(c, 54321);
    }

    function testSetStringToStringMapping() public {
        assertEq(myStorage.stringToStringMapping('testKey'), 'testVal');
    }

    function testSetStringToUintMapping() public {
        assertEq(myStorage.stringToUint256Mapping('testKey'), 12341234);
    }

    function testSetStringToBoolMapping() public {
        assertEq(myStorage.stringToBoolMapping('testKey'), true);
    }

    function testSetStringToAddressMapping() public {
        assertEq(myStorage.stringToAddressMapping('testKey'), 0x1111111111111111111111111111111111111111);
    }

    function testSetStringToStructMapping() public {
        (bytes32 a, uint128 b, uint128 c) = myStorage.stringToStructMapping('testKey');
        assertEq(a, hex"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        assertEq(b, 12345);
        assertEq(c, 54321);
    }

    function testSetLongStringMappingtoLongString() public {
        string memory key = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz';
        assertEq(myStorage.longStringToLongStringMapping(key), key);
    }

    function testSetUint64FixedSizeArray() public {
        uint16[5] memory expectedValues = [1, 10, 100, 1_000, 10_000];
        for (uint i = 0; i < 5; i++) {
            assertEq(myStorage.uint64FixedArray(i), expectedValues[i]);
        }
    }

    function testSetUint64MixedTypesArray() public {
        uint16[5] memory expectedValues = [1, 10, 100, 1_000, 10_000];
        for (uint i = 0; i < 5; i++) {
            assertEq(myStorage.mixedTypesUint64FixedArray(i), expectedValues[i]);
        }
    }

    function testSetUint128FixedSizeNestedArray() public {
        uint8[5][6] memory nestedArray = [
            [1, 2, 3, 4, 5],
            [6, 7, 8, 9, 10],
            [11, 12, 13, 14, 15],
            [16, 17, 18, 19, 20],
            [21, 22, 23, 24, 25],
            [26, 27, 28, 29, 30]
        ];
        for (uint i = 0; i < nestedArray.length; i++) {
            for (uint j = 0; j < nestedArray[i].length; j++) {
                assertEq(myStorage.uint128FixedNestedArray(i, j), nestedArray[i][j]);
            }
        }
    }

    function testSetUint64FixedSizeMultiNestedArray() public {
        uint8[2][2][2] memory multiNestedArray = [
            [[1, 2], [3, 4]],
            [[5, 6], [7, 8]]
        ];

        for (uint i = 0; i < multiNestedArray.length; i++) {
            for (uint j = 0; j < multiNestedArray[i].length; j++) {
                for (uint k = 0; k < multiNestedArray[i][j].length; k++) {
                    assertEq(myStorage.uint64FixedMultiNestedArray(i, j, k), multiNestedArray[i][j][k]);
                }
            }
        }
    }

    function testSetInt64DynamicArray() public {
        int24[7] memory int64DynamicArray = [-5, 50, -500, 5_000, -50_000, 500_000, -5_000_000];
        for (uint i = 0; i < int64DynamicArray.length; i++) {
            assertEq(myStorage.int64DynamicArray(i), int64DynamicArray[i]);
        }
    }

    function testSetDynamicSimpleStructArray() public {
        SimpleStruct[3] memory structArray = [
            SimpleStruct(hex'abababababababababababababababababababababababababababababababab', 12345, 54321),
            SimpleStruct(hex'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd', 100_000_000, 999_999_999),
            SimpleStruct(hex'efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef', 56789, 98765)
        ];

        for (uint i = 0; i < structArray.length; i++) {
            (bytes32 a, uint128 b, uint128 c) = myStorage.simpleStructDynamicArray(i);
            assertEq(a, structArray[i].a);
            assertEq(b, structArray[i].b);
            assertEq(c, structArray[i].c);
        }
    }

    function testSetUint256MappingToString() public {
        assertEq(myStorage.uint256ToStringMapping(12341234), 'testVal');
    }

    function testSetUint8MappingToString() public {
        assertEq(myStorage.uint8ToStringMapping(255), 'testVal');
    }

    function testSetUint128MappingToString() public {
        assertEq(myStorage.uint128ToStringMapping(1234), 'testVal');
    }

    function testSetStringToBigNumberUintMapping() public {
        assertEq(myStorage.stringToBigNumberUintMapping('testKey'), 1234);
    }

    function testSetInt256MappingToString() public {
        assertEq(myStorage.int256ToStringMapping(-1), 'testVal');
    }


    function testSetInt8MappingToString() public {
        assertEq(myStorage.int8ToStringMapping(-10), 'testVal');
    }

    function testSetInt128MappingToString() public {
        assertEq(myStorage.int128ToStringMapping(-1234), 'testVal');
    }

    function testSetAddressMappingToString() public {
        assertEq(myStorage.addressToStringMapping(0x1111111111111111111111111111111111111111), 'testVal');
    }

    function testSetBytesMappingToString() public {
        assertEq(myStorage.bytesToStringMapping(hex"abcd1234"), 'testVal');
    }

    function testSetNestedStringMapping() public {
        assertEq(myStorage.nestedMapping('testKey', 'nestedKey'), 'nestedVal');
    }

    function testSetMultiNestedMapping() public {
        assertEq(myStorage.multiNestedMapping(1, 'testKey', 0x1111111111111111111111111111111111111111), 2);
    }

    function testSetMutableStringConstructorArg() public {
        assertEq(myComplexConstructorArgs.str(), 'testString');
    }

    function testSetMutableDyanmicBytesConstructorArg() public {
        assertEq(myComplexConstructorArgs.dynamicBytes(), hex"abcd1234");
    }

    function testSetMutableUint64FixedArrayConstructorArg() public {
        uint16[5] memory uint64FixedArray = [1, 10, 100, 1_000, 10_000];
        for (uint i = 0; i < uint64FixedArray.length; i++) {
            assertEq(myComplexConstructorArgs.uint64FixedArray(i), uint64FixedArray[i]);
        }
    }

    function testSetMutableInt64DynamicArrayConstructorArg() public {
        int24[7] memory int64DynamicArray = [-5, 50, -500, 5_000, -50_000, 500_000, -5_000_000];
        for (uint i = 0; i < int64DynamicArray.length; i++) {
            assertEq(myComplexConstructorArgs.int64DynamicArray(i), int64DynamicArray[i]);
        }
    }

    function testSetMutableUint64FixedNestedArrayConstructorArg() public {
        uint8[5][6] memory uint64FixedNestedArray = [
            [1, 2, 3, 4, 5],
            [6, 7, 8, 9, 10],
            [11, 12, 13, 14, 15],
            [16, 17, 18, 19, 20],
            [21, 22, 23, 24, 25],
            [26, 27, 28, 29, 30]
        ];
        for (uint i = 0; i < uint64FixedNestedArray.length; i++) {
            for (uint j = 0; j < uint64FixedNestedArray[i].length; j++) {
                assertEq(myComplexConstructorArgs.uint64FixedNestedArray(i, j), uint64FixedNestedArray[i][j]);
            }
        }
    }

    function testSetMutableUint64DynamicMultinestedArrayConstructorArg() public {
        uint8[3][2][3] memory uint64DynamicMultiNestedArray = [
            [
                [1, 2, 3],
                [4, 5, 6]
            ],
            [
                [7, 8, 9],
                [10, 11, 12]
            ],
            [
                [13, 14, 15],
                [16, 17, 18]
            ]
        ];

        for (uint i = 0; i < uint64DynamicMultiNestedArray.length; i++) {
            for (uint j = 0; j < uint64DynamicMultiNestedArray[i].length; j++) {
                for (uint k = 0; k < uint64DynamicMultiNestedArray[i][j].length; k++) {
                    assertEq(myComplexConstructorArgs.uint64DynamicMultiNestedArray(i, j, k), uint64DynamicMultiNestedArray[i][j][k]);
                }
            }
        }
    }
}
