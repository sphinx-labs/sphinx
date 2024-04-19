// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

// TODO(later): add the function to this interface.
interface ISphinxGnosisSafeProxyFactory {
    event DeployedGnosisSafeWithSphinxModule(
        address indexed safeProxy, address indexed moduleProxy, uint256 saltNonce
    );
}
