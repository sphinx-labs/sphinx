// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;

import { IGnosisSafeProxy } from "./IGnosisSafeProxy.sol";

interface IGnosisSafeProxyFactory {
    /// @dev Allows to create new proxy contact and execute a message call to the new proxy within one transaction.
    /// @param _singleton Address of singleton contract.
    /// @param initializer Payload for message call sent to new proxy contract.
    /// @param saltNonce Nonce that will be used to generate the salt to calculate the address of the new proxy contract.
    function createProxyWithNonce(
        address _singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (IGnosisSafeProxy proxy);

    /// @dev Allows to retrieve the creation code used for the Proxy deployment. With this it is
    // easily possible to calculate predicted address.
    function proxyCreationCode() external pure returns (bytes memory);
}
