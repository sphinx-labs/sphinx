// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {
    ILayerZeroEndpoint
} from "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroEndpoint.sol";
import { NonblockingLzApp } from "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";

/**
 * @title ChugSplashLZReceiver
 * @notice This contract receives LayerZero cross chain messages. This contract is meant to handle
           permissionless operations, such as sending funds to trusted contracts and registering new
           organizations, so we don't need to check the address on the source chain that sent the
           message. In other words, we don't use LayerZero's trusted remote lookup.

           We use the non-blocking version of LayerZero so that we can continue to receive messages
           if a transaction fails on this chain.
 */
contract ChugSplashLZReceiver is NonblockingLzApp {
    /**
     * @notice Emitted when a cross chain message is received.
     *
     * @param srcChainId  Source chain id
     * @param srcAddress  Remote address pair
     * @param nonce       Message nonce
     * @param payloadHash Hash of the message payload. Checking for the entire payload can be
     *                    expensive.
     */
    event ReceivedCrossChainMessage(
        uint16 srcChainId,
        bytes srcAddress,
        uint64 nonce,
        bytes32 payloadHash
    );

    constructor(address _endpoint, address _owner) NonblockingLzApp(_endpoint) {
        // The owner will be allowed to call the permissioned functions on the inherited LzApp. We
        // don't intend to use this functionality, but we need to change the owner because otherwise
        // it will be set to the address that deployed this contract. This is default behavior for
        // OpenZeppelin's Ownable contract.
        _transferOwnership(_owner);
    }

    /**
     * @notice Receives crosschain funding messages and emits a confirmation event. LayerZero
              recommends overriding `_nonblockingLzReceive`, but it's necessary for us to override
              this function instead because the inherited version of this function requires a
              trusted remote address pair, which we don't use.
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) public override {
        // This contract is only meant to be called by the LayerZero endpoint, so we revert
        // if the caller is different.
        require(msg.sender == address(lzEndpoint), "LzApp: invalid endpoint caller");

        emit ReceivedCrossChainMessage(_srcChainId, _srcAddress, _nonce, keccak256(_payload));

        if (_payload.length > 0) {
            (address to, bytes memory data) = abi.decode(_payload, (address, bytes));
            (bool success, bytes memory retdata) = to.call(data);
            require(success, string(retdata));
        }
    }

    /**
     * @notice Overrides the inherited function from LayerZero. It's necessary for us to override
       this function so that this contract isn't marked abstract by the Solidity compiler. We
       override the message receiving functionality of `lzReceive` instead of this function. See the
       docs for `lzReceive` for more details.
     */
    function _nonblockingLzReceive(
        uint16,
        bytes memory,
        uint64,
        bytes memory
    ) internal virtual override {}
}
