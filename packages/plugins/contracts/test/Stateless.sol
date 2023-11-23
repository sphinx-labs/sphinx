// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Version } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";

contract Stateless {
    uint256 public immutable immutableUint;
    address public immutable immutableAddress;
    Version contractVersion;

    constructor(uint256 _immutableUint, address _immutableAddress, Version memory _version) {
        immutableUint = _immutableUint;
        immutableAddress = _immutableAddress;
        contractVersion = _version;
    }

    function fetchStrings(
        string memory _a,
        string memory _b
    ) external pure returns (string memory, string memory) {
        return (_a, _b);
    }

    function fetchStringArray(
        string[] memory _a,
        string[] memory _b
    ) external pure returns (string[] memory, string[] memory) {
        return (_a, _b);
    }

    function version() external view returns (Version memory) {
        return contractVersion;
    }

    function setVersion(Version memory _version) external {
        contractVersion = _version;
    }

    function hello() external pure returns (string memory) {
        return "Hello, world!";
    }
}

contract AnotherStateless {
    Version contractVersion;

    constructor(Version memory _version) {
        contractVersion = _version;
    }

    function version() external view returns (Version memory) {
        return contractVersion;
    }

    function setVersion(Version memory _version) external {
        contractVersion = _version;
    }
}
