// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title ICrossChainAdapter
 */
interface ICrossChainAdapter {
    function initiateRegistration(
        address payable _originEndpoint,
        uint32 _destinationDomainID,
        uint256 _relayerFee,
        bytes memory _calldata
    ) external;
}
