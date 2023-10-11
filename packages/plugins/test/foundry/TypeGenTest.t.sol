// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { TypeGenTestConfig } from "../../script/TypeGenTest.s.sol";
import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { MyTypeLibrary } from "../../contracts/test/typegen/imports/Types.sol";
import { MyTypeContract } from "../../contracts/test/typegen/imports/Types.sol";
import {
    MyTopLevelType,
    MyTopLevelStruct,
    MyTopLevelEnum
} from "../../contracts/test/typegen/imports/Types.sol";
import {
    MyLocalType,
    MyLocalStruct,
    MyLocalEnum
} from "../../contracts/test/typegen/imports/NoAlias.sol";
import {
    MyTypeLibrary as MyTypeLibraryAlias
} from "../../contracts/test/typegen/imports/Types.sol";
import {
    MyTypeContract as MyTypeContractAlias
} from "../../contracts/test/typegen/imports/Types.sol";
import {
    MyTopLevelType as MyTopLevelTypeAlias,
    MyTopLevelStruct as MyTopLevelStructAlias,
    MyTopLevelEnum as MyTopLevelEnumAlias
} from "../../contracts/test/typegen/imports/Types.sol";
import { LocalParentTypes } from "../../contracts/test/typegen/imports/LocalParent.sol";
import {
    MyLocalTypeLibrary,
    MyLocalTypeContract
} from "../../contracts/test/typegen/imports/LocalParent.sol";
import { MyImportContract } from "../../contracts/test/typegen/contractInputs/ImportContract.sol";
import { LocalContract } from "../../contracts/test/typegen/contractInputs/FunctionContract.sol";
import {
    FunctionContractClient
} from "../../client/typegen/contractInputs/FunctionContract.c.sol";
import { ExternalContract } from "../../testExternalContracts/ExternalContract.sol";

import { ConflictingType } from "../../contracts/test/typegen/conflictingTypeNames/First.sol";
import { ConflictingEnum } from "../../contracts/test/typegen/conflictingTypeNames/First.sol";
import {
    ConflictingType as TypegenConflictingNameContractsSecond_ConflictingType
} from "../../contracts/test/typegen/conflictingTypeNames/Second.sol";
import {
    ConflictingEnum as TypegenConflictingNameContractsSecond_ConflictingEnum
} from "../../contracts/test/typegen/conflictingTypeNames/Second.sol";
import { ConflictingStruct } from "../../contracts/test/typegen/conflictingTypeNames/First.sol";
import { SphinxUtils } from "../../contracts/foundry/SphinxUtils.sol";
import { MyContractType, MyEnum, MyType, MyStruct } from "../../contracts/test/typegen/ArrayInputTypes.sol";
import { MyLocalTypeArray } from "../../contracts/test/typegen/imports/NoAliasArray.sol";

import "forge-std/Test.sol";

contract TypeGenTest is Test, TypeGenTestConfig {
    ExternalContract myPredeployedExternalContract;

    address manager;

    constructor () {
        manager = sphinxUtils.getSphinxManagerAddress(sphinxConfig);
    }

    function map(uint256 value) external pure returns (uint256) {
        return 2 * value;
    }

    function setUp() public {
        // Deploy an external contract ahead of time so we can later define an interact with it
        myPredeployedExternalContract = new ExternalContract(5);
        alreadyDeployedContractAddress = address(myPredeployedExternalContract);
        deploy(Network.anvil);
    }

    // Covers deploying contracts with conflicting names
    function testDidGenerateAndDeployContractsWithConflictingNames() public {
        assertEq(firstConflictingNameContract.number(), 5);
        assertEq(secondConflictingNameContract.addr(), address(5));
    }

    // Covers using basic types to deploy contracts
    function testDidDeployContractWithBasicInputTypes() public {
        // Check values were set correctly in the constructor
        assertEq(basicInputTypes.myUint8(), 1);
        assertEq(basicInputTypes.myUint(), 2);
        assertEq(basicInputTypes.myInt64(), 3);
        assertEq(basicInputTypes.myInt(), 4);
        assertEq(basicInputTypes.myAddress(), address(5));
        assertEq(basicInputTypes.myBytes32(), keccak256("6"));
        assertEq(basicInputTypes.myBytes(), bytes("hello"));
        assertEq(basicInputTypes.myBool(), true);
        assertEq(basicInputTypes.myString(), "world");
    }

    // Covers using basic types as function inputs
    function testDidCallFunctionWithBasicInputTypes() public {
        assertEq(basicInputTypesTwo.myUint8(), 2);
        assertEq(basicInputTypesTwo.myUint(), 3);
        assertEq(basicInputTypesTwo.myInt64(), 4);
        assertEq(basicInputTypesTwo.myInt(), 5);
        assertEq(basicInputTypesTwo.myAddress(), address(6));
        assertEq(basicInputTypesTwo.myBytes32(), keccak256("7"));
        assertEq(basicInputTypesTwo.myBytes(), bytes("goodbye"));
        assertEq(basicInputTypesTwo.myBool(), false);
        assertEq(basicInputTypesTwo.myString(), "world");
    }

    // Covers returning all of the basic types from a pure function
    function testDidReturnBasicTypesFromPureFunction() public {
        (
            uint8 myUint8,
            uint myUint,
            int64 myInt64,
            int myInt,
            address myAddress,
            bytes32 myBytes32,
            bytes memory myBytes,
            bool myBool,
            string memory myString
        ) = basicInputTypes.returnValues();
        assertEq(myUint8, 6);
        assertEq(myUint, 5);
        assertEq(myInt64, 4);
        assertEq(myInt, 3);
        assertEq(myAddress, address(2));
        assertEq(myBytes32, keccak256("1"));
        assertEq(myBytes, bytes("pure"));
        assertEq(myBool, true);
        assertEq(myString, "function");
    }

    // Covers using all of the basic immutable constructor args
    function testDidDeployContractWithImmutableInputTypes() public {
        assertEq(immutableInputTypes.myUint8(), 1);
        assertEq(immutableInputTypes.myUint(), 2);
        assertEq(immutableInputTypes.myInt64(), 3);
        assertEq(immutableInputTypes.myInt(), 4);
        assertEq(immutableInputTypes.myAddress(), address(5));
        assertEq(immutableInputTypes.myBytes32(), keccak256("6"));
        assertEq(immutableInputTypes.myBool(), true);
    }

    // Covers using array types to deploy contracts
    function testDidDeployContractWithArrayInputs() public {
        assertEq(arrayInputTypes.myUintDynamicArray(0), intialUintDynamicArray[0]);
        assertEq(arrayInputTypes.myUintDynamicArray(1), intialUintDynamicArray[1]);
        assertEq(
            arrayInputTypes.myUintNestedDynamicArray(0, 0),
            initialUintNestedDynamicArray[0][0]
        );
        assertEq(
            arrayInputTypes.myUintNestedDynamicArray(0, 1),
            initialUintNestedDynamicArray[0][1]
        );
        assertEq(
            arrayInputTypes.myUintNestedDynamicArray(1, 0),
            initialUintNestedDynamicArray[1][0]
        );
        assertEq(
            arrayInputTypes.myUintNestedDynamicArray(1, 1),
            initialUintNestedDynamicArray[1][1]
        );
        assertEq(arrayInputTypes.myUintStaticArray(0), initialUintStaticArray[0]);
        assertEq(arrayInputTypes.myUintStaticArray(1), initialUintStaticArray[1]);
        assertEq(arrayInputTypes.myUintStaticArray(2), initialUintStaticArray[2]);
        assertEq(arrayInputTypes.myStructArray(0), initialMyStructArray[0].myNumber);
        assertEq(arrayInputTypes.myStructArray(1), initialMyStructArray[1].myNumber);
        assertEq(MyType.unwrap(arrayInputTypes.myTypeArray(0)), MyType.unwrap(initialMyTypeArray[0]));
        assertEq(MyType.unwrap(arrayInputTypes.myTypeArray(1)), MyType.unwrap(initialMyTypeArray[1]));
        assertEq(address(arrayInputTypes.myContractTypeArray(0)), initialMyContractTypeArray[0]);
        assertEq(address(arrayInputTypes.myContractTypeArray(1)), initialMyContractTypeArray[1]);
        assertEq(uint(arrayInputTypes.myEnumArray(0)), uint(initialMyEnumArray[0]));
        assertEq(uint(arrayInputTypes.myEnumArray(1)), uint(initialMyEnumArray[1]));
    }

    // Covers using array types as function inputs
    function testDidCallFunctionWithArrayInputs() public {
        assertEq(arrayInputTypesTwo.myUintDynamicArray(0), updatedUintDynamicArray[0]);
        assertEq(arrayInputTypesTwo.myUintDynamicArray(1), updatedUintDynamicArray[1]);
        assertEq(
            arrayInputTypesTwo.myUintNestedDynamicArray(0, 0),
            updatedUintNestedDynamicArray[0][0]
        );
        assertEq(
            arrayInputTypesTwo.myUintNestedDynamicArray(0, 1),
            updatedUintNestedDynamicArray[0][1]
        );
        assertEq(
            arrayInputTypesTwo.myUintNestedDynamicArray(1, 0),
            updatedUintNestedDynamicArray[1][0]
        );
        assertEq(
            arrayInputTypesTwo.myUintNestedDynamicArray(1, 1),
            updatedUintNestedDynamicArray[1][1]
        );
        assertEq(arrayInputTypesTwo.myUintStaticArray(0), updatedUintStaticArray[0]);
        assertEq(arrayInputTypesTwo.myUintStaticArray(1), updatedUintStaticArray[1]);
        assertEq(arrayInputTypesTwo.myUintStaticArray(2), updatedUintStaticArray[2]);
        assertEq(arrayInputTypesTwo.myStructArray(0), updatedMyStructArray[0].myNumber);
        assertEq(arrayInputTypesTwo.myStructArray(1), updatedMyStructArray[1].myNumber);
        assertEq(MyType.unwrap(arrayInputTypesTwo.myTypeArray(0)), MyType.unwrap(updatedMyTypeArray[0]));
        assertEq(MyType.unwrap(arrayInputTypesTwo.myTypeArray(1)), MyType.unwrap(updatedMyTypeArray[1]));
        assertEq(address(arrayInputTypesTwo.myContractTypeArray(0)), updatedMyContractTypeArray[0]);
        assertEq(address(arrayInputTypesTwo.myContractTypeArray(1)), updatedMyContractTypeArray[1]);
        assertEq(uint(arrayInputTypesTwo.myEnumArray(0)), uint(updatedMyEnumArray[0]));
        assertEq(uint(arrayInputTypesTwo.myEnumArray(1)), uint(updatedMyEnumArray[1]));
    }

    // Covers importing a user defined type without an alias and using it in an array
    function testDidImportUserDefinedTypeAndUseInArray() public {
        assertEq(uint(noAliasArrayImportsOne.libraryEnum(0)), uint(noAliasLibraryEnumArray[0]));
        assertEq(noAliasArrayImportsOne.libraryStruct(0), noAliasLibraryStruct[0].a);
        assertEq(
            MyTypeLibrary.MyTypeInLibrary.unwrap(noAliasArrayImportsOne.libraryType(0)),
            MyTypeLibrary.MyTypeInLibrary.unwrap(noAliasLibraryType[0])
        );
        assertEq(uint(noAliasArrayImportsOne.contractEnum(0)), uint(noAliasContractEnum[0]));
        assertEq(noAliasArrayImportsOne.contractStruct(0), noAliasContractStruct[0].a);
        assertEq(
            MyTypeContract.MyTypeInContract.unwrap(noAliasArrayImportsOne.contractType(0)),
            MyTypeContract.MyTypeInContract.unwrap(noAliasContractType[0])
        );

        assertEq(uint(noAliasArrayImportsTwo.topLevelEnum(0)), uint(noAliasTopLevelEnum[0]));
        assertEq(noAliasArrayImportsTwo.topLevelStruct(0), noAliasTopLevelStruct[0].a);
        assertEq(MyTopLevelType.unwrap(noAliasArrayImportsTwo.topLevelType(0)), MyTopLevelType.unwrap(noAliasTopLevelType[0]));

        assertEq(uint(noAliasArrayImportsTwo.localEnum(0)), uint(noAliasLocalEnum[0]));
        assertEq(noAliasArrayImportsTwo.localStruct(0), noAliasLocalStruct[0].a);
        assertEq(
            MyLocalTypeArray.unwrap(noAliasArrayImportsTwo.localType(0)),
            MyLocalTypeArray.unwrap(noAliasLocalType[0])
        );
    }

    // Covers importing a user defined type with an alias and using it in an array
    function testDidImportUserDefinedTypeAndUseInArrayWithAlias() public {
        // Library
        assertEq(
            uint(aliasImportsArray.libraryEnum(0)),
            uint(libraryEnumArray[0])
        );
        assertEq(aliasImportsArray.libraryStruct(0), libraryStruct[0].a);
        assertEq(
            MyTypeLibraryAlias.MyTypeInLibrary.unwrap(aliasImportsArray.libraryType(0)),
            MyTypeLibraryAlias.MyTypeInLibrary.unwrap(libraryType[0])
        );

        // Contract
        assertEq(
            uint(aliasImportsArray.contractEnum(0)),
            uint(contractEnum[0])
        );
        assertEq(aliasImportsArray.contractStruct(0), contractStruct[0].a);
        assertEq(
            MyTypeContractAlias.MyTypeInContract.unwrap(aliasImportsArray.contractType(0)),
            MyTypeContractAlias.MyTypeInContract.unwrap(contractType[0])
        );

        // Top Level
        assertEq(uint(aliasImportsArray.topLevelEnum(0)), uint(topLevelEnum[0]));
        assertEq(aliasImportsArray.topLevelStruct(0), topLevelStruct[0].a);
        assertEq(
            MyTopLevelTypeAlias.unwrap(aliasImportsArray.topLevelType(0)),
            MyTopLevelTypeAlias.unwrap(topLevelType[0])
        );

    }


    // Covers returning array types from pure functions
    function testDidReturnArrayTypesFromPureFunction() public {
        (
            uint8[] memory myUintDynamicArray,
            bytes32[][] memory myUintNestedDynamicArray,
            address[3] memory myUintStaticArray,
            MyStruct[] memory myStructArray,
            MyType[] memory myTypeArray,
            MyContractType[] memory myContractTypeArray,
            MyEnum[] memory myEnumArray
        ) = arrayInputTypes.returnValues();
        assertEq(myUintDynamicArray[0], intialUintDynamicArray[0]);
        assertEq(myUintDynamicArray[1], intialUintDynamicArray[1]);
        assertEq(myUintNestedDynamicArray[0][0], initialUintNestedDynamicArray[0][0]);
        assertEq(myUintNestedDynamicArray[0][1], initialUintNestedDynamicArray[0][1]);
        assertEq(myUintNestedDynamicArray[1][0], initialUintNestedDynamicArray[1][0]);
        assertEq(myUintNestedDynamicArray[1][1], initialUintNestedDynamicArray[1][1]);
        assertEq(myUintStaticArray[0], initialUintStaticArray[0]);
        assertEq(myUintStaticArray[1], initialUintStaticArray[1]);
        assertEq(myUintStaticArray[2], initialUintStaticArray[2]);
        assertEq(myStructArray[0].myNumber, initialMyStructArray[0].myNumber);
        assertEq(myStructArray[1].myNumber, initialMyStructArray[1].myNumber);
        assertEq(MyType.unwrap(myTypeArray[0]), MyType.unwrap(initialMyTypeArray[0]));
        assertEq(MyType.unwrap(myTypeArray[1]), MyType.unwrap(initialMyTypeArray[1]));
        assertEq(address(myContractTypeArray[0]), initialMyContractTypeArray[0]);
        assertEq(address(myContractTypeArray[1]), initialMyContractTypeArray[1]);
        assertEq(uint(myEnumArray[0]), uint(initialMyEnumArray[0]));
        assertEq(uint(myEnumArray[1]), uint(initialMyEnumArray[1]));
    }

    // Covers deploying contracts with conflicting User defined types, structs, and enums as
    // constructor args. Also covers that these types work properly in constructors.
    function testDidDeployContractsWithConflictingInputTypeNames() public {
        assertEq(ConflictingType.unwrap(conflictingTypeNameContractFirst.conflictingType()), true);
        bool a1 = conflictingTypeNameContractFirst.conflictingStruct();
        assertEq(a1, true);
        assertEq(
            uint(conflictingTypeNameContractFirst.conflictingEnum()),
            uint(ConflictingEnum.Third)
        );

        assertEq(
            TypegenConflictingNameContractsSecond_ConflictingType.unwrap(
                conflictingTypeNameContractSecond.conflictingType()
            ),
            1
        );
        uint a2 = conflictingTypeNameContractSecond.conflictingStruct();
        assertEq(a2, 1);
        assertEq(
            uint(conflictingTypeNameContractSecond.conflictingEnum()),
            uint(TypegenConflictingNameContractsSecond_ConflictingEnum.Second)
        );
    }

    // Covers using User defined types, structs, and enums as function inputs
    function testDidCallFunctionWithUserDefinedTypes() public {
        assertEq(
            ConflictingType.unwrap(conflictingTypeNameContractFirstTwo.conflictingType()),
            false
        );
        bool a1 = conflictingTypeNameContractFirstTwo.conflictingStruct();
        assertEq(a1, false);
        assertEq(
            uint(conflictingTypeNameContractFirstTwo.conflictingEnum()),
            uint(ConflictingEnum.Second)
        );
    }

    // Covers returning User defined types, structs, and enums from pure functions
    function testDidReturnUserDefinedTypesFromPureFunction() public {
        (
            ConflictingType a,
            ConflictingStruct memory b,
            ConflictingEnum c
        ) = conflictingTypeNameContractClient.pureConflictingTypes();
        assertEq(ConflictingType.unwrap(a), true);
        assertEq(b.a, true);
        assertEq(uint(c), uint(ConflictingEnum.First));
    }

    // Covers importing a user defined type with a parent object
    function testDidImportUserDefinedTypeWithParent() public {
        // Library
        assertEq(
            uint(noAliasImportsOne.libraryEnum()),
            uint(MyTypeLibrary.MyEnumInLibrary.Library)
        );
        uint8 a1 = noAliasImportsOne.libraryStruct();
        assertEq(a1, 1);
        assertEq(MyTypeLibrary.MyTypeInLibrary.unwrap(noAliasImportsOne.libraryType()), 2);

        // Contract
        assertEq(
            uint(noAliasImportsOne.contractEnum()),
            uint(MyTypeContract.MyEnumInContract.Contract)
        );
        bytes32 a2 = noAliasImportsOne.contractStruct();
        assertEq(a2, keccak256("3"));
        assertEq(
            MyTypeContract.MyTypeInContract.unwrap(noAliasImportsOne.contractType()),
            keccak256("4")
        );
    }

    // Covers importing a user defined type from a remote file
    function testDidImportUserDefinedType() public {
        assertEq(uint(noAliasImportsTwo.topLevelEnum()), uint(MyTopLevelEnum.TopLevel));
        bool a3 = noAliasImportsTwo.topLevelStruct();
        assertEq(a3, true);
        assertEq(MyTopLevelType.unwrap(noAliasImportsTwo.topLevelType()), true);
    }

    // Covers importing a user defined type that is defined locally
    function testDidImportUserDefinedTypeDefinedLocally() public {
        assertEq(uint(noAliasImportsTwo.localEnum()), uint(MyLocalEnum.Local));
        int8 a4 = noAliasImportsTwo.localStruct();
        assertEq(a4, -1);
        assertEq(MyLocalType.unwrap(noAliasImportsTwo.localType()), -2);
    }

    // Covers importing a user defined type from a remote type with an alias
    function testDidImportUserDefinedTypeWithAlias() public {
        assertEq(uint(aliasImports.topLevelEnum()), uint(MyTopLevelEnumAlias.TopLevel));
        bool a3 = aliasImports.topLevelStruct();
        assertEq(a3, true);
        assertEq(MyTopLevelTypeAlias.unwrap(aliasImports.topLevelType()), true);
    }

    // Covers importing a user defined type with a parent object that is imported with an alias
    function testDidImportUserDefinedTypeWithAliasedParent() public {
        // Library
        assertEq(
            uint(aliasImports.libraryEnum()),
            uint(MyTypeLibraryAlias.MyEnumInLibrary.Library)
        );
        uint8 a1 = aliasImports.libraryStruct();
        assertEq(a1, 1);
        assertEq(MyTypeLibraryAlias.MyTypeInLibrary.unwrap(aliasImports.libraryType()), 2);

        // Contract
        assertEq(
            uint(aliasImports.contractEnum()),
            uint(MyTypeContractAlias.MyEnumInContract.Contract)
        );
        bytes32 a2 = aliasImports.contractStruct();
        assertEq(a2, keccak256("3"));
        assertEq(
            MyTypeContractAlias.MyTypeInContract.unwrap(aliasImports.contractType()),
            keccak256("4")
        );
    }

    // Covers importing a user defined type that is defined locally, but with a parent object
    // struct, enum, user defined type
    // both library and contract
    function testDidImportUserDefinedTypeDefinedLocallyAndWithinParent() public {
        // Library
        assertEq(
            uint(localParentTypes.libraryEnum()),
            uint(MyLocalTypeLibrary.MyEnumInLibrary.Library)
        );
        bool a1 = localParentTypes.libraryStruct();
        assertEq(a1, true);
        assertEq(MyLocalTypeLibrary.MyTypeInLibrary.unwrap(localParentTypes.libraryType()), true);

        // Contract
        assertEq(
            uint(localParentTypes.contractEnum()),
            uint(MyLocalTypeContract.MyEnumInContract.Contract)
        );
        bytes32 a2 = localParentTypes.contractStruct();
        assertEq(a2, keccak256("1"));
        assertEq(
            MyLocalTypeContract.MyTypeInContract.unwrap(localParentTypes.contractType()),
            keccak256("2")
        );
    }

    // Covers importing a contract and using it as input for a constructor
    function testDidDeployContractWithInputImportedContractAsAddress() public {
        assertEq(functionContract.importContract().number(), 1);
    }

    // Covers defining a contract locally and using it as input for a constructor
    function testDidDepoyContractWithInputLocalContractAsAddress() public {
        assertEq(functionContract.localContract().number(), 1);
    }

    // Covers importing a contract and using it as input for a function call
    function testDidCallFunctionWithInputImportedContractAsAddress() public {
        assertEq(functionContractTwo.importContract().number(), 2);
    }

    // Covers defining a contract locally and using it as input for a function
    function testDidCallFunctionWithInputLocalContractAsAddress() public {
        assertEq(functionContractTwo.localContract().number(), 2);
    }

    // Covers returning a contract from a pure function
    function testDidReturnContractAsAddressFromPureFunction() public {
        assertEq(
            FunctionContractClient(address(functionContract)).fetchImportContract(),
            address(10)
        );
        assertEq(
            FunctionContractClient(address(functionContract)).fetchLocalContract(),
            address(11)
        );
    }

    // Covers calling a pure function with a function input type
    function testDidCallPureFunctionWithFunctionInput() public {
        uint256[] memory values = new uint256[](2);
        values[0] = 5;
        values[1] = 10;
        uint256[] memory mappedValues = functionInputContract.mapPure(values, this.map);
        assertEq(mappedValues[0], 10);
        assertEq(mappedValues[1], 20);
    }

    // Covers importing an externally defined contract via the SphinxExternal.sol file,
    // deploying and interacting with it
    function testDidDeployAndInteractWithExternalContract() public {
        assertEq(externalContract.number(), 6);
    }

    // Covers importing an externally defined contract via the SphinxExternal.sol file,
    // defining that it exists at an address, and then interacting with it
    function testDidDefineAndInteractWithExternalContract() public {
        assertEq(alreadyDeployedExternalContract.number(), 7);
    }

    // Covers calling a function that relies on the msg.sender
    function testMsgSenderInFunction() public {
        assertEq(msgSender.msgSenderInFunction(), address(manager));
    }

    // Covers deploying a contract with constructor logic that depends on the msg.sender
    function testMsgSenderInConstructor() public {
        assertEq(msgSender.msgSenderInConstructor(), address(manager));
    }

    // Covers deploying and interacting with a contract that has unnamed parameters in its constructor and functions
    function testUnnamedParametersInConstructorAndFunction() public {
        assertEq(unnamedParameters.number(), 4);
    }

    // Covers deploying and interacting with a contract that inherits from another contract
    function testDidDeployAndInteractWithInheritedContract() public {
        assertEq(parent.myNumber(), 2);
        assertEq(parent.myBool(), true);

        assertEq(child.myNumber(), 3);
        assertEq(child.myBool(), false);
        assertEq(child.myAddress(), address(3));
    }

    // Covers deploying and interacting with a contract that inherits from a contract which inherits from another contract
    // and that uses an alias
    function testDidDeployAndInteractWithInheritedContractWithAlias() public {
        assertEq(grandchild.myNumber(), 3);
        assertEq(grandchild.myBytes32(), keccak256("3"));
        assertEq(grandchild.myBool(), false);
    }
}
