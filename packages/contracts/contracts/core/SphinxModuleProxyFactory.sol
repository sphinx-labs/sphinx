// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { SphinxModule } from "./SphinxModule.sol";
import { ISphinxModuleProxyFactory } from "./interfaces/ISphinxModuleProxyFactory.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
// We import `GnosisSafe` v1.3.0 here, but this contract also supports `GnosisSafeL2.sol` (v1.3.0)
// as well as `Safe.sol` and `SafeL2.sol` from Safe v1.4.1. All of these contracts share the same
// interface for the function used in this contract (`enableModule`).
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";

/**
 * @title SphinxModuleProxyFactory
 * @notice The `SphinxModuleProxyFactory` deploys minimal, non-upgradeable EIP-1167 proxy contracts
 *         at deterministic addresses, which delegate calls to a single `SphinxModule`
 *         implementation contract. The `SphinxModuleProxyFactory` can also enable `SphinxModule`
 *         proxies within Gnosis Safe contracts.
 *
 *         This contract uses the EIP-1167 standard to reduce the cost of deploying `SphinxModule`
 *         contracts. Instead of deploying a new `SphinxModule` implementation contract for every
 *         Gnosis Safe, it deploys a minimal, non-upgradeable EIP-1167 proxy that delegates all
 *         calls to a single `SphinxModule` implementation contract. The `SphinxModuleProxyFactory`
 *         deploys the `SphinxModule` implementation inside its constructor.
 */
contract SphinxModuleProxyFactory is ISphinxModuleProxyFactory {
    /**
     * @inheritdoc ISphinxModuleProxyFactory
     */
    address public immutable override SPHINX_MODULE_IMPL;

    /**
     * @dev Address of this `SphinxModuleProxyFactory`.
     */
    address private immutable MODULE_FACTORY = address(this);

    /**
     * @notice Deploys the `SphinxModule` contract and initializes it so that nobody
     *         can deploy directly through it.
     */
    constructor() {
        SphinxModule module = new SphinxModule{ salt: bytes32(0) }();
        // We initialize the implementation using `address(1)` because its initializer checks that
        // the Gnosis Safe address isn't `address(0)`.
        module.initialize(address(1));
        SPHINX_MODULE_IMPL = address(module);
    }

    /**
     * @inheritdoc ISphinxModuleProxyFactory
     */
    function deploySphinxModuleProxy(
        address _safeProxy,
        uint256 _saltNonce
    ) public override returns (address sphinxModuleProxy) {
        require(_safeProxy != address(0), "SphinxModuleProxyFactory: invalid Safe");
        bytes32 salt = keccak256(abi.encode(_safeProxy, msg.sender, _saltNonce));
        sphinxModuleProxy = Clones.cloneDeterministic(address(SPHINX_MODULE_IMPL), salt);
        emit SphinxModuleProxyDeployed(sphinxModuleProxy, _safeProxy);
        SphinxModule(sphinxModuleProxy).initialize(_safeProxy);
    }

    /**
     * @inheritdoc ISphinxModuleProxyFactory
     */
    function deploySphinxModuleProxyFromSafe(uint256 _saltNonce) public override {
        deploySphinxModuleProxy(msg.sender, _saltNonce);
    }

    /**
     * @inheritdoc ISphinxModuleProxyFactory
     */
    function enableSphinxModuleProxyFromSafe(uint256 _saltNonce) public override {
        require(
            address(this) != MODULE_FACTORY,
            "SphinxModuleProxyFactory: must be delegatecalled"
        );
        address sphinxModuleProxy = computeSphinxModuleProxyAddress(
            address(this),
            address(this),
            _saltNonce
        );
        GnosisSafe(payable(address(this))).enableModule(sphinxModuleProxy);
    }

    /**
     * @inheritdoc ISphinxModuleProxyFactory
     */
    function computeSphinxModuleProxyAddress(
        address _safeProxy,
        address _caller,
        uint256 _saltNonce
    ) public view override returns (address) {
        bytes32 salt = keccak256(abi.encode(_safeProxy, _caller, _saltNonce));
        return
            Clones.predictDeterministicAddress(address(SPHINX_MODULE_IMPL), salt, MODULE_FACTORY);
    }
}
