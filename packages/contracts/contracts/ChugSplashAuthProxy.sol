// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { ChugSplashAuthFactory } from "./ChugSplashAuthFactory.sol";

/**
 * @title ChugSplashAuthProxy
 * @notice Proxy contract owned by the user. This proxy is designed to be upgradable by the user in
   a fully opt-in manner. New implementations of ChugSplashAuth must be approved by the owner of the
   ChugSplashAuthFactory contract to prevent malicious ChugSplashAuth implementations from being used.
 */
contract ChugSplashAuthProxy is Proxy {
    /**
     * @notice Address of the ChugSplashAuthFactory.
     */
    ChugSplashAuthFactory public immutable authFactory;

    /**
     * @notice Modifier that throws an error if the new implementation is not approved by the
       ChugSplashAuthFactory.

       @param _implementation The address of the new implementation.
     */
    modifier isApprovedImplementation(address _implementation) {
        require(
            authFactory.authImplementations(_implementation),
            "ChugSplashAuthProxy: unapproved implementation"
        );
        _;
    }

    /**
     * @param _authFactory           The ChugSplashAuthFactory's address.
     * @param _admin                 Owner of this contract. Usually the end-user.
     */
    constructor(ChugSplashAuthFactory _authFactory, address _admin) payable Proxy(_admin) {
        authFactory = _authFactory;
    }

    /**
     * @notice Sets a new implementation for this proxy. Only the owner can call this function. The
               new implementation must be approved by the ChugSplashAuthFactory to prevent malicious
               ChugSplashAuth implementations.
     */
    function upgradeTo(
        address _implementation
    ) public override proxyCallIfNotAdmin isApprovedImplementation(_implementation) {
        super.upgradeTo(_implementation);
    }

    /**
     * @notice Sets a new implementation for this proxy and delegatecalls an arbitrary function.
               Only the owner can call this function. The new implementation must be approved by the
               ChugSplashAuthFactory to prevent malicious ChugSplashAuth implementations.
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
