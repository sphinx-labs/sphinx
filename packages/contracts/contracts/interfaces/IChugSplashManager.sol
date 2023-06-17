// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

// TODO: manager should import this iface

import { IChugSplashRegistry } from "./IChugSplashRegistry.sol";
import { Version } from "../Semver.sol";
import {
    DeploymentState,
    RawChugSplashAction,
    ChugSplashTarget
} from "../ChugSplashDataTypes.sol";

/**
 * @title ChugSplashManager
 * @notice Interface that must be inherited by the ChugSplashManager contract.
 */
interface IChugSplashManager {
    /**
     * @notice Initializes this contract. Must only be callable one time, which should occur
       immediately after contract creation. This is necessary because this contract is meant to
       exist as an implementation behind proxies. Note that the implementation must be initialized
       with all zero-bytes to prevent anyone from owning it.
     *
     * @param _data Arbitrary initialization data. This ensures that a consistent interface can be
                    used to initialize future versions of the ChugSplashManager.
     *
     * @return Arbitrary bytes.
     */
    function initialize(bytes memory _data) external returns (bytes memory);

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

    /**
     * @notice Organization ID for this contract.
     *
     * @return 32-byte organization ID.
     */
    function organizationID() external view returns (bytes32);

    function cancelActiveChugSplashDeployment() external;

    function exportProxy(
            address payable _proxy,
            bytes32 _contractKindHash,
            address _newOwner
        ) external;

    function isProposer(address _addr) external view returns (bool);

    function propose(
            bytes32 _actionRoot,
            bytes32 _targetRoot,
            uint256 _numActions,
            uint256 _numTargets,
            uint256 _numImmutableContracts,
            string memory _configUri,
            bool _remoteExecution
        ) external;

    function approve(bytes32 _deploymentId) external;

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
}
