// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { LzApp } from "@layerzerolabs/solidity-examples/contracts/lzApp/LzApp.sol";
import {
    ILayerZeroEndpoint
} from "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroEndpoint.sol";
import { FunderAction } from "./ChugSplashDataTypes.sol";

contract ChugSplashFunder is LzApp {
    constructor(address _endpoint) LzApp(_endpoint) {}

    /**
     * @notice Handles sending a batch of fund actions
     *
     * @param actions Set of FunderActions
     */
    function sendBatchFundActions(FunderAction[] memory actions) public payable {
        // Calculate the total cost
        uint total = 0;
        uint zroAmount = 0;
        bytes[] memory adapterParams = new bytes[](actions.length);
        uint[] memory nativeFees = new uint[](actions.length);
        for (uint i = 0; i < actions.length; i++) {
            // Require the airdrop value be above 0 and not being sent to the zero address
            require(actions[i].airdropAmount > 0, "Airdrop amount must be greater than 0");
            require(actions[i].airdropAddress != address(0), "Cannot airdrop to address 0");

            // use adapterParams v1 to specify more gas for the destination
            uint16 version = 2;
            uint gasForDestinationLzReceive = 200000;
            adapterParams[i] = abi.encodePacked(
                version,
                gasForDestinationLzReceive,
                // We assume the user checked the airdrop limit offchain
                actions[i].airdropAmount,
                actions[i].airdropAddress
            );

            (uint nativeFee, uint zroFee) = lzEndpoint.estimateFees(
                actions[i].dstChainId,
                address(this),
                actions[i].payload,
                actions[i].payInZRO,
                adapterParams[i]
            );
            nativeFees[i] = nativeFee;

            total += nativeFee;
            zroAmount += zroFee;
        }

        // Revert if attempting to pay in ZRO (which is not live yet)
        require(zroAmount == 0, "Paying in ZRO is not supported for this ChugSplashFunder version");

        // Revert if the user didn't send enough funds
        require(address(this).balance > total, "value too low");

        // Send all the transactions
        for (uint i = 0; i < actions.length; i++) {
            _lzSend(
                actions[i].dstChainId,
                actions[i].receiverAddress,
                actions[i].payload,
                payable(msg.sender),
                address(0x0),
                adapterParams[i],
                nativeFees[i]
            );
        }
    }

    /**
     * @notice Overrides the _lzSend function from LzApp. Only difference is we do not require
     *         a trusted remote address.
     */
    function _lzSend(
        uint16 _dstChainId,
        address _dstAddress,
        bytes memory _payload,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams,
        uint _nativeFee
    ) internal {
        _checkPayloadSize(_dstChainId, _payload.length);
        lzEndpoint.send{ value: _nativeFee }(
            _dstChainId,
            abi.encodePacked(_dstAddress, address(this)),
            _payload,
            _refundAddress,
            _zroPaymentAddress,
            _adapterParams
        );
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
