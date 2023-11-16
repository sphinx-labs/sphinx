// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// TODO(managed): validate: managedService.constructor: _owner != address(0)

// TODO(off-chain):
// - If the user is importing an existing Gnosis Safe into our system, we should check that it's
//   either v1.3.0 or v1.4.1. We can check this by calling `safeProxy.VERSION()`
// - The `gas` field in the `EXECUTE` Merkle leafs should estimate the gas used in the
//   `safeProxy.execTransactionFromModuleReturnData` call, which is more expensive than just the
//   user's transaction.
// - We should probably validate that the `gas` for a leaf isn't extremely high (e.g. above the
//   block gas limit).

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
