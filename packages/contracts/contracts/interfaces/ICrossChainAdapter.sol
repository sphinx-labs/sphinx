// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { RegistrationInfo, CrossChainMessageInfo } from "../ChugSplashDataTypes.sol";

/**
 * @title ICrossChainAdapter
 */
interface ICrossChainAdapter {
    function initiateRegistration(
        bytes32 _orgID,
        RegistrationInfo memory _registration,
        CrossChainMessageInfo memory _message
    ) external;
}
