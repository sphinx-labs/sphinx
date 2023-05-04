// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract MockChugSplashManager {
    function computeDeploymentId(bytes32, uint256, string memory) public pure returns (bytes32) {
        return bytes32(uint256(1));
    }
}
