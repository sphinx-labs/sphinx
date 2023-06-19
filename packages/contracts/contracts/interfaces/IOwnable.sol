// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

interface IOwnable {
    function owner() external view returns (address);

    function renounceOwnership() external;

    function transferOwnership(address newOwner) external;
}
