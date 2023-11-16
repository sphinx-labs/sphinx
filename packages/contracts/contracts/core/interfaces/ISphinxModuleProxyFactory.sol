// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

interface ISphinxModuleProxyFactory {
    /**
     * @notice Emitted whenever a `SphinxModuleProxy` is deployed by this factory.
     *
     * @param sphinxModuleProxy The address of the `SphinxModuleProxy` that was deployed.
     * @param safeProxy    The address of the Gnosis Safe proxy that the `SphinxModuleProxy` belongs to.
     */
    event SphinxModuleProxyDeployed(address indexed sphinxModuleProxy, address indexed safeProxy);

    /**
     * @notice The address of the `SphinxModule`.
     */
    function SPHINX_MODULE_IMPL() external view returns (address);

    function computeSphinxModuleProxyAddress(
        address _safeProxy,
        address _caller,
        uint256 _saltNonce
    ) external view returns (address);
    function deploySphinxModuleProxy(
        address _safeProxy,
        uint256 _saltNonce
    ) external returns (address sphinxModuleProxy);
    function deploySphinxModuleProxyFromSafe(uint256 _saltNonce) external;
    function enableSphinxModuleProxyFromSafe(uint256 _saltNonce) external;
}
