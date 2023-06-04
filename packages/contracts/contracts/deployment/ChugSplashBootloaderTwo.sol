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
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { DeterministicDeployer } from "./DeterministicDeployer.sol";

contract ChugSplashBootloaderTwo is Ownable {
    ChugSplashRegistry public registry;
    address public managerImplementationAddress;
    address public defaultCreate3Addr;
    address public defaultGasPriceCalculatorAddr;
    address public managedServiceAddr;
    address public forwarderAddr;
    address public systemOwner;
    bool setupComplete;

    constructor(
        address _owner,
        address _bootloaderOwner,
        uint256 _executionLockTime,
        uint256 _ownerBondAmount,
        uint256 _executorPaymentPercentage,
        uint256 _protocolPaymentPercentage,
        Version memory _version
    ) {
        _transferOwnership(_bootloaderOwner);

        // Deploy DefaultCreate3
        defaultCreate3Addr = DeterministicDeployer.deploy(
            type(DefaultCreate3).creationCode,
            type(DefaultCreate3).name
        );

        // Deploy DefaultGasPriceCalculator
        defaultGasPriceCalculatorAddr = DeterministicDeployer.deploy(
            type(DefaultGasPriceCalculator).creationCode,
            type(DefaultGasPriceCalculator).name
        );

        // Deploy ManagedService
        managedServiceAddr = DeterministicDeployer.deploy(
            abi.encodePacked(type(ManagedService).creationCode, abi.encode(_owner)),
            type(ManagedService).name
        );

        // Deploy Registry
        registry = ChugSplashRegistry(
            DeterministicDeployer.deploy(
                abi.encodePacked(type(ChugSplashRegistry).creationCode, abi.encode(_owner)),
                type(ChugSplashRegistry).name
            )
        );

        // Deploy Forwarder
        forwarderAddr = DeterministicDeployer.deploy(type(Forwarder).creationCode, "Forwarder");

        // Deploy Manager Implementation
        managerImplementationAddress = DeterministicDeployer.deploy(
            abi.encodePacked(
                type(ChugSplashManager).creationCode,
                abi.encode(
                    address(registry),
                    defaultCreate3Addr,
                    defaultGasPriceCalculatorAddr,
                    managedServiceAddr,
                    _executionLockTime,
                    _ownerBondAmount,
                    _executorPaymentPercentage,
                    _protocolPaymentPercentage,
                    _version,
                    forwarderAddr
                )
            ),
            type(ChugSplashManager).name
        );
    }

    function completeSetup(
        address ozTransparentAdapter,
        address ozUUPSOwnableAdapter,
        address ozUUPSAccessControlAdapter,
        address defaultAdapter
    ) public onlyOwner {
        require(setupComplete == false, "Setup already complete");
        setupComplete = true;

        // Add initial manager version
        registry.addVersion(managerImplementationAddress);

        // Add transparent proxy type
        registry.addContractKind(
            keccak256("oz-transparent"),
            ozTransparentAdapter
        );

        // Add uups ownable proxy type
        registry.addContractKind(
            keccak256("oz-ownable-uups"),
            ozUUPSOwnableAdapter
        );

        // Add uups access control proxy type
        registry.addContractKind(
            keccak256("oz-access-control-uups"),
            ozUUPSAccessControlAdapter
        );

        // Add default proxy type
        registry.addContractKind(bytes32(0), defaultAdapter);

        registry.completeSetup();
    }
}
