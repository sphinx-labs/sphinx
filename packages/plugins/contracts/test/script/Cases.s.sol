// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { SphinxConfig, Version } from "../../../client/SphinxClient.sol";
import { Network } from "../../../contracts/foundry/SphinxPluginTypes.sol";
import { Sphinx } from "../../foundry/Sphinx.sol";
import { CREATE3 } from "solady/utils/CREATE3.sol";
import { ConstructorDeploysContract } from "../../../contracts/test/ConstructorDeploysContract.sol";
import { DeploymentCases } from "../../../contracts/test/DeploymentCases.sol";

contract Simple is Script, Sphinx {
    constructor() {
        sphinxConfig.projectName = "Deployment Cases Project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.mainnets = [Network.ethereum, Network.optimism];
        sphinxConfig.testnets = [Network.goerli];
        sphinxConfig.orgId = "test-org-id";
    }

    function run() public override sphinx {
        // Deploy with Create2
        DeploymentCases myContract = new DeploymentCases{ salt: 0 }(-1);
        myContract.set(1);

        // Perform low level call to fallback function
        (bool success, ) = address(myContract).call("");
        if (!success) {
            revert("Low level call to fallback function failed");
        }

        // Deploy with Create3
        bytes memory deploymentCasesInitCode = abi.encodePacked(type(DeploymentCases).creationCode, abi.encode(-1));
        DeploymentCases deploymentCases = DeploymentCases(CREATE3.deploy(bytes32(0), deploymentCasesInitCode, 0));
        deploymentCases.set(1);

        // Deploys contract that deploys another contract in its constructor using create2
        // The contract deployed in the constructor requires a label
        // ConstructorDeploysContract constructorDeploysContract = new ConstructorDeploysContract{ salt: 0 }(1);
        // sphinxLabel(address(constructorDeploysContract), "contracts/test/ConstructorDeploysContract.sol:ConstructorDeploysContract");

        // Deploys contract that deploys another contract in its constructor using create3
        // The contract deployed in the constructor requires a label
        // bytes memory constructorDeploysContractInitCode = abi.encodePacked(type(ConstructorDeploysContract).creationCode, abi.encode(1));
        // address constructorDeploysContractAddress = CREATE3.deploy(bytes32(0), constructorDeploysContractInitCode, 0);
        // sphinxLabel(constructorDeploysContractAddress, "contracts/test/ConstructorDeploysContract.sol:ConstructorDeploysContract");

        // Deploy a contract whose name is not unique in the source directory
    }
}
