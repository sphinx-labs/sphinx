// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

contract BalanceChecker {
    function ensureMinBalance(address _target, uint256 _minBalance) public view {
        require(_target.balance >= _minBalance, "BalanceChecker: insufficient funds");
    }
}
