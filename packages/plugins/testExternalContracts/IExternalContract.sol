// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IExternalContract {
    function number() external returns (uint256);
    function setNumber(uint _number) external;
}
