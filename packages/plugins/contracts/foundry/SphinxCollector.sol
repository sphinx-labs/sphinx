// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { CREATE3 } from "sphinx-solmate/utils/CREATE3.sol";
import { DeploymentInfo } from "./SphinxPluginTypes.sol";
import { console } from "sphinx-forge-std/console.sol";

/**
 * @title SphinxCollector
 * @notice Collects CREATE3 contract deployments, as well as the `DeploymentInfo` struct. This
 *         contract is meant to be called internally by Sphinx and not by the user. All
 *         transactions executed on this contract will be collected during the dry run, which occurs
 *         in the `sphinx deploy` CLI task and in proposals. This contract exists at the
 *         SphinxManager's address during the collection phase, which ensures that the deployed
 *         contracts have the same CREATE3 addresses as they would in production.
 */
contract SphinxCollector {
    /**
     * @notice Collects the DeploymentInfo struct, which is needed in Sphinx's TypeScript logic.
     */
    function collectDeploymentInfo(DeploymentInfo memory) external {}

    /**
     * @notice Deploys via CREATE3 and returns the deployed address.
     */
    function deploy(
        string memory fullyQualifiedName,
        bytes memory initCode,
        bytes memory constructorArgs,
        bytes32 userSalt,
        string memory referenceName
    ) public returns (address deployed) {
        // Removes a Solidity compiler warning. We use the fully qualified name off-chain, which is
        // why we define the function parameter name even though it's unused here.
        fullyQualifiedName;

        bytes32 create3Salt = keccak256(abi.encode(referenceName, userSalt));
        return CREATE3.deploy(create3Salt, abi.encodePacked(initCode, constructorArgs), 0);
    }
}
