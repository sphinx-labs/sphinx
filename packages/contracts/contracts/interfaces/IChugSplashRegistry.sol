// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { Version } from "../ChugSplashDataTypes.sol";

interface IChugSplashRegistry {
    function managers(bytes32) external view returns (address payable);

    function register(
        address _owner,
        bytes memory _data,
        uint256 _saltNonce
    ) external returns (address);

    function isDeployed(address) external view returns (bool);

    function addContractKind(bytes32 _contractKindHash, address _adapter) external;

    function addVersion(address _manager) external;

    function announce(string memory _event) external;

    function announceWithData(string memory _event, bytes memory _data) external;

    function adapters(bytes32) external view returns (address);
}
