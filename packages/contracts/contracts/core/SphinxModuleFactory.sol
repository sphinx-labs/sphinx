// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

// TODO(end): remove unnecessary imports in all contracts to be audited
import { SphinxModule } from "./SphinxModule.sol";
import { ISphinxModuleFactory } from "./interfaces/ISphinxModuleFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

// TODO(end): grammarly and chat gpt on all specs and contract docs.
// TODO(end): format natspec docs in all contracts to audit.

/**
 * @title SphinxModuleFactory
 * @notice Deploys `SphinxModule` contracts at deterministic addresses and enables them within
 *          Gnosis Safe contracts.
 */
contract SphinxModuleFactory is ISphinxModuleFactory {
    /**
     * @dev Address of this `SphinxModuleFactory`.
     */
    address private immutable MODULE_FACTORY = address(this);

    SphinxModule public immutable SPHINX_MODULE_IMPL;

    constructor() {
        SphinxModule module = new SphinxModule{ salt: bytes32(0) }();
        module.initialize(address(1));
        SPHINX_MODULE_IMPL = module;
    }

    /**
     * @notice Deploy a `SphinxModule` using `CREATE2`. Use this function if the Gnosis Safe
     *         has already been deployed on this network. Otherwise, use
     *            `deploySphinxModuleFromSafe`.
     *
     *            This function will revert if a contract already exists at the `CREATE2` address.
     *            It will also revert if it's delegatecalled, since this would change the `CREATE2`
     *            address of the `SphinxModule`, making it difficult for off-chain tooling to
     *            determine its address.
     *
     * @param _safeProxy Address of the Gnosis Safe proxy that the `SphinxModule` will belong to.
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModule`.
     *
     * @return sphinxModule TODO(docs)
     */
    function deploySphinxModule(
        address _safeProxy,
        uint256 _saltNonce
    )
        public
        override
        returns (address sphinxModule)
    {
        require(address(this) == MODULE_FACTORY, "SphinxModuleFactory: delegatecall not allowed");

        bytes32 salt = keccak256(abi.encode(_safeProxy, msg.sender, _saltNonce));
        sphinxModule = Clones.cloneDeterministic(address(SPHINX_MODULE_IMPL), salt);
        SphinxModule(sphinxModule).initialize(_safeProxy);
        emit SphinxModuleDeployed(sphinxModule, _safeProxy);
    }

    /**
     * @notice Deploys a `SphinxModule` using `CREATE2`. Meant to be called by a Gnosis Safe
     *         during its initial deployment. Otherwise, use `deploySphinxModule` instead.
     *         After calling this function, enable the `SphinxModule` in the Gnosis Safe by calling
     *            `enableSphinxModuleFromSafe`.
     *
     *         Unlike `deploySphinxModule`, this function doesn't return the address of the deployed
     *            SphinxModule. This is because this function is meant to be called from a Gnosis
     * Safe,
     *            where the return value is unused.
     *
     *            This function will revert if a contract already exists at the `CREATE2` address.
     *            It will also revert if it's delegatecalled, since this would change the `CREATE2`
     *            address of the `SphinxModule`, making it difficult for off-chain tooling to
     *            determine its address.
     *
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModule`.
     */
    function deploySphinxModuleFromSafe(uint256 _saltNonce) public override {
        deploySphinxModule(msg.sender, _saltNonce);
    }

    /**
     * @notice Enable a `SphinxModule` within a Gnosis Safe. Must be delegatecalled by
     * the Gnosis Safe. This function is meant to be called during the deployment of a Gnosis Safe
     *    after `SphinxModuleFactory.deploySphinxModuleFromSafe`. If the Gnosis Safe has already
     * been
     *    deployed, use the Gnosis Safe's `enableModule` function instead.
     *
     *    We don't emit an event because this function is meant to be delegatecalled by a Gnosis
     * Safe,
     *    which emits an `EnabledModule` event when we call its `enableModule` function.
     *
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModule`.
     */
    function enableSphinxModuleFromSafe(uint256 _saltNonce) public override {
        require(address(this) != MODULE_FACTORY, "SphinxModuleFactory: must be delegatecalled");
        address sphinxModule = computeSphinxModuleAddress(address(this), address(this), _saltNonce);
        GnosisSafe(payable(address(this))).enableModule(sphinxModule);
    }

    /**
     * @notice Computes the address of a `SphinxModule` contract. Assumes that the deployer of the
     * `SphinxModule` is this `SphinxModuleFactory` contract.
     *
     * @param _safeProxy The address of the Gnosis Safe proxy contract that the `SphinxModule`
     *    belongs to.
     * @param _caller    The address of the caller that deployed (or will deploy) the `SphinxModule`
     *    through the `SphinxModuleFactory`.
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the address
     *    of the `SphinxModule`.
     *
     * @return The `CREATE2` address of the `SphinxModule`.
     */
    function computeSphinxModuleAddress(
        address _safeProxy,
        address _caller,
        uint256 _saltNonce
    )
        public
        view
        override
        returns (address)
    {
        bytes32 salt = keccak256(abi.encode(_safeProxy, _caller, _saltNonce));
        return Clones.predictDeterministicAddress(address(SPHINX_MODULE_IMPL), salt, MODULE_FACTORY);
    }
}
