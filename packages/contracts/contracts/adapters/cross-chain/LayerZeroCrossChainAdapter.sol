// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;
pragma abicoder v2;

import { ILayerZeroEndpoint } from "../../interfaces/layerzero/ILayerZeroEndpoint.sol";
import { ICrossChainAdapter } from "../../interfaces/ICrossChainAdapter.sol";
import { RegistrationInfo, CrossChainMessageInfo } from "../../ChugSplashDataTypes.sol";
import { ChugSplashRegistry } from "../../ChugSplashRegistry.sol";

contract LayerZeroCrossChainAdapter is ICrossChainAdapter {
    constructor(address _registry) {
        registry = _registry;
    }

    address public immutable registry;

    function initiateCall(CrossChainMessageInfo memory _message, bytes memory _data) external {
        ILayerZeroEndpoint(_message.localEndpoint).send{ value: _message.relayerFee }(
            uint16(_message.remoteDomainID),
            abi.encodePacked(registry),
            _data,
            payable(msg.sender),
            address(0),
            bytes("")
        );
    }
}
