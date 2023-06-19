// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IChugSplashDeploy {
    function silence() external;

    // This is the entry point for the ChugSplash deploy command.
    function deploy(string memory _configPath, string memory _rpcUrl) external;

    function getAddress(
        string memory _configPath,
        string memory _referenceName,
        bytes32 userSaltHash
    ) external view returns (address);
}
