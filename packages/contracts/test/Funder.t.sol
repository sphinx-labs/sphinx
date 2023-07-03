// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

// TODO

import { Test } from "forge-std/Test.sol";
import { ChugSplashLZSender } from "contracts/ChugSplashLZSender.sol";
import { FunderAction } from "contracts/ChugSplashDataTypes.sol";
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
        funder = new ChugSplashLZSender(address(endpoint));
        receiver = new ChugSplashLZReceiver(address(endpoint));

        endpoint.setDestLzEndpoint(address(funder), address(endpoint));
        endpoint.setDestLzEndpoint(address(receiver), address(endpoint));

        uint16 outboundProofType = 1;
        bool payInZRO = false;
        bytes memory payload = "";
        FunderAction[] memory actions = new FunderAction[](3);
        actions[0] = FunderAction(
            chainId,
            outboundProofType,
            address(receiver),
            airdropAddressOne,
            airdropAmountOne,
            payInZRO,
            payload
        );
        actions[1] = FunderAction(
            chainId,
            outboundProofType,
            address(receiver),
            airdropAddressOne,
            airdropAmountOne,
            payInZRO,
            payload
        );
        actions[2] = FunderAction(
            chainId,
            outboundProofType,
            address(receiver),
            airdropAddressTwo,
            airdropAmountTwo,
            payInZRO,
            payload
        );

        funder.sendBatchFundActions{ value: 1 ether }(actions);
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
