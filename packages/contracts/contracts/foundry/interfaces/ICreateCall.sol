// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;

interface ICreateCall {
    function performCreate(
        uint256 value,
        bytes memory deploymentData
    ) external returns (address newContract);
}
