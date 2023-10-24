// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { CREATE3 } from "sphinx-solmate/utils/CREATE3.sol";
import { DeploymentInfo } from "./SphinxPluginTypes.sol";
import { console } from 'sphinx-forge-std/console.sol';

/**
 * @title SphinxCollector
 * @notice This contract is used as a substitute for an actual SphinxManager when collecting actions
 *         in `Sphinx.sol`. We substite the SphinxManager as a performance optimization. Using
 *         the actual SphinxManager would require us to run the full execution flow anytime the
 *         user runs a test that calls `Sphinx.deploy`. This would slow down tests by ~20-30
 *         seconds, which is unacceptable. Instead, we use this contract to collect the actions,
 *         then run the full execution flow if the user is broadcasting or proposing a deployment.
 */
contract SphinxCollector {

    function collectDeploymentInfo(DeploymentInfo memory) external {}

    // TODO(docs): replace this contract with the SphinxDefaultCreate3 contract

    function deploy(
        string memory fullyQualifiedName,
        bytes memory initCode,
        bytes memory constructorArgs,
        bytes32 userSalt,
        string memory referenceName
    ) public returns (address deployed) {
        fullyQualifiedName;

        bytes32 create3Salt = keccak256(abi.encode(referenceName, userSalt));
        return CREATE3.deploy(create3Salt, abi.encodePacked(initCode, constructorArgs), 0);
    }
}
