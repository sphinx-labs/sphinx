// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Proxy } from "./libraries/Proxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { IChugSplashManager } from "./interfaces/IChugSplashManager.sol";
import { IChugSplashRegistry } from "./interfaces/IChugSplashRegistry.sol";

/**
 * @title ChugSplashManagerProxy
 * @notice BEWARE: This contract should be stable while ChugSplash is upgradeable because its
 *         bytecode determines the addresses of contracts deployed by ChugSplash (via `CREATE2`).
 */
contract ChugSplashManagerProxy is Proxy {
    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @param _registry     The ChugSplashRegistry's address.
     * @param _admin        Owner of this contract.
     */
    constructor(address _registry, address _admin, address _implementation) payable Proxy(_admin) {
        registry = ChugSplashRegistry(payable(_registry));
        super.upgradeTo(_implementation);
    }

    modifier isNotExecuting() {
        require(IChugSplashManager(_getImplementation()).isExecuting() == false, "ChugSplashProxy: execution in progress");
        _;
    }

    modifier isApprovedImplementation(address _implementation) {
        require(_getRegistry().versions(_implementation) == true, "ChugSplashProxy: unapproved manager");
        _;
    }

    /**
     * @notice Queries the implementation address.
     *
     * @return Implementation address.
     */
    function _getRegistry() internal view virtual returns (ChugSplashRegistry) {
        return registry;
    }

    /**
     * @inheritdoc Proxy
     */
    function upgradeTo(address _implementation) public override proxyCallIfNotAdmin isNotExecuting isApprovedImplementation(_implementation) {
        super.upgradeTo(_implementation);
    }

    /**
     * @inheritdoc Proxy
     */
    function upgradeToAndCall(
        address _implementation,
        bytes calldata _data
    ) public override payable proxyCallIfNotAdmin isNotExecuting isApprovedImplementation(_implementation) returns (bytes memory) {
        return super.upgradeToAndCall(_implementation, _data);
    }
}
