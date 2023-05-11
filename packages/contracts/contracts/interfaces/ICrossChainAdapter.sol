// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { CrossChainMessageInfo } from "../ChugSplashDataTypes.sol";

/**
 * @title ICrossChainAdapter
 */
interface ICrossChainAdapter {
    function initiateCall(CrossChainMessageInfo memory _message, bytes calldata _data) external;
}
