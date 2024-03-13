// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyContract {
    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";

    uint256 public myNum;
    bool public reentrancyBlocked;

    function setMyNum(uint256 _num) external {
        myNum = _num;
    }

    function get42() external pure returns (uint256) {
        return 42;
    }

    function reenter(address _to, bytes memory _data) external {
        (bool success, bytes memory retdata) = _to.call(_data);
        require(!success, "MyContract: reentrancy succeeded");
        require(
            keccak256(retdata) ==
                keccak256(
                    abi.encodePacked(ERROR_SELECTOR, abi.encode("ReentrancyGuard: reentrant call"))
                ),
            "MyContract: incorrect error"
        );
        reentrancyBlocked = true;
    }

    function reverter() external pure {
        revert("MyContract: reverted");
    }

    function acceptPayment() external payable {}
}

contract MyDelegateCallContract {
    address private immutable CONTRACT_ADDRESS = address(this);

    bool public wasDelegateCalled;

    function onlyDelegateCall() external {
        require(address(this) != CONTRACT_ADDRESS, "MyContract: only delegatecall allowed");
        MyDelegateCallContract(payable(CONTRACT_ADDRESS)).delegateCallOccurred();
    }

    function delegateCallOccurred() external {
        wasDelegateCalled = true;
    }
}

contract GnosisSafeSingletonInvalidVersion {
    string public VERSION = "1.2.0";
}

contract MySimpleContract {
    function myFunction() public pure returns (uint256) {
        return 42;
    }
}
