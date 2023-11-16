// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

// TODO(end): remove unnecessary imports in all contracts to be audited
import { SphinxModule } from "./SphinxModule.sol";
import { ISphinxModuleProxyFactory } from "./interfaces/ISphinxModuleProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

// TODO(end): grammarly and chat gpt on all specs and contract docs.
// TODO(end): format natspec docs in all contracts to audit.

// TODO(end): update ISphinxModuleProxyFactory

/**
 * @title SphinxModuleProxyFactory
 * @notice The `SphinxModuleProxyFactory` deploys minimal, non-upgradeable EIP-1167 proxy contracts
   at deterministic addresses, which delegate calls to a single `SphinxModule` implementation
   contract. The `SphinxModuleProxyFactory` can also enable `SphinxModule` proxies within Gnosis
   Safe contracts.

    Vocabulary:
    - A `SphinxModuleProxy` is an EIP-1167 proxy that delegates calls to a `SphinxModule`
      implementation contract. There is no source file for the `SphinxModuleProxy` because we use
      OpenZeppelin's `Clones.sol` for deploying EIP-1167 proxies and calculating their addresses.
    - A `SphinxModule` is the `SphinxModule` implementation contract.

          This contract uses the EIP-1167 standard to reduce the cost of deploying `SphinxModule` contracts. Instead of
          deploying a new `SphinxModule` implementation contract for every Gnosis Safe, it deploys a minimal, non-upgradeable
          EIP-1167 proxy that delegates all calls to a single `SphinxModule` implementation
          contract. The `SphinxModuleProxyFactory` deploys the `SphinxModule` implementation inside its
          constructor.

 */
contract SphinxModuleProxyFactory is ISphinxModuleProxyFactory {
    /**
     * @notice The address of the `SphinxModule`.
     */
    address public immutable override SPHINX_MODULE_IMPL;

    /**
     * @dev Address of this `SphinxModuleProxyFactory`.
     */
    address private immutable MODULE_FACTORY = address(this);

    /**
     * @notice Deploys the `SphinxModule` contract and initializes it so that nobody
       can deploy directly through it.
     */
    constructor() {
        SphinxModule module = new SphinxModule{ salt: bytes32(0) }();
        // We initialize the implementation using `address(1)` because its initializer checks that
        // the Gnosis Safe address isn't `address(0)`.
        module.initialize(address(1));
        SPHINX_MODULE_IMPL = address(module);
    }

    /**
     * @notice Uses `CREATE2` to deploy a `SphinxModuleProxy`. Use this function if the Gnosis Safe
     *         has already been deployed on this network. Otherwise, use
     *         `deploySphinxModuleProxyFromSafe`.
     *
     *            This function will revert if a contract already exists at the `CREATE2` address.
     *          It will also revert if the `_safeProxy` is the zero-address.
     *
     * @param _safeProxy Address of the Gnosis Safe proxy that the `SphinxModuleProxy` will belong to.
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModuleProxy`.
     *
     * @return sphinxModuleProxy The `CREATE2` address of the deployed `SphinxModuleProxy`.
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
     * @notice Uses `CREATE2` to deploy a `SphinxModuleProxy`. Meant to be called by a Gnosis Safe
     *         during its initial deployment. Otherwise, use `deploySphinxModuleProxy` instead.
     *         After calling this function, enable the `SphinxModuleProxy` in the Gnosis Safe by calling
     *            `enableSphinxModuleProxyFromSafe`.
     *
     *         Unlike `deploySphinxModuleProxy`, this function doesn't return the address of the deployed
     *            `SphinxModuleProxy`. This is because this function is meant to be called from a Gnosis
     * Safe,
     *            where the return value is unused.
     *
     *            This function will revert if a contract already exists at the `CREATE2` address.
     *
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModuleProxy`.
     */
    function deploySphinxModuleProxyFromSafe(uint256 _saltNonce) public override {
        deploySphinxModuleProxy(msg.sender, _saltNonce);
    }

    /**
     * @notice Enable a `SphinxModuleProxy` within a Gnosis Safe. Must be delegatecalled by
     * the Gnosis Safe. This function is meant to be triggered during the deployment of a Gnosis Safe
     *    after `SphinxModuleProxyFactory.deploySphinxModuleProxyFromSafe`. If the Gnosis Safe has already
     * been
     *    deployed, use the Gnosis Safe's `enableModule` function instead.
     *
     *    We don't emit an event because this function is meant to be delegatecalled by a Gnosis
     * Safe,
     *    which emits an `EnabledModule` event when we call its `enableModule` function.
     *
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModuleProxy`.
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
     * @notice Computes the address of a `SphinxModuleProxy`. Assumes that the deployer of the
     * `SphinxModuleProxy` and the `SphinxModule` is this `SphinxModuleProxyFactory` contract.
     *
     * @param _safeProxy The address of the Gnosis Safe proxy contract that the `SphinxModuleProxy`
     *    belongs to.
     * @param _caller    The address of the caller that deployed (or will deploy) the `SphinxModuleProxy`
     *    through the `SphinxModuleProxyFactory`.
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the address
     *    of the `SphinxModuleProxy`.
     *
     * @return The `CREATE2` address of the `SphinxModuleProxy`.
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
