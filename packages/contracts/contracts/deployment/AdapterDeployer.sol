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

contract AdapterDeployer {
    address public DefaultUpdaterAddr;
    address public OZUUPSUpdaterAddr;
    address public OZTransparentAdapterAddr;
    address public OZUUPSOwnableAdapterAddr;
    address public OZUUPSAccessControlAdapterAddr;
    address public DefaultAdapterAddr;

    constructor () {
        // Deploy Default Updater
        DefaultUpdaterAddr = DeterministicDeployer.deploy(
            type(DefaultUpdater).creationCode,
            "DefaultUpdater"
        );

        // Deploy OZUUPSUpdater
        OZUUPSUpdaterAddr = DeterministicDeployer.deploy(
            type(OZUUPSUpdater).creationCode,
            "OZUUPSUpdater"
        );

        // Deploy Transparent Adapter
        OZTransparentAdapterAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(OZTransparentAdapter).creationCode,
                abi.encode(DefaultUpdaterAddr)
            ),
            "OZTransparentAdapter"
        );

        // Deploy OZUUPSOwnableAdapter
        OZUUPSOwnableAdapterAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(OZUUPSOwnableAdapter).creationCode,
                abi.encode(OZUUPSUpdaterAddr)
            ),
            "OZUUPSOwnableAdapter"
        );

        // Deploy OZUUPSAccessControlAdapter
        OZUUPSAccessControlAdapterAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(OZUUPSAccessControlAdapter).creationCode,
                abi.encode(OZUUPSUpdaterAddr)
            ),
            "OZUUPSAccessControlAdapter"
        );

        // Deploy DefaultAdapter
        DefaultAdapterAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(DefaultAdapter).creationCode,
                abi.encode(DefaultUpdaterAddr)
            ),
            "DefaultAdapter"
        );
    }
}
