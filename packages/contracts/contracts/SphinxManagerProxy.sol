// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { SphinxRegistry } from "./SphinxRegistry.sol";
import { ISphinxManager } from "./interfaces/ISphinxManager.sol";

/**
 * @title SphinxManagerProxy
 * @notice Proxy contract owned by the user. This contract delegatecalls into the SphinxManager
   contract to perform deployments. This proxy is designed to be upgradable by the user in an opt-in
   manner. New implementations of the SphinxManager must be approved by the owner of the
   SphinxRegistry contract to prevent malicious SphinxManager implementations from being
   used.
 */
contract SphinxManagerProxy is Proxy {
    /**
     * @notice Address of the SphinxRegistry.
     */
    SphinxRegistry public immutable registry;

    /**
     * @notice Modifier that throws an error if a deployment is currently in progress.
     */
    modifier isNotExecuting() {
        address impl = _getImplementation();
        require(
            impl == address(0) || !ISphinxManager(impl).isExecuting(),
            "SphinxManagerProxy: execution in progress"
        );
        _;
    }

    /**
     * @notice Modifier that throws an error if the new implementation is not approved by the
       SphinxRegistry.

       @param _implementation The address of the new implementation.
     */
    modifier isApprovedImplementation(address _implementation) {
        require(
            registry.managerImplementations(_implementation),
            "SphinxManagerProxy: unapproved manager"
        );
        _;
    }

    /**
     * @param _registry              The SphinxRegistry's address.
     * @param _admin                 Owner of this contract. Usually the end-user.
     */
    constructor(SphinxRegistry _registry, address _admin) payable Proxy(_admin) {
        registry = _registry;
    }

    /**
     * @notice Sets a new implementation for this proxy. Only the owner can call this function. This
               function can only be called when a deployment is not in progress to prevent
               unexpected behavior. The new implementation must be approved by the
               SphinxRegistry to prevent malicious SphinxManager implementations.
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
               must be approved by the SphinxRegistry to prevent malicious SphinxManager
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
