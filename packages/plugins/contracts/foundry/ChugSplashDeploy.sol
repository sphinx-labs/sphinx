// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IChugSplashDeploy } from "./interfaces/IChugSplashDeploy.sol";
import { CommonBase } from "forge-std/Base.sol";

contract ChugSplashDeploy is IChugSplashDeploy, CommonBase {

    address private immutable chugsplash;

    /**
     * @notice This constructor must not revert, or else an opaque error message will be displayed
       to the user.
     */
    constructor() {
        bytes memory creationCode = vm.getCode('./out/artifacts/ChugSplash.sol/ChugSplash.json');
        address chugsplashAddr;
        assembly {
            chugsplashAddr := create(0, add(creationCode, 0x20), mload(creationCode))
        }
        chugsplash = chugsplashAddr;
    }

    function silence() public {
        (bool success, ) = chugsplash.delegatecall(abi.encodeCall(IChugSplashDeploy.silence, ()));
        require(success, "TODO: this is a bug");
    }

    // This is the entry point for the ChugSplash deploy command.
    function deploy(string memory _configPath, string memory _rpcUrl) public {
        (bool success, ) = chugsplash.delegatecall(abi.encodeCall(IChugSplashDeploy.deploy, (_configPath, _rpcUrl)));
        require(success, "TODO: this is a bug");
    }

    function getAddress(
        string memory _configPath,
        string memory _referenceName
    ) public view returns (address) {
        return getAddress(_configPath, _referenceName, bytes32(0));
    }

    function getAddress(
        string memory _configPath,
        string memory _referenceName,
        bytes32 userSaltHash
    ) public view returns (address) {
        return IChugSplashDeploy(chugsplash).getAddress(_configPath, _referenceName, userSaltHash);
    }
}
