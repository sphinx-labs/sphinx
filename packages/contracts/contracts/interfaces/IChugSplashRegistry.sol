// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Version } from "../ChugSplashDataTypes.sol";

interface IChugSplashRegistry {
    function projects(bytes32) external view returns (address payable);

    function finalizeRegistration(
        bytes32 _organizationID,
        address _owner,
        Version memory _version,
        bytes memory _data
    ) external;

    function managerProxies(address) external view returns (bool);

    function addContractKind(bytes32 _contractKindHash, address _adapter) external;

    function addVersion(address _manager) external;

    function announce(string memory _event) external;

    function announceWithData(string memory _event, bytes memory _data) external;

    function adapters(bytes32) external view returns (address);
}
