// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { Version } from "../ChugSplashDataTypes.sol";

interface IChugSplashRegistry {
    function managers(bytes32) external view returns (address payable);

    function register(
        address _owner,
        uint256 _saltNonce,
        bytes memory _data
    ) external returns (address);

    function isDeployed(address) external view returns (bool);

    function addContractKind(bytes32 _contractKindHash, address _adapter) external;

    function addVersion(address _manager) external;

    function announce(string memory _event) external;

    function announceWithData(string memory _event, bytes memory _data) external;

    function adapters(bytes32) external view returns (address);

    function setCurrentManagerImplementation(address _manager) external;
}
