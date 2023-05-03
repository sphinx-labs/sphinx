// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ChugSplashRegistry } from "../ChugSplashRegistry.sol";
import { Version } from "../Semver.sol";

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
    function registry() external view returns (ChugSplashRegistry);

    /**
     * @notice Organization ID for this contract.
     *
     * @return 32-byte organization ID.
     */
    function organizationID() external view returns (bytes32);
}
