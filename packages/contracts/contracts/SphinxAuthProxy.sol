// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { SphinxAuthFactory } from "./SphinxAuthFactory.sol";

/**
 * @title SphinxAuthProxy
 * @notice Proxy contract owned by the user. This proxy is designed to be upgradable by the user in
   an opt-in manner. New implementations of SphinxAuth must be approved by the owner of the
   SphinxAuthFactory contract to prevent malicious SphinxAuth implementations from being
   used.
 */
contract SphinxAuthProxy is Proxy {
    /**
     * @notice Address of the SphinxAuthFactory.
     */
    SphinxAuthFactory public immutable authFactory;

    /**
     * @notice Modifier that throws an error if the new implementation is not approved by the
       SphinxAuthFactory.

       @param _implementation The address of the new implementation.
     */
    modifier isApprovedImplementation(address _implementation) {
        require(
            authFactory.authImplementations(_implementation),
            "SphinxAuthProxy: unapproved implementation"
        );
        _;
    }

    /**
     * @param _authFactory           The SphinxAuthFactory's address.
     * @param _admin                 Owner of this contract. Usually the end-user.
     */
    constructor(SphinxAuthFactory _authFactory, address _admin) payable Proxy(_admin) {
        authFactory = _authFactory;
    }

    /**
     * @notice Sets a new implementation for this proxy. Only the owner can call this function. The
               new implementation must be approved by the SphinxAuthFactory to prevent malicious
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
               SphinxAuthFactory to prevent malicious SphinxAuth implementations.
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
