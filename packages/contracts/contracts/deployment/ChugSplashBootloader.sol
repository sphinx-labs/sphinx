// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { DefaultCreate3 } from "../DefaultCreate3.sol";
import { DefaultGasPriceCalculator } from "../DefaultGasPriceCalculator.sol";
import { ManagedService } from "../ManagedService.sol";
import { ChugSplashRegistry } from "../ChugSplashRegistry.sol";
import { Forwarder } from "@thirdweb-dev/contracts/forwarder/Forwarder.sol";
import { ChugSplashManager } from "../ChugSplashManager.sol";
import { DefaultUpdater } from "../updaters/DefaultUpdater.sol";
import { OZUUPSOwnableAdapter } from "../adapters/OZUUPSOwnableAdapter.sol";
import { OZUUPSUpdater } from "../updaters/OZUUPSUpdater.sol";
import { OZUUPSAccessControlAdapter } from "../adapters/OZUUPSAccessControlAdapter.sol";
import { DefaultAdapter } from "../adapters/DefaultAdapter.sol";
import { OZTransparentAdapter } from "../adapters/OZTransparentAdapter.sol";
import { Version } from "../Semver.sol";
import { AdapterDeployer } from "./AdapterDeployer.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { DeterministicDeployer } from "./DeterministicDeployer.sol";

contract ChugSplashBootloader is Ownable {
    ChugSplashRegistry registry;
    address ChugSplashManagerAddr;
    AdapterDeployer adapterDeployer;

    constructor (
        address _owner,
        address _adapterDeployer
    ) {
        require(msg.sender == _owner, "ChugSplashBootloader: owner mismatch");

        _transferOwnership(_owner);

        adapterDeployer = AdapterDeployer(_adapterDeployer);

        // Deploy DefaultCreate3
        address DefaultCreate3Addr = DeterministicDeployer.deploy(
            type(DefaultCreate3).creationCode,
            "DefaultCreate3"
        );

        // Deploy DefaultGasPriceCalculator
        address DefaultGasPriceCalculatorAddr = DeterministicDeployer.deploy(
            type(DefaultGasPriceCalculator).creationCode,
            "DefaultGasPriceCalculator"
        );

        // Deploy ManagedService
        address ManagedServiceAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(ManagedService).creationCode,
                abi.encode(_owner)
            ),
            "DefaultGasPriceCalculator"
        );

        // Deploy Registry
        registry = ChugSplashRegistry(
            DeterministicDeployer.deploy(
                abi.encodePacked(
                    type(ChugSplashRegistry).creationCode,
                    abi.encode(this)
                ),
                "ChugSplashRegistry"
            )
        );

        // Deploy Forwarder
        address ForwarderAddr = DeterministicDeployer.deploy(
            type(Forwarder).creationCode,
            "Forwarder"
        );

        // Deploy Manager Implementation
        ChugSplashManagerAddr = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(ChugSplashManager).creationCode,
                abi.encode(
                    address(registry),
                    DefaultCreate3Addr,
                    DefaultGasPriceCalculatorAddr,
                    ManagedServiceAddr,
                    15 * 60,
                    0.001 ether,
                    20,
                    20,
                    Version(1, 0, 0),
                    ForwarderAddr
                )
            ),
            "ChugSplashManager"
        );

        // Add initial manager version
        registry.addVersion(
            ChugSplashManagerAddr
        );

        // Add transparent proxy type
        registry.addContractKind(keccak256('oz-transparent'), adapterDeployer.OZTransparentAdapterAddr());

        // Add uups ownable proxy type
        registry.addContractKind(keccak256('oz-ownable-uups'), adapterDeployer.OZUUPSOwnableAdapterAddr());

        // Add uups access control proxy type
        registry.addContractKind(keccak256('oz-access-control-uups'), adapterDeployer.OZUUPSAccessControlAdapterAddr());

        // Add default proxy type
        registry.addContractKind(bytes32(0), adapterDeployer.DefaultAdapterAddr());

        // Transfer registry ownership to final owner
        registry.transferOwnership(owner());
    }
}
