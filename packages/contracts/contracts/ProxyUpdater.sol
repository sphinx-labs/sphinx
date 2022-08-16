// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title ProxyUpdater
 * @notice The ProxyUpdater contains the logic that sets the bytecode and storage of the proxy
 *         when an action is executed in the ChugSplashManager. When an action is executed, the
 *         ChugSplashManager *temporarily* sets the proxy's implementation to be this contract
 *         so that the proxy can delegatecall into it.
 */
contract ProxyUpdater {
    /**
     * @notice "Magic" prefix. When prepended to some arbitrary bytecode and used to create a
     *         contract, the appended bytecode will be deployed as given.
     */
    bytes13 internal constant DEPLOY_CODE_PREFIX = 0x600D380380600D6000396000f3;

    /**
     * @notice Sets the code for the proxy's implementation. Since this contract *is* the proxy's
     *         implementation at the time of this call, it will be overwritten by the new
     *         implementation. This is fine, since the ProxyUpdater is only meant to be the
     *         implementation contract temporarily. Also note that this scheme is a bit different
     *         from the standard proxy scheme where one would typically deploy the code separately
     *         and then set the implementation address. We're doing it this way because it gives
     *         us a lot more freedom on the client side.
     *
     * @param _implementationKey The key of the proxy's implementation address. For EIP-1967
     *                           proxies, this value is:
     *                           `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`.
     * @param _code              New contract code to deploy.
     */
    function setCode(bytes32 _implementationKey, bytes memory _code) external {
        // TODO: Add a re-entrancy guard to this function if we move away from using
        // `DEPLOY_CODE_PREFIX`. There is currently no risk of re-entrancy because the prefix
        // guarantees that no sub-calls can be made in the implementation contract's constructor. In
        // the future, we might want to move away from the prefix to add support for constructors
        // that can run arbitrary creation bytecode. It will then become become necessary to add a
        // re-entrancy guard to prevent a constructor from calling another contract which in turn
        // calls back into setCode or setStorage.

        // Get the address of the current implementation.
        address implementation = _getImplementation(_implementationKey);

        // If the code hash matches the code hash of the new implementation then we return early.
        if (keccak256(_code) == _getAccountCodeHash(implementation)) {
            return;
        }

        // Create the deploycode by prepending the magic prefix.
        bytes memory deploycode = abi.encodePacked(DEPLOY_CODE_PREFIX, _code);

        // Deploy the code and set the new implementation address.
        address newImplementation;
        assembly {
            newImplementation := create(0x0, add(deploycode, 0x20), mload(deploycode))
        }

        // Check that the code was actually deployed correctly. It might be impossible to fail this
        // check. Should only happen if the contract creation from above runs out of gas but this
        // parent execution thread does NOT run out of gas. Seems like we should be doing this check
        // anyway though.
        require(
            _getAccountCodeHash(newImplementation) == keccak256(_code),
            "ProxyUpdater: code was not correctly deployed"
        );

        _setImplementation(_implementationKey, newImplementation);
    }

    /**
     * @notice Modifies some storage slot within the proxy contract. Gives us a lot of power to
     *         perform upgrades in a more transparent way.
     *
     * @param _key   Storage key to modify.
     * @param _value New value for the storage key.
     */
    function setStorage(bytes32 _key, bytes32 _value) external {
        assembly {
            sstore(_key, _value)
        }
    }

    /**
     * @notice Sets the implementation address.
     *
     * @param _implementationKey The key of the proxy's implementation address.
     * @param _implementation    New implementation address.
     */
    function _setImplementation(bytes32 _implementationKey, address _implementation) internal {
        assembly {
            sstore(_implementationKey, _implementation)
        }
    }

    /**
     * @notice Queries the implementation address.
     *
     * @param _implementationKey The key of the proxy's implementation address.
     *
     * @return Implementation address.
     */
    function _getImplementation(bytes32 _implementationKey) internal view returns (address) {
        address implementation;
        assembly {
            implementation := sload(_implementationKey)
        }
        return implementation;
    }

    /**
     * @notice Gets the code hash for a given account.
     *
     * @param _account Address of the account to get a code hash for.
     *
     * @return Code hash for the account.
     */
    function _getAccountCodeHash(address _account) internal view returns (bytes32) {
        bytes32 codeHash;
        assembly {
            codeHash := extcodehash(_account)
        }
        return codeHash;
    }
}
