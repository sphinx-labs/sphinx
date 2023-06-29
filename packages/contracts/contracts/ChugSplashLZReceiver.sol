// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {
    ILayerZeroEndpoint
} from "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroEndpoint.sol";
import { LzApp } from "@layerzerolabs/solidity-examples/contracts/lzApp/LzApp.sol";

contract ChugSplashLZReceiver is LzApp {
    /**
     * @notice Emitted when a cross chain message is received.
     *
     * @param srcChainId Source chain id
     * @param srcAddress Remote address pair
     * @param nonce      Message nonce
     * @param payload    Message payload
     */
    event ReceivedCrossChainMessage(
        uint16 srcChainId,
        bytes srcAddress,
        uint64 nonce,
        bytes payload
    );

    constructor(address _endpoint) LzApp(_endpoint) {}

    /**
     * @notice Receives crosschain funding messages and emits a confirmation event.
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) public override {
        // lzReceive must be called by the endpoint for security
        require(msg.sender == address(lzEndpoint), "LzApp: invalid endpoint caller");

        emit ReceivedCrossChainMessage(_srcChainId, _srcAddress, _nonce, _payload);

        // TODO - handle if the message was for registration here
    }

    /**
     * @notice Overrides the _blockingLzReceive function from LzApp. We do not support
     *         receiving messages on this contract, so it's just empty. We include
     *         it to silence a compiler warning.
     */
    function _blockingLzReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64 _nonce,
        bytes memory _payload
    ) internal override {}
}
