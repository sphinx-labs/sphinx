// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { LzApp } from "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";
import {
    ILayerZeroEndpoint
} from "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroEndpoint.sol";
import { LayerZeroFundingMessage, LayerZeroMessage } from "./ChugSplashDataTypes.sol";

contract ChugSplashLZSender is LzApp {
    /**
     * @custom:field chainId Chain ID of the destination chain.
     * @custom:field lzReceiver Address of the ChugSplashLZReceiver contract on the destination
       chain. This is set as the only trusted remote contract, which ensures that users don't
       accidentally send messages or funds to untrusted contracts.
     */
    struct DestinationChainInfo {
        uint16 chainId;
        address lzReceiver;
    }

    event SentMessage(
        address indexed receiver,
        uint16 dstChainId,
        bytes payload,
        uint256 destGas,
        uint256 nativeFee
    );

    event SentFunds(
        address indexed airdropAddress,
        uint16 dstChainId,
        uint256 amount,
        uint256 destGas,
        uint256 nativeFee
    );

    event RefundedExtraETH(address indexed receiver, uint256 amount);

    /**
     *
     * @param _localEndpoint Address of the LayerZero endpoint contract on this chain.
     * @param _destChains Array of DestinationChainInfo structs.
     * @param _owner      Address of the owner of this contract. The owner will be allowed to call
                          the permissioned functions on the inherited LzApp contract. This will
                          mainly be used for updating the trusted remote address.
     */
    constructor(
        address _localEndpoint,
        DestinationChainInfo[] memory _destChains,
        address _owner
    ) LzApp(_localEndpoint) {
        DestinationChainInfo memory destChain;
        bytes memory addressPair;
        for (uint i = 0; i < _destChains.length; i++) {
            destChain = _destChains[i];
            addressPair = abi.encodePacked(destChain.lzReceiver, address(this));
            // Set the trusted remote address for the destination chain
            trustedRemoteLookup[destChain.chainId] = addressPair;
            emit SetTrustedRemote(destChain.chainId, addressPair);
        }

        _transferOwnership(_owner);
    }

    /**
     * @notice Handles sending a batch of LayerZero cross-chain messages that fund
     *         contracts on destination chains. This contract assumestoff-chain logic checked that
               the airdrop amount is less than the total airdrop amount allowed by LayerZero, which
               varies by chain, and is hard to calculate on-chain.
     *
     * @param messages Array of LayerZeroFundingMessage structs
     */
    function sendBatchFunds(LayerZeroFundingMessage[] memory messages) public payable {
        // Calculate the total amount to be sent
        uint total = 0;
        bytes[] memory adapterParams = new bytes[](messages.length);
        uint[] memory nativeFees = new uint[](messages.length);
        LayerZeroFundingMessage memory message;
        bytes memory adapterParam;
        for (uint i = 0; i < messages.length; i++) {
            message = messages[i];

            // Require the airdrop value be above 0 and not being sent to the zero address
            require(message.airdropAmount > 0, "ChugSplashLZSender: airdrop amount must be greater than 0");
            require(message.airdropAddress != address(0), "ChugSplashLZSender: cannot airdrop to address 0");

            // use adapterParams v2 to specify the amount of gas to send to the lzReceiver on the
            // destination chain, and the amount funds that the `airdropAddress` should receive on
            // the destination chain.
            uint16 version = 2;
            adapterParam = abi.encodePacked(
                version,
                message.destGas,
                message.airdropAmount,
                message.airdropAddress
            );
            adapterParams[i] = adapterParam;

            (uint fee, ) = lzEndpoint.estimateFees(
                message.dstChainId,
                address(this),
                "", // We don't send a message payload when sending funds
                false, // This contract dose not support paying with LayerZero's ZRO token
                adapterParam
            );
            nativeFees[i] = fee;

            total += fee;
        }

        // Revert if the user didn't send enough funds
        require(msg.value >= total, "ChugSplashLZSender: insufficient funds");

        // Send all the messages
        uint256 nativeFee;
        for (uint i = 0; i < messages.length; i++) {
            message = messages[i];
            adapterParam = adapterParams[i];
            nativeFee = nativeFees[i];

            _lzSend(
                message.dstChainId,
                "", // We don't send a message payload when sending funds
                payable(msg.sender),
                address(0x0),
                adapterParam,
                nativeFee
            );

            emit SentFunds(
                message.airdropAddress,
                message.dstChainId,
                message.airdropAmount,
                message.destGas,
                nativeFee
            );
        }

        _refundExtraETH(total);
    }

    /**
     * @notice Handles sending a batch of LayerZero cross-chain messages. Does not include
     *         sending funds to an address on the destination chain.
     *
     * @param messages Array of LayerZeroFundingMessage structs.
     */
    function sendBatchMessages(LayerZeroMessage[] memory messages) public payable {
        uint totalFee = 0;
        bytes[] memory adapterParams = new bytes[](messages.length);
        uint[] memory nativeFees = new uint[](messages.length);
        LayerZeroMessage memory message;
        bytes memory adapterParam;
        for (uint i = 0; i < messages.length; i++) {
            message = messages[i];

            // Use LayerZero's adapter params v1 to specify a custom amount of gas to send to the
            // `lzReceive` function on the destination chain.
            uint16 version = 1;
            adapterParam = abi.encodePacked(version, message.destGas);
            adapterParams[i] = adapterParam;

            (uint fee, ) = lzEndpoint.estimateFees(
                message.dstChainId,
                address(this),
                message.payload,
                false, // This contract dose not support paying with LayerZero's ZRO token
                adapterParam
            );
            nativeFees[i] = fee;

            totalFee += fee;
        }

        // Revert if the user didn't send enough funds
        require(msg.value >= totalFee, "ChugSplashLZSender: insufficient funds to send messages");

        // Send all the messages
        uint256 nativeFee;
        for (uint i = 0; i < messages.length; i++) {
            message = messages[i];
            adapterParam = adapterParams[i];
            nativeFee = nativeFees[i];

            _lzSend(
                message.dstChainId,
                message.payload,
                payable(msg.sender),
                address(0x0),
                adapterParam,
                nativeFee
            );

            address receiver = abi.decode(this.getTrustedRemoteAddress(message.dstChainId), (address));
            emit SentMessage(
                receiver,
                message.dstChainId,
                message.payload,
                message.destGas,
                nativeFee
            );
        }

        _refundExtraETH(totalFee);
    }

    function _refundExtraETH(uint256 _totalSent) private {
        uint256 leftover = msg.value - _totalSent;
        if (leftover > 0) {
            (bool success, ) = payable(msg.sender).call{ value: leftover }(new bytes(0));
            require(success, "ChugSplashLZSender: failed to refund extra ETH");
        }
        emit RefundedExtraETH(msg.sender, leftover);
    }

    /**
     * @notice Overrides the _blockingLzReceive function from LzApp. We do not support
     *         receiving messages on this contract, so it's just empty. It's necessary for us to
               override this function so that this contract isn't marked abstract by the Solidity
               compiler.
     */
    function _blockingLzReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64 _nonce,
        bytes memory _payload
    ) internal override {}

    receive() external payable {
        // Prevents potential user error which would lock ETH in this contract.
        revert("ChugSplashLZSender: cannot send ETH directly to this contract");
    }
}
