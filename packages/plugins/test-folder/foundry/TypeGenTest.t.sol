// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.0;

// import { TypeGenTestConfig } from "../../script/TypeGenTest.s.sol";
// import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
// import { MyTypeLibrary } from "../../contracts/test/typegen/imports/Types.sol";
// import { MyTypeContract } from "../../contracts/test/typegen/imports/Types.sol";
// import {
//     MyTopLevelType,
//     MyTopLevelStruct,
//     MyTopLevelEnum
// } from "../../contracts/test/typegen/imports/Types.sol";
// import {
//     MyLocalType,
//     MyLocalStruct,
//     MyLocalEnum
// } from "../../contracts/test/typegen/imports/NoAlias.sol";
// import {
//     MyTypeLibrary as MyTypeLibraryAlias
// } from "../../contracts/test/typegen/imports/Types.sol";
// import {
//     MyTypeContract as MyTypeContractAlias
// } from "../../contracts/test/typegen/imports/Types.sol";
// import {
//     MyTopLevelType as MyTopLevelTypeAlias,
//     MyTopLevelStruct as MyTopLevelStructAlias,
//     MyTopLevelEnum as MyTopLevelEnumAlias
// } from "../../contracts/test/typegen/imports/Types.sol";
// import { LocalParentTypes } from "../../contracts/test/typegen/imports/LocalParent.sol";
// import {
//     MyLocalTypeLibrary,
//     MyLocalTypeContract
// } from "../../contracts/test/typegen/imports/LocalParent.sol";
// import { MyImportContract } from "../../contracts/test/typegen/contractInputs/ImportContract.sol";
// import { LocalContract } from "../../contracts/test/typegen/contractInputs/FunctionContract.sol";
// import {
//     FunctionContractClient
// } from "../../SphinxClient/typegen/contractInputs/FunctionContract.SphinxClient.sol";
// import {
//     ExternalContract
// } from "../../testExternalContracts/ExternalContract.sol";

// import { ConflictingType } from "../../contracts/test/typegen/conflictingTypeNames/First.sol";
// import { ConflictingEnum } from "../../contracts/test/typegen/conflictingTypeNames/First.sol";
// import { ConflictingType as TypegenConflictingNameContractsSecond_ConflictingType } from "../../contracts/test/typegen/conflictingTypeNames/Second.sol";
// import { ConflictingEnum as TypegenConflictingNameContractsSecond_ConflictingEnum } from "../../contracts/test/typegen/conflictingTypeNames/Second.sol";
// import { ConflictingStruct } from "../../contracts/test/typegen/conflictingTypeNames/First.sol";

// import "forge-std/Test.sol";

// contract TypeGenTest is Test, TypeGenTestConfig {
//     ExternalContract myPredeployedExternalContract;

//     function map(uint256 value) external pure returns (uint256) {
//         return 2 * value;
//     }

//     function setUp() public {
//         // Deploy an external contract ahead of time so we can later define an interact with it
//         myPredeployedExternalContract = new ExternalContract(5);
//         alreadyDeployedContractAddress = address(myPredeployedExternalContract);
//         deploy(Network.anvil);
//     }

//     // Covers deploying contracts with conflicting names
//     function testDidGenerateAndDeployContractsWithConflictingNames() public {
//         assertEq(firstConflictingNameContract.number(), 5);
//         assertEq(secondConflictingNameContract.addr(), address(5));
//     }

//     // Covers using basic types to deploy contracts
//     function testDidDeployContractWithBasicInputTypes() public {
//         // Check values were set correctly in the constructor
//         assertEq(basicInputTypes.myUint8(), 1);
//         assertEq(basicInputTypes.myUint(), 2);
//         assertEq(basicInputTypes.myInt64(), 3);
//         assertEq(basicInputTypes.myInt(), 4);
//         assertEq(basicInputTypes.myAddress(), address(5));
//         assertEq(basicInputTypes.myBytes32(), keccak256("6"));
//         assertEq(basicInputTypes.myBytes(), bytes("hello"));
//         assertEq(basicInputTypes.myBool(), true);
//         assertEq(basicInputTypes.myString(), "world");
//     }

//     // Covers using basic types as function inputs
//     function testDidCallFunctionWithBasicInputTypes() public {
//         assertEq(basicInputTypesTwo.myUint8(), 2);
//         assertEq(basicInputTypesTwo.myUint(), 3);
//         assertEq(basicInputTypesTwo.myInt64(), 4);
//         assertEq(basicInputTypesTwo.myInt(), 5);
//         assertEq(basicInputTypesTwo.myAddress(), address(6));
//         assertEq(basicInputTypesTwo.myBytes32(), keccak256("7"));
//         assertEq(basicInputTypesTwo.myBytes(), bytes("goodbye"));
//         assertEq(basicInputTypesTwo.myBool(), false);
//         assertEq(basicInputTypesTwo.myString(), "world");
//     }

//     // Covers returning all of the basic types from a pure function
//     function testDidReturnBasicTypesFromPureFunction() public {
//         (
//             uint8 myUint8,
//             uint myUint,
//             int64 myInt64,
//             int myInt,
//             address myAddress,
//             bytes32 myBytes32,
//             bytes memory myBytes,
//             bool myBool,
//             string memory myString
//         ) = basicInputTypes.returnValues();
//         assertEq(myUint8, 6);
//         assertEq(myUint, 5);
//         assertEq(myInt64, 4);
//         assertEq(myInt, 3);
//         assertEq(myAddress, address(2));
//         assertEq(myBytes32, keccak256("1"));
//         assertEq(myBytes, bytes("pure"));
//         assertEq(myBool, true);
//         assertEq(myString, "function");
//     }

//     // Covers using all of the basic immutable constructor args
//     function testDidDeployContractWithImmutableInputTypes() public {
//         assertEq(immutableInputTypes.myUint8(), 1);
//         assertEq(immutableInputTypes.myUint(), 2);
//         assertEq(immutableInputTypes.myInt64(), 3);
//         assertEq(immutableInputTypes.myInt(), 4);
//         assertEq(immutableInputTypes.myAddress(), address(5));
//         assertEq(immutableInputTypes.myBytes32(), keccak256("6"));
//         assertEq(immutableInputTypes.myBool(), true);
//     }

//     // Covers using array types to deploy contracts
//     function testDidDeployContractWithArrayInputs() public {
//         assertEq(arrayInputTypes.myUintDynamicArray(0), intialUintDynamicArray[0]);
//         assertEq(arrayInputTypes.myUintDynamicArray(1), intialUintDynamicArray[1]);
//         assertEq(
//             arrayInputTypes.myUintNestedDynamicArray(0, 0),
//             initialUintNestedDynamicArray[0][0]
//         );
//         assertEq(
//             arrayInputTypes.myUintNestedDynamicArray(0, 1),
//             initialUintNestedDynamicArray[0][1]
//         );
//         assertEq(
//             arrayInputTypes.myUintNestedDynamicArray(1, 0),
//             initialUintNestedDynamicArray[1][0]
//         );
//         assertEq(
//             arrayInputTypes.myUintNestedDynamicArray(1, 1),
//             initialUintNestedDynamicArray[1][1]
//         );
//         assertEq(arrayInputTypes.myUintStaticArray(0), initialUintStaticArray[0]);
//         assertEq(arrayInputTypes.myUintStaticArray(1), initialUintStaticArray[1]);
//         assertEq(arrayInputTypes.myUintStaticArray(2), initialUintStaticArray[2]);
//     }

//     // Covers using array types as function inputs
//     function testDidCallFunctionWithArrayInputs() public {
//         assertEq(arrayInputTypesTwo.myUintDynamicArray(0), updatedUintDynamicArray[0]);
//         assertEq(arrayInputTypesTwo.myUintDynamicArray(1), updatedUintDynamicArray[1]);
//         assertEq(
//             arrayInputTypesTwo.myUintNestedDynamicArray(0, 0),
//             updatedUintNestedDynamicArray[0][0]
//         );
//         assertEq(
//             arrayInputTypesTwo.myUintNestedDynamicArray(0, 1),
//             updatedUintNestedDynamicArray[0][1]
//         );
//         assertEq(
//             arrayInputTypesTwo.myUintNestedDynamicArray(1, 0),
//             updatedUintNestedDynamicArray[1][0]
//         );
//         assertEq(
//             arrayInputTypesTwo.myUintNestedDynamicArray(1, 1),
//             updatedUintNestedDynamicArray[1][1]
//         );
//         assertEq(arrayInputTypesTwo.myUintStaticArray(0), updatedUintStaticArray[0]);
//         assertEq(arrayInputTypesTwo.myUintStaticArray(1), updatedUintStaticArray[1]);
//         assertEq(arrayInputTypesTwo.myUintStaticArray(2), updatedUintStaticArray[2]);
//     }

//     // Covers returning array types from pure functions
//     function testDidReturnArrayTypesFromPureFunction() public {
//         (
//             uint8[] memory myUintDynamicArray,
//             bytes32[][] memory myUintNestedDynamicArray,
//             address[3] memory myUintStaticArray
//         ) = arrayInputTypes.returnValues();
//         assertEq(myUintDynamicArray[0], intialUintDynamicArray[0]);
//         assertEq(myUintDynamicArray[1], intialUintDynamicArray[1]);
//         assertEq(myUintNestedDynamicArray[0][0], initialUintNestedDynamicArray[0][0]);
//         assertEq(myUintNestedDynamicArray[0][1], initialUintNestedDynamicArray[0][1]);
//         assertEq(myUintNestedDynamicArray[1][0], initialUintNestedDynamicArray[1][0]);
//         assertEq(myUintNestedDynamicArray[1][1], initialUintNestedDynamicArray[1][1]);
//         assertEq(myUintStaticArray[0], initialUintStaticArray[0]);
//         assertEq(myUintStaticArray[1], initialUintStaticArray[1]);
//         assertEq(myUintStaticArray[2], initialUintStaticArray[2]);
//     }

//     // Covers deploying contracts with conflicting User defined types, structs, and enums as
//     // constructor args. Also covers that these types work properly in constructors.
//     function testDidDeployContractsWithConflictingInputTypeNames() public {
//         assertEq(ConflictingType.unwrap(conflictingTypeNameContractFirst.conflictingType()), true);
//         (bool a1) = conflictingTypeNameContractFirst.conflictingStruct();
//         assertEq(a1, true);
//         assertEq(
//             uint(conflictingTypeNameContractFirst.conflictingEnum()),
//             uint(ConflictingEnum.Third)
//         );

//         assertEq(TypegenConflictingNameContractsSecond_ConflictingType.unwrap(
//             conflictingTypeNameContractSecond.conflictingType()
//         ), 1);
//         (uint a2) = conflictingTypeNameContractSecond.conflictingStruct();
//         assertEq(a2, 1);
//         assertEq(
//             uint(conflictingTypeNameContractSecond.conflictingEnum()),
//             uint(TypegenConflictingNameContractsSecond_ConflictingEnum.Second)
//         );
//     }

//     // Covers using User defined types, structs, and enums as function inputs
//     function testDidCallFunctionWithUserDefinedTypes() public {
//         assertEq(ConflictingType.unwrap(conflictingTypeNameContractFirstTwo.conflictingType()), false);
//         (bool a1) = conflictingTypeNameContractFirstTwo.conflictingStruct();
//         assertEq(a1, false);
//         assertEq(
//             uint(conflictingTypeNameContractFirstTwo.conflictingEnum()),
//             uint(ConflictingEnum.Second)
//         );

//     }

//     // Covers returning User defined types, structs, and enums from pure functions
//     function testDidReturnUserDefinedTypesFromPureFunction() public {
//         (ConflictingType a, ConflictingStruct memory b, ConflictingEnum c) = conflictingTypeNameContractClient.pureConflictingTypes();
//         assertEq(ConflictingType.unwrap(a), true);
//         assertEq(b.a, true);
//         assertEq(uint(c), uint(ConflictingEnum.First));
//     }

//     // Covers importing a user defined type from a remote file
//     function testDidImportUserDefinedType() public {
//         assertEq(uint(noAliasImports.topLevelEnum()), uint(MyTopLevelEnum.TopLevel));
//         bool a3 = noAliasImports.topLevelStruct();
//         assertEq(a3, true);
//         assertEq(MyTopLevelType.unwrap(noAliasImports.topLevelType()), true);
//     }

//     // Covers importing a user defined type with a parent object
//     function testDidImportUserDefinedTypeWithParent() public {
//         // Library
//         assertEq(uint(noAliasImports.libraryEnum()), uint(MyTypeLibrary.MyEnumInLibrary.Library));
//         uint8 a1 = noAliasImports.libraryStruct();
//         assertEq(a1, 1);
//         assertEq(MyTypeLibrary.MyTypeInLibrary.unwrap(noAliasImports.libraryType()), 2);

//         // Contract
//         assertEq(
//             uint(noAliasImports.contractEnum()),
//             uint(MyTypeContract.MyEnumInContract.Contract)
//         );
//         bytes32 a2 = noAliasImports.contractStruct();
//         assertEq(a2, keccak256("3"));
//         assertEq(
//             MyTypeContract.MyTypeInContract.unwrap(noAliasImports.contractType()),
//             keccak256("4")
//         );
//     }

//     // Covers importing a user defined type that is defined locally
//     function testDidImportUserDefinedTypeDefinedLocally() public {
//         assertEq(uint(noAliasImports.localEnum()), uint(MyLocalEnum.Local));
//         int8 a4 = noAliasImports.localStruct();
//         assertEq(a4, -1);
//         assertEq(MyLocalType.unwrap(noAliasImports.localType()), -2);
//     }

//     // Covers importing a user defined type from a remote type with an alias
//     function testDidImportUserDefinedTypeWithAlias() public {
//         assertEq(uint(aliasImports.topLevelEnum()), uint(MyTopLevelEnumAlias.TopLevel));
//         bool a3 = aliasImports.topLevelStruct();
//         assertEq(a3, true);
//         assertEq(MyTopLevelTypeAlias.unwrap(aliasImports.topLevelType()), true);
//     }

//     // Covers importing a user defined type with a parent object that is imported with an alias
//     function testDidImportUserDefinedTypeWithAliasedParent() public {
//         // Library
//         assertEq(
//             uint(noAliasImports.libraryEnum()),
//             uint(MyTypeLibraryAlias.MyEnumInLibrary.Library)
//         );
//         uint8 a1 = noAliasImports.libraryStruct();
//         assertEq(a1, 1);
//         assertEq(MyTypeLibraryAlias.MyTypeInLibrary.unwrap(noAliasImports.libraryType()), 2);

//         // Contract
//         assertEq(
//             uint(noAliasImports.contractEnum()),
//             uint(MyTypeContractAlias.MyEnumInContract.Contract)
//         );
//         bytes32 a2 = noAliasImports.contractStruct();
//         assertEq(a2, keccak256("3"));
//         assertEq(
//             MyTypeContractAlias.MyTypeInContract.unwrap(noAliasImports.contractType()),
//             keccak256("4")
//         );
//     }

//     // Covers importing a user defined type that is defined locally, but with a parent object
//     // struct, enum, user defined type
//     // both library and contract
//     function testDidImportUserDefinedTypeDefinedLocallyAndWithinParent() public {
//         // Library
//         assertEq(
//             uint(localParentTypes.libraryEnum()),
//             uint(MyLocalTypeLibrary.MyEnumInLibrary.Library)
//         );
//         bool a1 = localParentTypes.libraryStruct();
//         assertEq(a1, true);
//         assertEq(MyLocalTypeLibrary.MyTypeInLibrary.unwrap(localParentTypes.libraryType()), true);

//         // Contract
//         assertEq(
//             uint(localParentTypes.contractEnum()),
//             uint(MyLocalTypeContract.MyEnumInContract.Contract)
//         );
//         bytes32 a2 = localParentTypes.contractStruct();
//         assertEq(a2, keccak256("1"));
//         assertEq(
//             MyLocalTypeContract.MyTypeInContract.unwrap(localParentTypes.contractType()),
//             keccak256("2")
//         );
//     }

//     // Covers importing a contract and using it as input for a constructor
//     function testDidDeployContractWithInputImportedContractAsAddress() public {
//         assertEq(functionContract.importContract().number(), 1);
//     }

//     // Covers defining a contract locally and using it as input for a constructor
//     function testDidDepoyContractWithInputLocalContractAsAddress() public {
//         assertEq(functionContract.localContract().number(), 1);
//     }

//     // Covers importing a contract and using it as input for a function call
//     function testDidCallFunctionWithInputImportedContractAsAddress() public {
//         assertEq(functionContractTwo.importContract().number(), 2);
//     }

//     // Covers defining a contract locally and using it as input for a function
//     function testDidCallFunctionWithInputLocalContractAsAddress() public {
//         assertEq(functionContractTwo.localContract().number(), 2);
//     }

//     // Covers returning a contract from a pure function
//     function testDidReturnContractAsAddressFromPureFunction() public {
//         assertEq(
//             FunctionContractClient(address(functionContract)).fetchImportContract(),
//             address(10)
//         );
//         assertEq(
//             FunctionContractClient(address(functionContract)).fetchLocalContract(),
//             address(11)
//         );
//     }

//     // Covers calling a pure function with a function input type
//     function testDidCallPureFunctionWithFunctionInput() public {
//         uint256[] memory values = new uint256[](2);
//         values[0] = 5;
//         values[1] = 10;
//         uint256[] memory mappedValues = functionInputContract.mapPure(values, this.map);
//         assertEq(mappedValues[0], 10);
//         assertEq(mappedValues[1], 20);
//     }

//     // Covers importing an externally defined contract via the SphinxExternal.sol file,
//     // deploying and interacting with it
//     function testDidDeployAndInteractWithExternalContract() public {
//         assertEq(externalContract.number(), 6);
//     }

//     // Covers importing an externally defined contract via the SphinxExternal.sol file,
//     // defining that it exists at an address, and then interacting with it
//     function testDidDefineAndInteractWithExternalContract() public {
//         assertEq(alreadyDeployedExternalContract.number(), 7);
//     }
// }
