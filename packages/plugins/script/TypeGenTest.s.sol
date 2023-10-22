// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {
    SphinxConfig,
    Network,
    DeployOptions
} from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxClient } from "../client/SphinxClient.sol";
import { Version } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    ConflictingNameContract as ConflictingNameContractFirst
} from "../contracts/test/typegen/conflictingNameContracts/First.sol";
import {
    ConflictingNameContract as ConflictingNameContractSecond
} from "../contracts/test/typegen/conflictingNameContracts/Second.sol";
import { BasicInputTypes } from "../contracts/test/typegen/BasicInputTypes.sol";
import { ImmutableInputTypes } from "../contracts/test/typegen/ImmutableInputTypes.sol";
import { ArrayInputTypes } from "../contracts/test/typegen/ArrayInputTypes.sol";
import {
    NoAliasImportsOne,
    NoAliasImportsTwo
} from "../contracts/test/typegen/imports/NoAlias.sol";
import { AliasImports } from "../contracts/test/typegen/imports/Alias.sol";
import { MyTypeLibrary } from "../contracts/test/typegen/imports/Types.sol";
import { MyTypeContract } from "../contracts/test/typegen/imports/Types.sol";
import {
    MyTopLevelType,
    MyTopLevelStruct,
    MyTopLevelEnum
} from "../contracts/test/typegen/imports/Types.sol";
import {
    MyLocalType,
    MyLocalStruct,
    MyLocalEnum
} from "../contracts/test/typegen/imports/NoAlias.sol";
import { MyTypeLibrary as MyTypeLibraryAlias } from "../contracts/test/typegen/imports/Types.sol";
import { MyTypeContract as MyTypeContractAlias } from "../contracts/test/typegen/imports/Types.sol";
import {
    MyTopLevelType as MyTopLevelTypeAlias,
    MyTopLevelStruct as MyTopLevelStructAlias,
    MyTopLevelEnum as MyTopLevelEnumAlias
} from "../contracts/test/typegen/imports/Types.sol";
import { LocalParentTypes } from "../contracts/test/typegen/imports/LocalParent.sol";
import {
    MyLocalTypeLibrary,
    MyLocalTypeContract
} from "../contracts/test/typegen/imports/LocalParent.sol";
import { FunctionContract } from "../contracts/test/typegen/contractInputs/FunctionContract.sol";
import { MyImportContract } from "../contracts/test/typegen/contractInputs/ImportContract.sol";
import { LocalContract } from "../contracts/test/typegen/contractInputs/FunctionContract.sol";
import { FunctionInputContract } from "../contracts/test/typegen/FunctionInputType.sol";
import { ExternalContract } from "../testExternalContracts/ExternalContract.sol";
import {
    ConflictingTypeNameContractFirst
} from "../contracts/test/typegen/conflictingTypeNames/First.sol";
import {
    ConflictingTypeNameContractSecond
} from "../contracts/test/typegen/conflictingTypeNames/Second.sol";
import { ConflictingType } from "../contracts/test/typegen/conflictingTypeNames/First.sol";
import { ConflictingStruct } from "../contracts/test/typegen/conflictingTypeNames/First.sol";
import { ConflictingEnum } from "../contracts/test/typegen/conflictingTypeNames/First.sol";
import {
    ConflictingType as TypegenConflictingNameContractsSecond_ConflictingType
} from "../contracts/test/typegen/conflictingTypeNames/Second.sol";
import {
    ConflictingStruct as TypegenConflictingNameContractsSecond_ConflictingStruct
} from "../contracts/test/typegen/conflictingTypeNames/Second.sol";
import {
    ConflictingEnum as TypegenConflictingNameContractsSecond_ConflictingEnum
} from "../contracts/test/typegen/conflictingTypeNames/Second.sol";
import {
    ConflictingTypeNameContractFirst
} from "../contracts/test/typegen/conflictingTypeNames/First.sol";
import {
    ConflictingTypeNameContractSecond
} from "../contracts/test/typegen/conflictingTypeNames/Second.sol";
import { MsgSender } from "../contracts/test/MsgSender.sol";
import { UnnamedParameters } from "../contracts/test/typegen/UnnamedParameters.sol";
import { MyEnum, MyType, MyStruct } from "../contracts/test/typegen/ArrayInputTypes.sol";
import { NoAliasArrayImportsOne, NoAliasArrayImportsTwo } from "../contracts/test/typegen/imports/NoAliasArray.sol";
import { AliasImportsArray } from "../contracts/test/typegen/imports/AliasArray.sol";
import {
    MyLocalTypeArray,
    MyLocalStructArray,
    MyLocalEnumArray
} from "../contracts/test/typegen/imports/NoAliasArray.sol";
import { Child } from "../contracts/test/typegen/inheritance/Child.sol";
import { Grandchild } from "../contracts/test/typegen/inheritance/Alias.sol";
import { ChildInSameFile } from "../contracts/test/typegen/inheritance/SameFile.sol";
import { ConflictingQualifiedNames } from "../contracts/test/typegen/conflictingQualifiedNames/ConflictingQualifiedNames.sol";
import { ConflictingQualifiedNames as ConflictingQualifiedNamesA } from "../contracts/test/typegen/conflictingQualifiedNames/A/ConflictingQualifiedNames.sol";
import { ConflictingQualifiedNameChild } from "../contracts/test/typegen/conflictingQualifiedNames/ConflictingNameChild.sol";
import { ConflictingQualifiedNameChildInSameFile } from "../contracts/test/typegen/conflictingQualifiedNames/ConflictingQualifiedNames.sol";
import { ChildParentImportsTypes } from "../contracts/test/typegen/imports/ChildParentImportsTypes.sol";
import { ChildOverrides } from "../contracts/test/typegen/inheritance/Overrides.sol";
import { IExternalContract } from "../testExternalContracts/IExternalContract.sol";
import { NestedImportChild } from "../contracts/test/typegen/nestedParentImport/C.sol";
import { MyContractType } from "../contracts/test/typegen/ArrayInputTypes.sol";

import "sphinx-forge-std/Test.sol";

contract TypeGenTestConfig is Test, SphinxClient {
    address alreadyDeployedContractAddress;
    address alreadyDeployedContractAddressForInterface;
    ConflictingNameContractFirst firstConflictingNameContract;
    ConflictingNameContractSecond secondConflictingNameContract;
    BasicInputTypes basicInputTypes;
    BasicInputTypes basicInputTypesTwo;
    ImmutableInputTypes immutableInputTypes;
    ArrayInputTypes arrayInputTypes;
    ArrayInputTypes arrayInputTypesTwo;
    NoAliasImportsOne noAliasImportsOne;
    NoAliasImportsTwo noAliasImportsTwo;
    NoAliasArrayImportsOne noAliasArrayImportsOne;
    NoAliasArrayImportsTwo noAliasArrayImportsTwo;
    AliasImports aliasImports;
    AliasImportsArray aliasImportsArray;
    LocalParentTypes localParentTypes;
    FunctionContract functionContract;
    FunctionContract functionContractTwo;
    FunctionInputContract functionInputContract;
    ExternalContract externalContract;
    ExternalContract alreadyDeployedExternalContract;
    IExternalContract alreadyDeployedExternalContractInterface;
    ConflictingTypeNameContractFirst conflictingTypeNameContractFirst;
    ConflictingTypeNameContractSecond conflictingTypeNameContractSecond;
    ConflictingTypeNameContractFirst conflictingTypeNameContractFirstTwo;
    MsgSender msgSender;
    UnnamedParameters unnamedParameters;
    Child child;
    Grandchild grandchild;
    ChildInSameFile childInSameFile;
    ConflictingQualifiedNames conflictingQualifiedNames;
    ConflictingQualifiedNamesA conflictingQualifiedNamesA;
    ConflictingQualifiedNameChild conflictingQualifiedNameChild;
    ConflictingQualifiedNameChildInSameFile conflictingQualifiedNameChildInSameFile;
    ChildParentImportsTypes childParentImportsTypes;
    ChildOverrides childOverrides;
    NestedImportChild nestedImportChild;

    uint8[] public intialUintDynamicArray;
    bytes32[][] public initialUintNestedDynamicArray;
    address[3] public initialUintStaticArray;
    MyStruct[] public initialMyStructArray;
    MyType[] public initialMyTypeArray;
    MyContractType[] public initialMyContractTypeArray;
    MyEnum[] public initialMyEnumArray;

    uint8[] public updatedUintDynamicArray;
    bytes32[][] public updatedUintNestedDynamicArray;
    address[3] public updatedUintStaticArray;
    MyStruct[] public updatedMyStructArray;
    MyType[] public updatedMyTypeArray;
    MyContractType[] public updatedMyContractTypeArray;
    MyEnum[] public updatedMyEnumArray;

    MyTypeLibraryAlias.MyEnumInLibrary[] public libraryEnumArray;
    MyTypeLibraryAlias.MyStructInLibrary[] public libraryStruct;
    MyTypeLibraryAlias.MyTypeInLibrary[] public libraryType;
    MyTypeContractAlias.MyEnumInContract[] public contractEnum;
    MyTypeContractAlias.MyStructInContract[] public contractStruct;
    MyTypeContractAlias.MyTypeInContract[] public contractType;
    MyTopLevelEnumAlias[] public topLevelEnum;
    MyTopLevelStructAlias[] public topLevelStruct;
    MyTopLevelTypeAlias[] public topLevelType;

    MyTypeLibrary.MyEnumInLibrary[] public noAliasLibraryEnumArray;
    MyTypeLibrary.MyStructInLibrary[] public noAliasLibraryStruct;
    MyTypeLibrary.MyTypeInLibrary[] public noAliasLibraryType;
    MyTypeContract.MyEnumInContract[] public noAliasContractEnum;
    MyTypeContract.MyStructInContract[] public noAliasContractStruct;
    MyTypeContract.MyTypeInContract[] public noAliasContractType;

    MyTopLevelEnum[] public noAliasTopLevelEnum;
    MyTopLevelStruct[] public noAliasTopLevelStruct;
    MyTopLevelType[] public noAliasTopLevelType;
    MyLocalEnumArray[] public noAliasLocalEnum;
    MyLocalStructArray[] public noAliasLocalStruct;
    MyLocalTypeArray[] public noAliasLocalType;

    function setupVariables() internal {
        intialUintDynamicArray = new uint8[](2);
        intialUintDynamicArray[0] = 1;
        intialUintDynamicArray[1] = 2;
        initialUintNestedDynamicArray = new bytes32[][](2);
        initialUintNestedDynamicArray[0] = new bytes32[](2);
        initialUintNestedDynamicArray[0][0] = keccak256("3");
        initialUintNestedDynamicArray[0][1] = keccak256("4");
        initialUintNestedDynamicArray[1] = new bytes32[](2);
        initialUintNestedDynamicArray[1][0] = keccak256("5");
        initialUintNestedDynamicArray[1][1] = keccak256("6");
        initialUintStaticArray = [address(7), address(8), address(9)];
        initialMyStructArray.push(MyStruct({ myNumber: 10 }));
        initialMyStructArray.push(MyStruct({ myNumber: 11 }));
        initialMyTypeArray = new MyType[](2);
        initialMyTypeArray[0] = MyType.wrap(12);
        initialMyTypeArray[1] = MyType.wrap(13);
        initialMyContractTypeArray = new MyContractType[](2);
        initialMyContractTypeArray[0] = MyContractType(address(14));
        initialMyContractTypeArray[1] = MyContractType(address(15));
        initialMyEnumArray = new MyEnum[](2);
        initialMyEnumArray[0] = MyEnum.A;
        initialMyEnumArray[1] = MyEnum.B;

        updatedUintDynamicArray = new uint8[](2);
        updatedUintDynamicArray[0] = 10;
        updatedUintDynamicArray[1] = 11;
        updatedUintNestedDynamicArray = new bytes32[][](2);
        updatedUintNestedDynamicArray[0] = new bytes32[](2);
        updatedUintNestedDynamicArray[0][0] = keccak256("12");
        updatedUintNestedDynamicArray[0][1] = keccak256("13");
        updatedUintNestedDynamicArray[1] = new bytes32[](2);
        updatedUintNestedDynamicArray[1][0] = keccak256("14");
        updatedUintNestedDynamicArray[1][1] = keccak256("15");
        updatedUintStaticArray = [address(16), address(17), address(18)];
        updatedMyStructArray.push(MyStruct({ myNumber: 19 }));
        updatedMyStructArray.push(MyStruct({ myNumber: 20 }));
        updatedMyTypeArray = new MyType[](2);
        updatedMyTypeArray[0] = MyType.wrap(21);
        updatedMyTypeArray[1] = MyType.wrap(22);
        updatedMyContractTypeArray = new MyContractType[](2);
        updatedMyContractTypeArray[0] = MyContractType(address(23));
        updatedMyContractTypeArray[1] = MyContractType(address(24));
        updatedMyEnumArray = new MyEnum[](2);
        updatedMyEnumArray[0] = MyEnum.C;
        updatedMyEnumArray[1] = MyEnum.D;

        libraryEnumArray.push(MyTypeLibraryAlias.MyEnumInLibrary.Library);
        libraryStruct.push(MyTypeLibraryAlias.MyStructInLibrary({ a: 1 }));
        libraryType.push(MyTypeLibraryAlias.MyTypeInLibrary.wrap(3));
        contractEnum.push(MyTypeContractAlias.MyEnumInContract.Contract);
        contractStruct.push(MyTypeContractAlias.MyStructInContract({ a: keccak256("5") }));
        contractType.push(MyTypeContractAlias.MyTypeInContract.wrap(keccak256("7")));
        topLevelEnum.push(MyTopLevelEnumAlias.TopLevel);
        topLevelStruct.push(MyTopLevelStructAlias({ a: true }));
        topLevelType.push(MyTopLevelTypeAlias.wrap(true));

        noAliasLibraryEnumArray.push(MyTypeLibrary.MyEnumInLibrary.Library);
        noAliasLibraryStruct.push(MyTypeLibrary.MyStructInLibrary({ a: 1 }));
        noAliasLibraryType.push(MyTypeLibrary.MyTypeInLibrary.wrap(3));
        noAliasContractEnum.push(MyTypeContract.MyEnumInContract.Contract);
        noAliasContractStruct.push(MyTypeContract.MyStructInContract({ a: keccak256("5") }));
        noAliasContractType.push(MyTypeContract.MyTypeInContract.wrap(keccak256("7")));

        noAliasTopLevelEnum.push(MyTopLevelEnum.TopLevel);
        noAliasTopLevelStruct.push(MyTopLevelStruct({ a: true }));
        noAliasTopLevelType.push(MyTopLevelType.wrap(true));
        noAliasLocalEnum.push(MyLocalEnumArray.Local);
        noAliasLocalStruct.push(MyLocalStructArray({ a: -1 }));
        noAliasLocalType.push(MyLocalTypeArray.wrap(-2));
    }

    constructor() {
        sphinxConfig.projectName = "TypeGenTest";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.mainnets = [Network.ethereum];
        sphinxConfig.testnets = [Network.goerli];
        sphinxConfig.threshold = 1;
    }

    function deploy(Network _network) public override sphinx(_network) {
        setupVariables();

        // Deploy two contracts with conflicting names
        firstConflictingNameContract = deployConflictingNameContract(5);
        secondConflictingNameContract = deployTypegenConflictingNameContractsSecond_ConflictingNameContract(address(5));
        // Deploy contract testing basic types
        basicInputTypes = deployBasicInputTypes(
            1,
            2,
            3,
            4,
            address(5),
            keccak256("6"),
            bytes("hello"),
            true,
            "world"
        );

        // Deploy contract with basic types, then call a function to update those values
        basicInputTypesTwo = deployBasicInputTypes(
            1,
            2,
            3,
            4,
            address(5),
            keccak256("6"),
            bytes("hello"),
            true,
            "world",
            DeployOptions({ salt: 0, referenceName: "basicInputTypesTwo" })
        );
        basicInputTypesTwo.setValues(
            2,
            3,
            4,
            5,
            address(6),
            keccak256("7"),
            bytes("goodbye"),
            false,
            "world"
        );

        // Deploy contract with immutable input types
        immutableInputTypes = deployImmutableInputTypes(1, 2, 3, 4, address(5), keccak256("6"), true);

        // Deploy contract with array input types
        arrayInputTypes = deployArrayInputTypes(
            intialUintDynamicArray,
            initialUintNestedDynamicArray,
            initialUintStaticArray,
            initialMyStructArray,
            initialMyTypeArray,
            initialMyContractTypeArray,
            initialMyEnumArray
        );

        // Deploy contract with array input types, then call function to update those values
        arrayInputTypesTwo = deployArrayInputTypes(
            intialUintDynamicArray,
            initialUintNestedDynamicArray,
            initialUintStaticArray,
            initialMyStructArray,
            initialMyTypeArray,
            initialMyContractTypeArray,
            initialMyEnumArray,
            DeployOptions({ salt: 0, referenceName: "arrayInputTypesTwo" })
        );
        arrayInputTypesTwo.setValues(
            updatedUintDynamicArray,
            updatedUintNestedDynamicArray,
            updatedUintStaticArray,
            updatedMyStructArray,
            updatedMyTypeArray,
            updatedMyContractTypeArray,
            updatedMyEnumArray
        );

        // Deploy contracts which requires all types of imports without any aliasing
        noAliasImportsOne = deployNoAliasImportsOne(
            MyTypeLibrary.MyEnumInLibrary.Library,
            MyTypeLibrary.MyStructInLibrary({ a: 1 }),
            MyTypeLibrary.MyTypeInLibrary.wrap(2),
            MyTypeContract.MyEnumInContract.Contract,
            MyTypeContract.MyStructInContract({ a: keccak256("3") }),
            MyTypeContract.MyTypeInContract.wrap(keccak256("4"))
        );

        noAliasImportsTwo = deployNoAliasImportsTwo(
            MyTopLevelEnum.TopLevel,
            MyTopLevelStruct({ a: true }),
            MyTopLevelType.wrap(true),
            MyLocalEnum.Local,
            MyLocalStruct({ a: -1 }),
            MyLocalType.wrap(-2)
        );

        // Deploy contract which requires all types of imports with aliasing
        aliasImports = deployAliasImports(
            MyTypeLibraryAlias.MyEnumInLibrary.Library,
            MyTypeLibraryAlias.MyStructInLibrary({ a: 1 }),
            MyTypeLibraryAlias.MyTypeInLibrary.wrap(2),
            MyTypeContractAlias.MyEnumInContract.Contract,
            MyTypeContractAlias.MyStructInContract({ a: keccak256("3") }),
            MyTypeContractAlias.MyTypeInContract.wrap(keccak256("4")),
            MyTopLevelEnumAlias.TopLevel,
            MyTopLevelStructAlias({ a: true }),
            MyTopLevelTypeAlias.wrap(true)
        );

        // Deploy contract which requires all types imported from a locally defined parent object
        localParentTypes = deployLocalParentTypes(
            MyLocalTypeLibrary.MyEnumInLibrary.Library,
            MyLocalTypeLibrary.MyStructInLibrary({ a: true }),
            MyLocalTypeLibrary.MyTypeInLibrary.wrap(true),
            MyLocalTypeContract.MyEnumInContract.Contract,
            MyLocalTypeContract.MyStructInContract({ a: keccak256("1") }),
            MyLocalTypeContract.MyTypeInContract.wrap(keccak256("2"))
        );

        // Deploy contract which requires types imported with aliasing and used in arrays
        aliasImportsArray = deployAliasImportsArray(
            libraryEnumArray,
            libraryStruct,
            libraryType,
            contractEnum,
            contractStruct,
            contractType,
            topLevelEnum,
            topLevelStruct,
            topLevelType
        );

        // Deploy contracts which requires types imported without aliasing and used in arrays
        noAliasArrayImportsOne = deployNoAliasArrayImportsOne(
            noAliasLibraryEnumArray,
            noAliasLibraryStruct,
            noAliasLibraryType,
            noAliasContractEnum,
            noAliasContractStruct,
            noAliasContractType
        );
        noAliasArrayImportsTwo = deployNoAliasArrayImportsTwo(
            noAliasTopLevelEnum,
            noAliasTopLevelStruct,
            noAliasTopLevelType,
            noAliasLocalEnum,
            noAliasLocalStruct,
            noAliasLocalType
        );

        // Deploy contracts to be used as input
        MyImportContract myImportContractOne = deployMyImportContract(1);
        LocalContract localContractOne = deployLocalContract(1);

        MyImportContract myImportContractTwo = deployMyImportContract(
            2,
            DeployOptions({ salt: 0, referenceName: "myImportContractTwo" })
        );
        LocalContract localContractTwo = deployLocalContract(2, DeployOptions({ salt: 0, referenceName: "localContractTwo" }));

        // Deploy contract which requires contract inputs
        functionContract = deployFunctionContract(myImportContractOne, localContractOne);

        // Deploy contract which requires contract inputs, then call functions to update those values
        functionContractTwo = deployFunctionContract(
            myImportContractOne,
            localContractOne,
            DeployOptions({ salt: 0, referenceName: "functionContractTwo" })
        );
        functionContractTwo.setImportContract(myImportContractTwo);
        functionContractTwo.setLocalContract(localContractTwo);

        // Deploy contract which has function inputs
        functionInputContract = deployFunctionInputContract();

        // Deploy external contract
        externalContract = deployExternalContract(5);
        externalContract.setNumber(6);

        // Define external contract and interact with it
        alreadyDeployedExternalContract = ExternalContract(alreadyDeployedContractAddress);
        alreadyDeployedExternalContract.setNumber(7);

        // Define external contract and interact with it using an interface
        alreadyDeployedExternalContractInterface = IExternalContract(alreadyDeployedContractAddressForInterface);
        alreadyDeployedExternalContractInterface.setNumber(5);

        // Deploy contracts with conflicting type names
        conflictingTypeNameContractFirst = deployConflictingTypeNameContractFirst(
            ConflictingType.wrap(true),
            ConflictingStruct({ a: true }),
            ConflictingEnum.Third
        );

        conflictingTypeNameContractSecond = deployConflictingTypeNameContractSecond(
            TypegenConflictingNameContractsSecond_ConflictingType.wrap(1),
            TypegenConflictingNameContractsSecond_ConflictingStruct({ a: 1 }),
            TypegenConflictingNameContractsSecond_ConflictingEnum.Second
        );

        // Deploy contract with conflicting type names, then call functions to update those values
        conflictingTypeNameContractFirstTwo = deployConflictingTypeNameContractFirst(
            ConflictingType.wrap(true),
            ConflictingStruct({ a: true }),
            ConflictingEnum.Third,
            DeployOptions({ salt: 0, referenceName: "conflictingTypeNameContractFirstTwo" })
        );
        conflictingTypeNameContractFirstTwo.setConflictingTypes(
            ConflictingType.wrap(false),
            ConflictingStruct({ a: false }),
            ConflictingEnum.Second
        );

        // Deploy contract that uses msg.sender
        msgSender = deployMsgSender();
        msgSender.setSender();

        // Deploy contract that has unnamed parameters
        unnamedParameters = deployUnnamedParameters(1, 2);
        unnamedParameters.increment(1, 3);

        // Deploy inherited contract and interact with it
        child = deployChild(1, false, address(2));
        child.add(child.myPureB());
        child.add(child.myPureB(), 2);
        child.setMyAddress(address(3));

        // Deploy multi-inherited contract that uses an alias and interact with it
        grandchild = deployGrandchild(
            1,
            false,
            address(2),
            keccak256("3")
        );
        grandchild.setMyBytes32(grandchild.myPureC());
        grandchild.setMyAddress(address(4));
        grandchild.add(grandchild.myPureB());

        // Deploy contract that inherits from a contract in the same file
        childInSameFile = deployChildInSameFile(1, false);
        childInSameFile.setBool(true);
        childInSameFile.add(2);

        // Deploy two contracts with conflicting qualified names
        conflictingQualifiedNames = deployTypegenConflictingQualifiedNamesConflictingQualifiedNames_ConflictingQualifiedNames(1);
        conflictingQualifiedNamesA = deployConflictingQualifiedNames(
            true,
            DeployOptions({ salt: 0, referenceName: "conflictingQualifiedNamesA" })
        );

        // Deploy contract that inherits from a contract with a conflicting qualified name
        conflictingQualifiedNameChild = deployConflictingQualifiedNameChild(
            1,
            true
        );
        conflictingQualifiedNameChild.add(2);
        conflictingQualifiedNameChild.set(false);

        // Deploy contract that inherits from a contract in the same file which has a conflicting qualified name
        conflictingQualifiedNameChildInSameFile = deployConflictingQualifiedNameChildInSameFile(
            1,
            2
        );
        conflictingQualifiedNameChildInSameFile.addY(4);
        conflictingQualifiedNameChildInSameFile.add(4);

        // Deploy and interact with a contract that inherits from a contract that uses user defined types
        childParentImportsTypes = deployChildParentImportsTypes(
          MyLocalTypeLibrary.MyEnumInLibrary.Library,
          MyLocalTypeLibrary.MyStructInLibrary({ a: true }),
          MyLocalTypeLibrary.MyTypeInLibrary.wrap(true),
          MyLocalTypeContract.MyEnumInContract.Contract,
          MyLocalTypeContract.MyStructInContract({ a: keccak256("1") }),
          MyLocalTypeContract.MyTypeInContract.wrap(keccak256("2"))
        );
        childParentImportsTypes.updateValues(
          MyLocalTypeLibrary.MyEnumInLibrary.Local,
          MyLocalTypeLibrary.MyStructInLibrary({ a: false }),
          MyLocalTypeLibrary.MyTypeInLibrary.wrap(false),
          MyLocalTypeContract.MyEnumInContract.Enum,
          MyLocalTypeContract.MyStructInContract({ a: keccak256("3") }),
          MyLocalTypeContract.MyTypeInContract.wrap(keccak256("4"))
        );

        // Deploy and interact with a contract that overrides a function from a parent contract
        childOverrides = deployChildOverrides(2);
        childOverrides.add(2);

        // Deploy and interact with a contract that inherits from a parent contract which is
        // imported from a file that imports it from another file
        nestedImportChild = deployNestedImportChild("hello", 1, true);
        nestedImportChild.increment();
        nestedImportChild.setString("world");
        nestedImportChild.toggle();
    }
}
