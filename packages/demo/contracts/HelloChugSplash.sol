// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library MyLibrary {
    function first() internal pure returns (uint8) {
        return 2;
    }
}

contract HelloChugSplash {
    uint8 public number123;
    bool public stored;
    address public otherStorage;
    string public storageName;

    function callLib() external {
        number123 = MyLibrary.first();
    }
}

contract HelloChugSplash2 {
    /// @custom:oz-renamed-from number123
    uint8 public number1234;
    bool public stored;
    address public otherStorage;
    string public storageName;

    function callLib() external {
        number1234 = MyLibrary.first();
        selfdestruct(payable(msg.sender));
    }
}
