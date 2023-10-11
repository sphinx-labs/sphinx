// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract AllNetworks {
    address public someOtherProtocolAddress;
    uint public feePercent;

    constructor(address _someOtherProtocolAddress) {
        someOtherProtocolAddress = _someOtherProtocolAddress;
    }

    function setFee(uint _fee) public {
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
