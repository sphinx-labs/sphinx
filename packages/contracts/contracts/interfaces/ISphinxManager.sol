// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { ISphinxRegistry } from "./ISphinxRegistry.sol";
import { DeploymentState, RawSphinxAction, SphinxTarget, Version } from "../SphinxDataTypes.sol";

/**
 * @title SphinxManager
 * @notice Interface that must be inherited by the SphinxManager contract.
 */
interface ISphinxManager {
    /**
     * @notice Initializes this contract. Must only be callable one time, which should occur
       immediately after contract creation. This is necessary because this contract is meant to
       exist as an implementation behind proxies.
     *
     * @return Arbitrary bytes.
     */
    function initialize(
        address _owner,
        string memory _projectName,
        bytes memory _data
    ) external returns (bytes memory);

    /**
     * @notice Indicates whether or not a deployment is currently being executed.
     *
     * @return Whether or not a deployment is currently being executed.
     */
    function isExecuting() external view returns (bool);

    /**
     * @notice The SphinxRegistry.
     *
     * @return Address of the SphinxRegistry.
     */
    function registry() external view returns (ISphinxRegistry);

    function cancelActiveSphinxDeployment() external;

    function exportProxy(
        address payable _proxy,
        bytes32 _contractKindHash,
        address _newOwner
    ) external;

    function approve(
        bytes32 _actionRoot,
        bytes32 _targetRoot,
        uint256 _numInitialActions,
        uint256 _numSetStorageActions,
        uint256 _numTargets,
        string memory _configUri,
        bool _remoteExecution
    ) external;

    function activeDeploymentId() external view returns (bytes32);

    function deployments(bytes32 _deploymentId) external view returns (DeploymentState memory);

    function callNonces(bytes32 _callHash) external view returns (uint256);

    function executeInitialActions(
        RawSphinxAction[] memory _actions,
        bytes32[][] memory _proofs
    ) external;

    function setStorage(RawSphinxAction[] memory _actions, bytes32[][] memory _proofs) external;

    function initiateUpgrade(SphinxTarget[] memory _targets, bytes32[][] memory _proofs) external;

    function finalizeUpgrade(SphinxTarget[] memory _targets, bytes32[][] memory _proofs) external;
}
