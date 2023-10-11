// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract AllNetworks is Ownable {
    address public someOtherProtocolAddress;
    uint public feePercent;

    constructor(address _someOtherProtocolAddress, address _initialOwner) {
        someOtherProtocolAddress = _someOtherProtocolAddress;
        _transferOwnership(_initialOwner);
    }

    function incrementFee() public {
        feePercent++;
    }

    function setFee(uint _fee) public onlyOwner {
        feePercent = _fee;
    }
}

contract OnlyArbitrum {
    uint public number;

    constructor(uint _number) {
        number = _number;
    }

    function increment() public {
        number++;
    }

    function decrement() public {
        number--;
    }

    function setNumber(uint256 _number) public {
        number = _number;
    }
}

contract OnlyOptimism {
    int public number;

    function incrementTwice() public {
        number += 2;
    }

    function decrementTwice() public {
        number -= 2;
    }
}
