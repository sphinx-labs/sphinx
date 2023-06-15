// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ICrossChainAdapter } from "../../interfaces/ICrossChainAdapter.sol";
import { ChugSplashRegistry } from "../../ChugSplashRegistry.sol";
import { RegistrationInfo, CrossChainMessageInfo } from "../../ChugSplashDataTypes.sol";
import { IConnext } from "@connext/interfaces/core/IConnext.sol";

/**
 * @title LocalAdapter
 */
contract LocalAdapter is ICrossChainAdapter {
    ChugSplashRegistry public immutable registry;

    constructor(ChugSplashRegistry _registry) {
        registry = _registry;
    }

    function initiateRegistration(
        bytes32 _orgID,
        RegistrationInfo memory _registration,
        CrossChainMessageInfo memory
    ) external {
        registry.finalizeRegistration(
            _orgID,
            _registration.owner,
            _registration.version,
            _registration.managerInitializerData
        );
    }
}
