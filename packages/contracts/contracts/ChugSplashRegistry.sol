// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashManager } from "./ChugSplashManager.sol";

/**
 * @title ChugSplashRegistry
 * @notice The ChugSplashRegistry is the root contract for the ChugSplash deployment system. All
 * deployments must be first registered with this contract, which allows clients to easily find and
 * index these deployments. Deployment names are unique and are reserved on a first-come,
 * first-served basis.
 */
contract ChugSplashRegistry {
    /**
     * Emitted whenever a new deployment is registered.
     */
    event ChugSplashProjectRegistered(
        string indexed name,
        address indexed creator,
        address indexed owner,
        address manager
    );

    /**
     * Registry of ChugSplashManager proxies keyed by name.
     */
    mapping(string => ChugSplashManager) public registry;

    /**
     * Registers a new project and deploys a corresponding ChugSplashManager contract.
     *
     * @param _name Name of the new ChugSplash project.
     * @param _owner Initial owner for the new ChugSplashManager contract.
     * @return Address of the newly deployed ChugSplashManager contract.
     */
    function register(string memory _name, address _owner) public returns (address) {
        // TODO: Standardize error reporting system.
        require(
            address(registry[_name]) == address(0),
            "ChugSplashRegistry: name already registered"
        );

        // By making the salt be the hash of the name, we can easily predict the address of the
        // ChugSplashManager contract based on the project's name.
        bytes32 salt = keccak256(bytes(_name));
        registry[_name] = new ChugSplashManager{ salt: salt }(_owner);
        emit ChugSplashProjectRegistered(_name, msg.sender, _owner, address(registry[_name]));
        return address(registry[_name]);
    }
}
