// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {
    SphinxConfig,
    Network,
    DeployOptions,
    DefineOptions
} from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxClient } from "../SphinxClient/SphinxClient.sol";
import { Version } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    ConflictingNameContract as ConflictingNameContractFirst
} from "../contracts/test/typegen/conflictingNameContracts/First.sol";
import {
    ConflictingNameContract as ConflictingNameContractSecond
} from "../contracts/test/typegen/conflictingNameContracts/Second.sol";
import { BasicInputTypes } from "../contracts/test/typegen/BasicInputTypes.sol";
import { BasicInputTypesClient } from "../SphinxClient/typegen/BasicInputTypes.SphinxClient.sol";
import { ImmutableInputTypes } from "../contracts/test/typegen/ImmutableInputTypes.sol";
import { ArrayInputTypes } from "../contracts/test/typegen/ArrayInputTypes.sol";
import { ArrayInputTypesClient } from "../SphinxClient/typegen/ArrayInputTypes.SphinxClient.sol";
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
import {
    FunctionContractClient
} from "../SphinxClient/typegen/contractInputs/FunctionContract.SphinxClient.sol";
import { FunctionInputContract } from "../contracts/test/typegen/FunctionInputType.sol";
import { ExternalContract } from "../testExternalContracts/ExternalContract.sol";
import { ExternalContractClient } from "../SphinxClient/ExternalContract.SphinxClient.sol";
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
import {
    ConflictingTypeNameContractFirstClient
} from "../SphinxClient/typegen/conflictingTypeNames/First.SphinxClient.sol";
import { MsgSender } from "../contracts/test/MsgSender.sol";
import { MsgSenderClient } from "../SphinxClient/MsgSender.SphinxClient.sol";

import "forge-std/Test.sol";

// TODO(test): you should use `vm.createSelectFork` in one of your tests for the solidity
// config.

// TODO(test): what happens if you startBroadcast with a public key, not private key, on anvil?

// TODO(md): consider changing the readme so that it focuses on the local deployment experience
// first, then talks about the devops platform next.

contract TypeGenTestConfig is Test, SphinxClient {
    ConflictingNameContractFirst firstConflictingNameContract;
    ConflictingNameContractSecond secondConflictingNameContract;
    BasicInputTypes basicInputTypes;
    BasicInputTypes basicInputTypesTwo;
    ImmutableInputTypes immutableInputTypes;
    ArrayInputTypes arrayInputTypes;
    ArrayInputTypes arrayInputTypesTwo;
    NoAliasImportsOne noAliasImportsOne;
    NoAliasImportsTwo noAliasImportsTwo;
    AliasImports aliasImports;
    LocalParentTypes localParentTypes;
    FunctionContract functionContract;
    FunctionContract functionContractTwo;
    FunctionInputContract functionInputContract;
    ExternalContract externalContract;
    ExternalContract alreadyDeployedExternalContract;
    address alreadyDeployedContractAddress;
    ConflictingTypeNameContractFirst conflictingTypeNameContractFirst;
    ConflictingTypeNameContractSecond conflictingTypeNameContractSecond;
    ConflictingTypeNameContractFirst conflictingTypeNameContractFirstTwo;
    ConflictingTypeNameContractFirstClient conflictingTypeNameContractClient;
    MsgSender msgSender;

    uint8[] public intialUintDynamicArray;
    bytes32[][] public initialUintNestedDynamicArray;
    address[3] public initialUintStaticArray;

    uint8[] public updatedUintDynamicArray;
    bytes32[][] public updatedUintNestedDynamicArray;
    address[3] public updatedUintStaticArray;

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
        firstConflictingNameContract = ConflictingNameContractFirst(
            address(deployConflictingNameContract(5))
        );
        secondConflictingNameContract = ConflictingNameContractSecond(
            address(deployTypegenConflictingNameContractsSecond_ConflictingNameContract(address(5)))
        );

        // Deploy contract testing basic types
        basicInputTypes = BasicInputTypes(
            address(
                deployBasicInputTypes(
                    1,
                    2,
                    3,
                    4,
                    address(5),
                    keccak256("6"),
                    bytes("hello"),
                    true,
                    "world"
                )
            )
        );

        // Deploy contract with basic types, then call a function to update those values
        BasicInputTypesClient basicInputTypesTwoClient = deployBasicInputTypes(
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
        basicInputTypesTwoClient.setValues(
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
        basicInputTypesTwo = BasicInputTypes(address(basicInputTypesTwoClient));

        // Deploy contract with immutable input types
        immutableInputTypes = ImmutableInputTypes(
            address(deployImmutableInputTypes(1, 2, 3, 4, address(5), keccak256("6"), true))
        );

        // Deploy contract with array input types
        arrayInputTypes = ArrayInputTypes(
            address(
                deployArrayInputTypes(
                    intialUintDynamicArray,
                    initialUintNestedDynamicArray,
                    initialUintStaticArray
                )
            )
        );

        // Deploy contract with array input types, then call function to update those values
        ArrayInputTypesClient arrayInputTypesTwoClient = deployArrayInputTypes(
            intialUintDynamicArray,
            initialUintNestedDynamicArray,
            initialUintStaticArray,
            DeployOptions({ salt: 0, referenceName: "arrayInputTypesTwo" })
        );
        arrayInputTypesTwoClient.setValues(
            updatedUintDynamicArray,
            updatedUintNestedDynamicArray,
            updatedUintStaticArray
        );
        arrayInputTypesTwo = ArrayInputTypes(address(arrayInputTypesTwoClient));

        // Deploy contracts which requires all types of imports without any aliasing
        noAliasImportsOne = NoAliasImportsOne(
            address(
                deployNoAliasImportsOne(
                    MyTypeLibrary.MyEnumInLibrary.Library,
                    MyTypeLibrary.MyStructInLibrary({ a: 1 }),
                    MyTypeLibrary.MyTypeInLibrary.wrap(2),
                    MyTypeContract.MyEnumInContract.Contract,
                    MyTypeContract.MyStructInContract({ a: keccak256("3") }),
                    MyTypeContract.MyTypeInContract.wrap(keccak256("4"))
                )
            )
        );

        noAliasImportsTwo = NoAliasImportsTwo(
            address(
                deployNoAliasImportsTwo(
                    MyTopLevelEnum.TopLevel,
                    MyTopLevelStruct({ a: true }),
                    MyTopLevelType.wrap(true),
                    MyLocalEnum.Local,
                    MyLocalStruct({ a: -1 }),
                    MyLocalType.wrap(-2)
                )
            )
        );

        // Deploy contract which requires all types of imports with aliasing
        aliasImports = AliasImports(
            address(
                deployAliasImports(
                    MyTypeLibraryAlias.MyEnumInLibrary.Library,
                    MyTypeLibraryAlias.MyStructInLibrary({ a: 1 }),
                    MyTypeLibraryAlias.MyTypeInLibrary.wrap(2),
                    MyTypeContractAlias.MyEnumInContract.Contract,
                    MyTypeContractAlias.MyStructInContract({ a: keccak256("3") }),
                    MyTypeContractAlias.MyTypeInContract.wrap(keccak256("4")),
                    MyTopLevelEnumAlias.TopLevel,
                    MyTopLevelStructAlias({ a: true }),
                    MyTopLevelTypeAlias.wrap(true)
                )
            )
        );

        // Deploy contract which requires all types imported from a locally defined parent object
        localParentTypes = LocalParentTypes(
            address(
                deployLocalParentTypes(
                    MyLocalTypeLibrary.MyEnumInLibrary.Library,
                    MyLocalTypeLibrary.MyStructInLibrary({ a: true }),
                    MyLocalTypeLibrary.MyTypeInLibrary.wrap(true),
                    MyLocalTypeContract.MyEnumInContract.Contract,
                    MyLocalTypeContract.MyStructInContract({ a: keccak256("1") }),
                    MyLocalTypeContract.MyTypeInContract.wrap(keccak256("2"))
                )
            )
        );

        // Deploy contracts to be used as input
        address myImportContractOne = address(deployMyImportContract(1));
        address localContractOne = address(deployLocalContract(1));

        address myImportContractTwo = address(
            deployMyImportContract(
                2,
                DeployOptions({ salt: 0, referenceName: "myImportContractTwo" })
            )
        );
        address localContractTwo = address(
            deployLocalContract(2, DeployOptions({ salt: 0, referenceName: "localContractTwo" }))
        );

        // Deploy contract which requires contract inputs
        functionContract = FunctionContract(
            address(deployFunctionContract(myImportContractOne, localContractOne))
        );

        // Deploy contract which requires contract inputs, then call functions to update those values
        FunctionContractClient functionContractClient = deployFunctionContract(
            myImportContractOne,
            localContractOne,
            DeployOptions({ salt: 0, referenceName: "functionContractTwo" })
        );
        functionContractClient.setImportContract(myImportContractTwo);
        functionContractClient.setLocalContract(localContractTwo);
        functionContractTwo = FunctionContract(address(functionContractClient));

        // Deploy contract which has function inputs
        functionInputContract = FunctionInputContract(address(deployFunctionInputContract()));

        // Deploy external contract
        ExternalContractClient externalContractClient = deployExternalContract(5);
        externalContractClient.setNumber(6);
        externalContract = ExternalContract(address(externalContractClient));

        // Define external contract and interact with it
        ExternalContractClient alreadyDeployedExternalContractClient = defineExternalContract(
            alreadyDeployedContractAddress,
            DefineOptions({ referenceName: "MyExternalContract" })
        );
        alreadyDeployedExternalContractClient.setNumber(7);
        alreadyDeployedExternalContract = ExternalContract(
            address(alreadyDeployedExternalContractClient)
        );

        // Deploy contracts with conflicting type names
        conflictingTypeNameContractFirst = ConflictingTypeNameContractFirst(
            address(
                deployConflictingTypeNameContractFirst(
                    ConflictingType.wrap(true),
                    ConflictingStruct({ a: true }),
                    ConflictingEnum.Third
                )
            )
        );

        conflictingTypeNameContractSecond = ConflictingTypeNameContractSecond(
            address(
                deployConflictingTypeNameContractSecond(
                    TypegenConflictingNameContractsSecond_ConflictingType.wrap(1),
                    TypegenConflictingNameContractsSecond_ConflictingStruct({ a: 1 }),
                    TypegenConflictingNameContractsSecond_ConflictingEnum.Second
                )
            )
        );

        // Deploy contract with conflicting type names, then call functions to update those values
        conflictingTypeNameContractClient = deployConflictingTypeNameContractFirst(
            ConflictingType.wrap(true),
            ConflictingStruct({ a: true }),
            ConflictingEnum.Third,
            DeployOptions({ salt: 0, referenceName: "conflictingTypeNameContractFirstTwo" })
        );
        conflictingTypeNameContractClient.setConflictingTypes(
            ConflictingType.wrap(false),
            ConflictingStruct({ a: false }),
            ConflictingEnum.Second
        );
        conflictingTypeNameContractFirstTwo = ConflictingTypeNameContractFirst(
            address(conflictingTypeNameContractClient)
        );

        // Deploy contract that uses msg.sender
        MsgSenderClient msgSenderClient = deployMsgSender();
        msgSenderClient.setSender();
        msgSender = MsgSender(address(msgSenderClient));
    }
}
