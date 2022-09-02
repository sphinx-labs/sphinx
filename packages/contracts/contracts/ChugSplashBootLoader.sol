// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { ChugSplashManager } from "./ChugSplashManager.sol";
import { ChugSplashManagerProxy } from "./ChugSplashManagerProxy.sol";
import { ProxyUpdater } from "./ProxyUpdater.sol";
import { Create2 } from "./libraries/Create2.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";

/**
 * @title ChugSplashBootLoader
 */
contract ChugSplashBootLoader {
    /**
     * @notice Address of the ProxyUpdater.
     */
    ProxyUpdater public proxyUpdater;

    /**
     * @notice Address of the ChugSplashRegistry implementation contract.
     */
    ChugSplashRegistry public registryImplementation;

    /**
     * @notice Address of the ChugSplashRegistry's proxy.
     */
    Proxy public registryProxy;

    /**
     * @notice Address of the ChugSplashManager implementation contract. All ChugSplashManagerProxy
     *         contracts, including the root contract, will have this address as their
     *         implementation.
     */
    ChugSplashManager public managerImplementation;

    /**
     * @notice Address of the root ChugSplashManagerProxy.
     */
    ChugSplashManagerProxy public rootManagerProxy;

    /**
     * @notice Boots an upgradeable version of ChugSplash with a root ChugSplashManager that owns
     *         the ChugSplashRegistry. Once these contracts are deployed, we can upgrade ChugSplash
     *         using ChugSplash!
     *
     * @param _owner              Address of the owner of the ChugSplash contracts.
     * @param _executorBondAmount Executor bond amount in ETH.
     * @param _executionLockTime  Amount of time for an executor to completely execute a bundle
     *                            after claiming it.
     * @param _ownerBondAmount    Amount that must be deposited in this contract in order to execute
     *                            a bundle.
     */
    constructor(
        address _owner,
        uint256 _executorBondAmount,
        uint256 _executionLockTime,
        uint256 _ownerBondAmount
    ) {
        // Deploy the ProxyUpdater.
        proxyUpdater = new ProxyUpdater{ salt: bytes32(0) }();

        // Get the address of the ChugSplashRegistry's proxy that *will* be deployed.
        address registryProxyAddress = Create2.compute(
            address(this),
            bytes32(0),
            abi.encodePacked(type(Proxy).creationCode, abi.encode(address(this)))
        );

        // Deploy and initialize the ChugSplashManager implementation contract.
        managerImplementation = new ChugSplashManager{ salt: bytes32(0) }(
            ChugSplashRegistry(registryProxyAddress),
            "Root Manager",
            _owner,
            address(proxyUpdater),
            _executorBondAmount,
            _executionLockTime,
            _ownerBondAmount
        );

        // Deploy and initialize the root ChugSplashManager's proxy.
        rootManagerProxy = new ChugSplashManagerProxy{ salt: bytes32(0) }(
            ChugSplashRegistry(registryProxyAddress),
            address(managerImplementation),
            _owner,
            abi.encodeCall(
                ChugSplashManager.initialize,
                ("Root Manager", _owner, _executorBondAmount)
            )
        );

        // Deploy and initialize the ChugSplashRegistry's implementation contract.
        registryImplementation = new ChugSplashRegistry{ salt: bytes32(0) }(
            address(proxyUpdater),
            _ownerBondAmount,
            address(managerImplementation)
        );

        // Deploy the ChugSplashRegistry's proxy.
        registryProxy = new Proxy{ salt: bytes32(0) }(
            // The owner must initially be this contract so that we can set the proxy's
            // implementation contract.
            address(this)
        );

        // Set the proxy's implementation contract.
        registryProxy.upgradeTo(address(registryImplementation));

        // Transfer ownership of the ChugSplashRegistry's proxy to the root ChugSplashManagerProxy.
        registryProxy.changeAdmin(address(rootManagerProxy));
    }
}
