// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ICrossChainAdapter } from "../../interfaces/ICrossChainAdapter.sol";
import { IConnext } from "@connext/interfaces/core/IConnext.sol";

/**
 * @title ConnextCrossChainAdapter
 */
contract ConnextCrossChainAdapter is ICrossChainAdapter {
    address public immutable registry;

    constructor(address _registry) {
        registry = _registry;
    }

    function initiateRegistration(
        address payable _originEndpoint,
        uint32 _destDomainID,
        uint256 _relayerFee,
        bytes memory _calldata
    ) external {
        IConnext(_originEndpoint).xcall{ value: _relayerFee }(
            _destDomainID, // _destination: Domain ID of the destination chain
            registry, // _to: address of the target contract on the destination chain
            address(0), // _asset: address of the token contract (this is unused)
            msg.sender, // _delegate: address that can revert or forceLocal on destination
            0, // _amount: amount of tokens to transfer (this is unused)
            0, // _slippage: this is unused
            _calldata // _callData: the encoded calldata to send
        );
    }
}
