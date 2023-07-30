// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { IChugSplashManager } from "./interfaces/IChugSplashManager.sol";

/**
 * @title ChugSplashManagerProxy
 * @notice Proxy contract owned by the user. This contract delegatecalls into the ChugSplashManager
   contract to perform deployments. This proxy is designed to be upgradable by the user in a fully
   opt-in manner. New implementations of the ChugSplashManager must be approved by the
   ChugSplashRegistry contract to prevent malicious ChugSplashManager implementations from being
   used.
 */
contract ChugSplashManagerProxy is Proxy {
    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @notice Modifier that throws an error if a deployment is currently in progress.
     */
    modifier isNotExecuting() {
        address impl = _getImplementation();
        require(
            impl == address(0) || !IChugSplashManager(impl).isExecuting(),
            "ChugSplashManagerProxy: execution in progress"
        );
        _;
    }

    /**
     * @notice Modifier that throws an error if the new implementation is not approved by the
       ChugSplashRegistry.

       @param _implementation The address of the new implementation.
     */
    modifier isApprovedImplementation(address _implementation) {
        require(
            registry.managerImplementations(_implementation),
            "ChugSplashManagerProxy: unapproved manager"
        );
        _;
    }

    /**
     * @param _registry              The ChugSplashRegistry's address.
     * @param _admin                 Owner of this contract. Usually the end-user.
     */
    constructor(ChugSplashRegistry _registry, address _admin) payable Proxy(_admin) {
        registry = _registry;
    }

    /**
     * @notice Sets a new implementation for this proxy. Only the owner can call this function. This
               function can only be called when a deployment is not in progress to prevent
               unexpected behavior. The new implementation must be approved by the
               ChugSplashRegistry to prevent malicious ChugSplashManager implementations.
     */
    function upgradeTo(
        address _implementation
    ) public override proxyCallIfNotAdmin isNotExecuting isApprovedImplementation(_implementation) {
        super.upgradeTo(_implementation);
    }

    /**
     * @notice Sets a new implementation for this proxy and delegatecalls an arbitrary function.
               Only the owner can call this function. This function can only be called when a
               deployment is not in progress to prevent unexpected behavior. The new implementation
               must be approved by the ChugSplashRegistry to prevent malicious ChugSplashManager
               implementations.
     */
    function upgradeToAndCall(
        address _implementation,
        bytes calldata _data
    )
        public
        payable
        override
        proxyCallIfNotAdmin
        isNotExecuting
        isApprovedImplementation(_implementation)
        returns (bytes memory)
    {
        return super.upgradeToAndCall(_implementation, _data);
    }
}
