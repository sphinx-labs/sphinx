// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

// TODO

import { Test } from "forge-std/Test.sol";
import { ChugSplashLZSender } from "contracts/ChugSplashLZSender.sol";
import { LayerZeroFundingMessage } from "contracts/ChugSplashDataTypes.sol";
import { ChugSplashLZReceiver } from "contracts/ChugSplashLZReceiver.sol";
import {
    LZEndpointMock
} from "@layerzerolabs/solidity-examples/contracts/mocks/LZEndpointMock.sol";

contract FunderTest is Test {
    ChugSplashLZSender public funder;
    ChugSplashLZReceiver public receiver;
    LZEndpointMock public endpoint;
    address public airdropAddressOne = address(0x1111111111111111111111111111111111111111);
    address public airdropAddressTwo = address(0x1111111111111111111111111111111111111112);
    uint public airdropAmountOne = 0.24 ether;
    uint public airdropAmountTwo = 0.08 ether;

    function setUp() public {
        uint16 chainId = uint16(block.chainid);

        endpoint = new LZEndpointMock(chainId);
        receiver = new ChugSplashLZReceiver(address(endpoint), msg.sender);

        ChugSplashLZSender.DestinationChainInfo[]
            memory destinationChains = new ChugSplashLZSender.DestinationChainInfo[](1);
        destinationChains[0] = ChugSplashLZSender.DestinationChainInfo(chainId, address(receiver));

        funder = new ChugSplashLZSender(address(endpoint), destinationChains, msg.sender);

        endpoint.setDestLzEndpoint(address(funder), address(endpoint));
        endpoint.setDestLzEndpoint(address(receiver), address(endpoint));

        uint16 outboundProofType = 1;
        LayerZeroFundingMessage[] memory actions = new LayerZeroFundingMessage[](3);
        actions[0] = LayerZeroFundingMessage(
            chainId,
            outboundProofType,
            200000,
            airdropAddressOne,
            airdropAmountOne
        );
        actions[1] = LayerZeroFundingMessage(
            chainId,
            outboundProofType,
            200000,
            airdropAddressOne,
            airdropAmountOne
        );
        actions[2] = LayerZeroFundingMessage(
            chainId,
            outboundProofType,
            200000,
            airdropAddressTwo,
            airdropAmountTwo
        );

        funder.sendBatchFunds{ value: 1 ether }(actions);
    }

    function testDidReceiveFunds() public {
        assertEq(
            address(airdropAddressOne).balance,
            airdropAmountOne * 2,
            "airdrop target one did not receive correct airdrop amount"
        );
        assertEq(
            address(airdropAddressTwo).balance,
            airdropAmountTwo,
            "airdrop target two did not receive correct airdrop amount"
        );
    }
}
