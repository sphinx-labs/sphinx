// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { IChugSplashRegistry } from "./IChugSplashRegistry.sol";
import {
    DeploymentState,
    RawChugSplashAction,
    ChugSplashTarget,
    Version,
    ContractInfo
} from "../ChugSplashDataTypes.sol";

/**
 * @title ChugSplashManager
 * @notice Interface that must be inherited by the ChugSplashManager contract.
 */
interface IChugSplashManager {
    function numContracts(string memory _projectName) external view returns (uint256);

    /**
     * @notice Initializes this contract. Must only be callable one time, which should occur
       immediately after contract creation. This is necessary because this contract is meant to
       exist as an implementation behind proxies.
     *
     * @return Arbitrary bytes.
     */
    function initialize(address _owner, bytes memory _data) external returns (bytes memory);

    /**
     * @notice Indicates whether or not a deployment is currently being executed.
     *
     * @return Whether or not a deployment is currently being executed.
     */
    function isExecuting() external view returns (bool);

    /**
     * @notice The ChugSplashRegistry.
     *
     * @return Address of the ChugSplashRegistry.
     */
    function registry() external view returns (IChugSplashRegistry);

    function cancelActiveChugSplashDeployment() external;

    function exportProxy(
        string memory _projectName,
        string memory _referenceName,
        address _newOwner
    ) external;

    function approve(
        string memory _projectName,
        bytes32 _actionRoot,
        bytes32 _targetRoot,
        uint256 _numActions,
        uint256 _numTargets,
        uint256 _numImmutableContracts,
        string memory _configUri,
        bool _remoteExecution
    ) external;

    function withdrawOwnerETH(address _to) external;

    function activeDeploymentId() external view returns (bytes32);

    function deployments(bytes32 _deploymentId) external view returns (DeploymentState memory);

    function executeActions(
        RawChugSplashAction[] memory _actions,
        uint256[] memory _actionIndexes,
        bytes32[][] memory _proofs
    ) external;

    function initiateUpgrade(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) external;

    function finalizeUpgrade(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs
    ) external;

    function incrementProtocolDebt(uint256 _initialGasLeft) external;

    function removeContractsFromProject(
        string memory _projectName,
        string[] memory _referenceNames
    ) external;

    function addContractsToProject(
        string memory _projectName,
        ContractInfo[] memory _contractInfoArray
    ) external;
}
