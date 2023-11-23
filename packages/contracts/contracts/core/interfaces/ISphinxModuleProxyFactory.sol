// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

/**
 * @title ISphinxModuleProxyFactory
 * @notice Interface for the `SphinxModuleProxyFactory` contract.
 */
interface ISphinxModuleProxyFactory {
    /**
     * @notice Emitted whenever a `SphinxModuleProxy` is deployed by this factory.
     *
     * @param sphinxModuleProxy The address of the `SphinxModuleProxy` that was deployed.
     * @param safeProxy         The address of the Gnosis Safe proxy that the `SphinxModuleProxy`
     *                          belongs to.
     */
    event SphinxModuleProxyDeployed(address indexed sphinxModuleProxy, address indexed safeProxy);

    /**
     * @notice The address of the `SphinxModule` implementation contract.
     */
    function SPHINX_MODULE_IMPL() external view returns (address);

    /**
     * @notice Computes the address of a `SphinxModuleProxy`. Assumes that the deployer of the
     *         `SphinxModuleProxy` and the `SphinxModule` is this `SphinxModuleProxyFactory`
     *         contract.
     *
     * @param _safeProxy The address of the Gnosis Safe proxy contract that the `SphinxModuleProxy`
     *                   belongs to.
     * @param _caller    The address of the caller that deployed (or will deploy) the
     *                   `SphinxModuleProxy` through the `SphinxModuleProxyFactory`.
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the address
     *                   of the `SphinxModuleProxy`.
     *
     * @return The `CREATE2` address of the `SphinxModuleProxy`.
     */
    function computeSphinxModuleProxyAddress(
        address _safeProxy,
        address _caller,
        uint256 _saltNonce
    ) external view returns (address);

    /**
     * @notice Uses `CREATE2` to deploy a `SphinxModuleProxy`. Use this function if the Gnosis Safe
     *         has already been deployed on this network. Otherwise, use
     *         `deploySphinxModuleProxyFromSafe`.
     *
     *          This function will revert if a contract already exists at the `CREATE2` address.
     *          It will also revert if the `_safeProxy` is the zero-address.
     *
     * @param _safeProxy Address of the Gnosis Safe proxy that the `SphinxModuleProxy` will belong
     *                   to.
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModuleProxy`.
     *
     * @return sphinxModuleProxy The `CREATE2` address of the deployed `SphinxModuleProxy`.
     */
    function deploySphinxModuleProxy(
        address _safeProxy,
        uint256 _saltNonce
    ) external returns (address sphinxModuleProxy);

    /**
     * @notice Uses `CREATE2` to deploy a `SphinxModuleProxy`. Meant to be called by a Gnosis Safe
     *         during its initial deployment. Otherwise, use `deploySphinxModuleProxy` instead.
     *         After calling this function, enable the `SphinxModuleProxy` in the Gnosis Safe by
     *         calling `enableSphinxModuleProxyFromSafe`.
     *
     *         Unlike `deploySphinxModuleProxy`, this function doesn't return the address of the
     *         deployed `SphinxModuleProxy`. This is because this function is meant to be called
     *         from a Gnosis Safe, where the return value is unused.
     *
     *         This function will revert if a contract already exists at the `CREATE2` address.
     *
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModuleProxy`.
     */
    function deploySphinxModuleProxyFromSafe(uint256 _saltNonce) external;

    /**
     * @notice Enable a `SphinxModuleProxy` within a Gnosis Safe. Must be delegatecalled by
     *         the Gnosis Safe. This function is meant to be triggered during the deployment of a
     *         Gnosis Safe after `SphinxModuleProxyFactory.deploySphinxModuleProxyFromSafe`. If the
     *         Gnosis Safe has already been deployed, use the Gnosis Safe's `enableModule` function
     *         instead.
     *
     *         We don't emit an event because this function is meant to be delegatecalled by a
     *         Gnosis Safe, which emits an `EnabledModule` event when we call its `enableModule`
     *         function.
     *
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the
     *                   address of the `SphinxModuleProxy`.
     */
    function enableSphinxModuleProxyFromSafe(uint256 _saltNonce) external;
}
