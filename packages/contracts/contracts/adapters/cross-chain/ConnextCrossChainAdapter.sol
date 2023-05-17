// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ICrossChainAdapter } from "../../interfaces/ICrossChainAdapter.sol";
import { IConnext } from "@connext/interfaces/core/IConnext.sol";
import { RegistrationInfo, CrossChainMessageInfo } from "../../ChugSplashDataTypes.sol";
import { ChugSplashRegistry } from "../../ChugSplashRegistry.sol";

/**
 * @title ConnextCrossChainAdapter
 */
contract ConnextCrossChainAdapter is ICrossChainAdapter {
    address public immutable registry;

    constructor(address _registry) {
        registry = _registry;
    }

    function initiateRegistration(
        bytes32 _orgID,
        RegistrationInfo memory _registration,
        CrossChainMessageInfo memory _message
    ) external {
        bytes memory registryCalldata = abi.encodeCall(
            ChugSplashRegistry.finalizeRegistration,
            (
                _orgID,
                _registration.owner,
                _registration.version,
                _registration.managerInitializerData
            )
        );

        IConnext(_message.originEndpoint).xcall{ value: _message.relayerFee }(
            _message.destDomainID, // _destination: Domain ID of the destination chain
            registry, // _to: address of the target contract on the destination chain
            address(0), // _asset: address of the token contract (this is unused)
            msg.sender, // _delegate: address that can revert or forceLocal on destination
            0, // _amount: amount of tokens to transfer (this is unused)
            0, // _slippage: this is unused
            registryCalldata // _callData: the encoded calldata to send
        );
    }
}
