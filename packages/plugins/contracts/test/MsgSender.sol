// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MsgSender {
    address public msgSenderInConstructor;
    address public msgSenderInFunction;

    constructor() {
        msgSenderInConstructor = msg.sender;
    }

    function setSender() public {
        msgSenderInFunction = msg.sender;
    }
}
