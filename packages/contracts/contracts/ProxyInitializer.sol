// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { ChugSplashRegistryProxy } from "./ChugSplashRegistryProxy.sol";

/**
 * @title ProxyInitializer
 * @notice Deploys a proxy in its constructor and transfers ownership of it to a specified address
 *         in its initializer. This allows the proxy's address to be deterministically calculated
 *         based on the address that *will* receive ownership, without the new owner needing to
 *         initialize it. This is useful for generating the proxy's address based on a multisig
 *         owner's address via Create2. Note that this will be removed when ChugSplash is
 *         non-upgradeable.
 */
contract ProxyInitializer is Initializable {
    /**
     * @notice Address of the proxy.
     */
    ChugSplashRegistryProxy public immutable proxy;

    /**
     * @notice Address that will receive ownership of the proxy in the initializer.
     */
    address public immutable newOwner;

    /**
     * @notice Deploys the proxy and sets the address that *will* receive ownership of the proxy in
     *         the initializer.
     *
     * @param _newOwner Address that will receive ownership of the proxy in the initializer.
     * @param _salt Salt to be used in the `CREATE2` call that deploys the proxy.
     */
    constructor(address _newOwner, bytes32 _salt) {
        newOwner = _newOwner;

        // Deploy the proxy.
        proxy = new ChugSplashRegistryProxy{ salt: _salt }(
            // The owner must initially be this contract so that it can set the proxy's
            // implementation contract in the initializer.
            address(this)
        );
    }

    /**
     * @notice Sets the proxy's implementation address and transfers ownership of the proxy to the
     *         new owner specified in the constructor.
     *
     * @param _implementation The proxy's implementation address.
     * @param _data           Data to delegatecall the new implementation with.
     */
    function initialize(address _implementation, bytes memory _data) external initializer {
        // Set the proxy's implementation contract and delegatecall it with the supplied data.
        proxy.upgradeToAndCall(_implementation, _data);

        // Transfer ownership of the proxy to the new owner.
        proxy.changeAdmin(newOwner);
    }
}
