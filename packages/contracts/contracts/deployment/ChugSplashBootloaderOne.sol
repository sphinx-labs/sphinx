// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { DefaultUpdater } from "../updaters/DefaultUpdater.sol";
import { OZUUPSOwnableAdapter } from "../adapters/OZUUPSOwnableAdapter.sol";
import { OZUUPSUpdater } from "../updaters/OZUUPSUpdater.sol";
import { OZUUPSAccessControlAdapter } from "../adapters/OZUUPSAccessControlAdapter.sol";
import { DefaultAdapter } from "../adapters/DefaultAdapter.sol";
import { OZTransparentAdapter } from "../adapters/OZTransparentAdapter.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { DeterministicDeployer } from "./DeterministicDeployer.sol";

contract ChugSplashBootloaderOne {
    address public defaultUpdaterAddr;
    address public ozUUPSUpdaterAddr;
    address public ozTransparentAdapterAddr;
    address public ozUUPSOwnableAdapterAddr;
    address public ozUUPSAccessControlAdapterAddr;
    address public defaultAdapterAddr;

    constructor() {
        // Deploy Default Updater
        defaultUpdaterAddr = DeterministicDeployer.deploy(
            type(DefaultUpdater).creationCode,
            type(DefaultUpdater).name
        );

        // Deploy OZUUPSUpdater
        ozUUPSUpdaterAddr = DeterministicDeployer.deploy(
            type(OZUUPSUpdater).creationCode,
            type(OZUUPSUpdater).name
        );

        // Deploy Transparent Adapter
        ozTransparentAdapterAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(OZTransparentAdapter).creationCode,
                abi.encode(defaultUpdaterAddr)
            ),
            type(OZTransparentAdapter).name
        );

        // Deploy OZUUPSOwnableAdapter
        ozUUPSOwnableAdapterAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(OZUUPSOwnableAdapter).creationCode,
                abi.encode(ozUUPSUpdaterAddr)
            ),
            type(OZUUPSOwnableAdapter).name
        );

        // Deploy OZUUPSAccessControlAdapter
        ozUUPSAccessControlAdapterAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(OZUUPSAccessControlAdapter).creationCode,
                abi.encode(ozUUPSUpdaterAddr)
            ),
            type(OZUUPSAccessControlAdapter).name
        );

        // Deploy DefaultAdapter
        defaultAdapterAddr = DeterministicDeployer.deploy(
            abi.encodePacked(type(DefaultAdapter).creationCode, abi.encode(defaultUpdaterAddr)),
            type(DefaultAdapter).name
        );
    }
}
