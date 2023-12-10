// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { Sphinx } from "../../foundry/Sphinx.sol";
import { CREATE3 } from "solady/utils/CREATE3.sol";
import { ConstructorDeploysContract } from "../../../contracts/test/ConstructorDeploysContract.sol";
import { Fallback } from "../../../contracts/test/Fallback.sol";
import {
    MyContract2,
    MyContractWithLibrary,
    MyContractWithPreDeployedLibrary
} from "../../../contracts/test/MyContracts.sol";
import {
    ConflictingNameContract
} from "../../../contracts/test/conflictingNameContracts/First.sol";

contract Cases is Script, Sphinx {
    constructor() {
        sphinxConfig.projectName = "Deployment Cases Project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        sphinxConfig.mainnets = [Network.ethereum, Network.optimism];
        sphinxConfig.testnets = [Network.sepolia];
        sphinxConfig.orgId = "test-org-id";
    }

    function run() public override sphinx {
        // Deploy a contract, then call a function on it, then deploy another contract. it's
        // important to keep the order of these three actions in order to test that the Gnosis
        // Safe's nonce is incremented as a contract instead of an EOA. Contract nonces are not
        // incremented for function calls, whereas EOA nonces are.
        MyContract2 createContractOne = new MyContract2();
        createContractOne.incrementMyContract2(3);
        new MyContract2();

        // Deploy a contract and its library using `CREATE`, `CREATE2`, and `CREATE3`. We use a
        // constructor argument of 1, 2, and 3, respectively.
        new MyContractWithLibrary(1);
        new MyContractWithLibrary{ salt: 0 }(2);
        CREATE3.deploy({
            salt: bytes32(uint(9)),
            creationCode: abi.encodePacked(
                type(MyContractWithLibrary).creationCode,
                abi.encode(uint256(3))
            ),
            value: 0
        });

        // Deploy a contract that uses a pre-linked library, i.e. a library that has already been
        // deployed before this script is executed.
        new MyContractWithPreDeployedLibrary{ salt: 0 }(1111);

        // Deploy with Create2
        Fallback fallbackCreate2 = new Fallback{ salt: 0 }(-1);
        // Perform low level call to fallback function
        (bool success, ) = address(fallbackCreate2).call("");
        if (!success) {
            revert("Low level call to fallback function failed");
        }

        // Deploy with Create3
        bytes memory fallbackInitCode = abi.encodePacked(
            type(Fallback).creationCode,
            abi.encode(-1)
        );
        Fallback fallbackContract = Fallback(CREATE3.deploy(bytes32(0), fallbackInitCode, 0));
        fallbackContract.set(1);

        // Deploys contract that deploys another contract in its constructor using create2
        // The contract deployed is labeled
        ConstructorDeploysContract constructorDeploysContract = new ConstructorDeploysContract{
            salt: bytes32(uint(1))
        }(1);
        sphinxLabel(
            address(constructorDeploysContract.myContract()),
            "contracts/test/ConstructorDeploysContract.sol:DeployedInConstructor"
        );

        // Deploys contract that deploys another contract in its constructor using create3
        // Both the parent and child are labeled
        bytes memory constructorDeploysContractInitCode = abi.encodePacked(
            type(ConstructorDeploysContract).creationCode,
            abi.encode(2)
        );
        ConstructorDeploysContract constructorDeploysContractCreate3 = ConstructorDeploysContract(
            CREATE3.deploy(bytes32(uint(1)), constructorDeploysContractInitCode, 0)
        );
        sphinxLabel(
            address(constructorDeploysContractCreate3),
            "contracts/test/ConstructorDeploysContract.sol:ConstructorDeploysContract"
        );
        sphinxLabel(
            address(constructorDeploysContractCreate3.myContract()),
            "contracts/test/ConstructorDeploysContract.sol:DeployedInConstructor"
        );

        // Deploys contract that deploys another contract in its constructor using create2
        // The contract is not labeled
        new ConstructorDeploysContract{ salt: bytes32(uint(2)) }(3);

        // Deploys contract that deploys another contract in its constructor using create3
        // Neither contract is labeled
        bytes memory constructorDeploysContractUnlabeledInitCode = abi.encodePacked(
            type(ConstructorDeploysContract).creationCode,
            abi.encode(4)
        );
        CREATE3.deploy(bytes32(uint(2)), constructorDeploysContractUnlabeledInitCode, 0);

        // Deploy a contract whose name is not unique in the source directory
        // The contract is labeled
        ConflictingNameContract conflictingNameContract = new ConflictingNameContract{ salt: 0 }(1);
        sphinxLabel(
            address(conflictingNameContract),
            "contracts/test/conflictingNameContracts/First.sol:ConflictingNameContract"
        );

        // Deploy a contract whose name is not unique in the source directory
        // The contract is not labeled
        new ConflictingNameContract{ salt: bytes32(uint(1)) }(2);

        // Deploy a contract whose name is not unique in the source directory
        // We interact with the contract, so it does not require a label
        ConflictingNameContract conflictingNameContractInteract = new ConflictingNameContract{
            salt: bytes32(uint(2))
        }(3);
        conflictingNameContractInteract.set(5);
    }
}
