// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { SphinxFactory } from "./SphinxFactory.sol";

/**
 * @title SphinxAuthProxy
 * @notice Proxy contract owned by the user. This proxy is designed to be upgradable by the user in
   an opt-in manner. New implementations of SphinxAuth must be approved by the owner of the
   SphinxFactory contract to prevent malicious SphinxAuth implementations from being
   used.
 */
contract SphinxAuthProxy is Proxy {
    /**
     * @notice Address of the SphinxFactory.
     */
    SphinxFactory public immutable factory;

    /**
     * @notice Modifier that throws an error if the new implementation is not approved by the
       SphinxFactory.

       @param _implementation The address of the new implementation.
     */
    modifier isApprovedImplementation(address _implementation) {
        require(
            factory.authImplementations(_implementation),
            "SphinxAuthProxy: unapproved implementation"
        );
        _;
    }

    /**
     * @param _factory           The SphinxFactory's address.
     * @param _admin                 Owner of this contract. Usually the end-user.
     */
    constructor(SphinxFactory _factory, address _admin) payable Proxy(_admin) {
        factory = _factory;
    }

    /**
     * @notice Sets a new implementation for this proxy. Only the owner can call this function. The
               new implementation must be approved by the SphinxFactory to prevent malicious
               SphinxAuth implementations.
     */
    function upgradeTo(
        address _implementation
    ) public override proxyCallIfNotAdmin isApprovedImplementation(_implementation) {
        super.upgradeTo(_implementation);
    }

    /**
     * @notice Sets a new implementation for this proxy and delegatecalls an arbitrary function.
               Only the owner can call this function. The new implementation must be approved by the
               SphinxFactory to prevent malicious SphinxAuth implementations.
     */
    function upgradeToAndCall(
        address _implementation,
        bytes calldata _data
    )
        public
        payable
        override
        proxyCallIfNotAdmin
        isApprovedImplementation(_implementation)
        returns (bytes memory)
    {
        return super.upgradeToAndCall(_implementation, _data);
    }
}
