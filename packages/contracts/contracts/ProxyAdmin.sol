// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Owned } from "@rari-capital/solmate/src/auth/Owned.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { ProxyUpdater } from "./ProxyUpdater.sol";
import { IProxyAdapter } from "./IProxyAdapter.sol";

/**
 * @title ProxyAdmin
 * @notice The ProxyAdmin is a contract associated with each ChugSplashManager that owns the various
 *         proxies for a given project. The ProxyAdmin delegatecalls into various ProxyAdapter
 *         contracts that correspond to different proxy types. Using this pattern, the ProxyAdmin
 *         can universally handle all different proxy types as long as the ProxyAdmin is considered
 *         the owning address of each proxy.
 */
contract ProxyAdmin is Owned {
    /**
     * @notice "Magic" prefix. When prepended to some arbitrary bytecode and used to create a
     *         contract, the appended bytecode will be deployed as given.
     */
    bytes13 internal constant DEPLOY_CODE_PREFIX = 0x600D380380600D6000396000f3;

    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @notice Address of the ProxyUpdater.
     */
    address public immutable proxyUpdater;

    /**
     * @param _registry     Address of the ChugSplashRegistry.
     * @param _proxyUpdater Address of the ProxyUpdater.
     */
    constructor(ChugSplashRegistry _registry, address _proxyUpdater) Owned(msg.sender) {
        registry = _registry;
        proxyUpdater = _proxyUpdater;
    }

    /**
     * @notice Sets new code for the proxy contract's implementation. Note that this scheme is a bit
     *         different from the standard proxy scheme where one would typically deploy the code
     *         separately and then set the implementation address. We're doing it this way because
     *         it gives us a lot more freedom on the client side.
     *
     * @param _proxy     Address of the proxy to upgrade.
     * @param _proxyType The proxy's type. This is the zero-address for default proxies.
     * @param _code      Creation bytecode to be deployed.
     */
    function setProxyCode(
        address payable _proxy,
        bytes32 _proxyType,
        bytes memory _code
    ) public {
        // TODO: Add a re-entrancy guard to this function if we move away from using
        // `DEPLOY_CODE_PREFIX`. There is currently no risk of re-entrancy because the prefix
        // guarantees that no sub-calls can be made in the implementation contract's constructor. In
        // the future, we might want to move away from the prefix to add support for constructors
        // that can run arbitrary creation bytecode. It will then become become necessary to add a
        // re-entrancy guard to prevent a constructor from calling another contract which in turn
        // calls back into setCode or setStorage.

        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(_proxyType);
        require(adapter != address(0), "ProxyAdmin: proxy type has no adapter");

        // Get the address of the current implementation for the proxy.
        address implementation = _getProxyImplementation(_proxy, adapter);

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

        // Delegatecall the adapter to upgrade the proxy's implementation contract.
        _upgradeProxyTo(_proxy, adapter, implementation);
    }

    /**
     * @notice Modifies a storage slot within the proxy contract. Can only be called by the
     *         ChugSplashManager that owns this contract.
     *
     * @param _proxy     Address of the proxy to upgrade.
     * @param _proxyType The proxy's type. This is the zero-address for default proxies.
     * @param _key       Storage key to modify.
     * @param _value     New value for the storage key.
     */
    function setProxyStorage(
        address payable _proxy,
        bytes32 _proxyType,
        bytes32 _key,
        bytes32 _value
    ) public onlyOwner {
        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(_proxyType);
        require(adapter != address(0), "ProxyAdmin: proxy type has no adapter");

        // Get the address of the current implementation for the proxy. The ProxyAdmin will set
        // the proxy's implementation back to this address after setting it to be the
        // ProxyUpdater and calling `setStorage`.
        address implementation = _getProxyImplementation(_proxy, adapter);

        // Delegatecall the adapter to upgrade the proxy's implementation to be the
        // ProxyUpdater, which has the `setStorage` function.
        _upgradeProxyTo(_proxy, adapter, proxyUpdater);

        // Call the `setStorage` action on the proxy.
        (bool success, ) = _proxy.call(abi.encodeCall(ProxyUpdater.setStorage, (_key, _value)));
        require(success, "ProxyAdmin: call to set proxy storage failed");

        // Delegatecall the adapter to set the proxy's implementation back to its original
        // address.
        _upgradeProxyTo(_proxy, adapter, implementation);
    }

    /**
     * @notice Delegatecalls an adapter to get the address of the proxy's implementation contract.
     *
     * @param _proxy   Address of the proxy.
     * @param _adapter Address of the adapter to use for the proxy.
     */
    function _getProxyImplementation(address payable _proxy, address _adapter)
        internal
        returns (address)
    {
        (bool success, bytes memory implementationBytes) = _adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.getProxyImplementation, (_proxy))
        );
        require(success, "ProxyAdmin: delegatecall to get proxy implementation failed");

        // Convert the implementation's type from bytes to address.
        address implementation;
        assembly {
            implementation := mload(add(implementationBytes, 32))
        }
        return implementation;
    }

    /**
     * @notice Transfers ownership of a proxy from this contract to the project owner.
     *         Can only be called by the ChugSplashManager that owns this contract.
     *
     * @param _proxy     Proxy that is the subject of the ownership transfer.
     * @param _proxyType The proxy's type.
     * @param _newOwner  Address of the project owner that is receiving ownership of the proxy.
     */
    function transferProxyOwnership(
        address payable _proxy,
        bytes32 _proxyType,
        address _newOwner
    ) public onlyOwner {
        // Get the adapter that corresponds to this proxy type.
        address adapter = registry.adapters(_proxyType);
        require(adapter != address(0), "ProxyAdmin: proxy type has no adapter");

        // Delegatecall the adapter to change ownership of the proxy.
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.changeProxyAdmin, (_proxy, _newOwner))
        );
        require(success, "ProxyAdmin: delegatecall to change proxy admin failed");
    }

    /**
     * @notice Delegatecalls an adapter to upgrade a proxy's implementation contract.
     *
     * @param _proxy          Address of the proxy to upgrade.
     * @param _adapter        Address of the adapter to use for the proxy.
     * @param _implementation Address to set as the proxy's new implementation contract.
     */
    function _upgradeProxyTo(
        address payable _proxy,
        address _adapter,
        address _implementation
    ) internal {
        (bool success, ) = _adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.upgradeProxyTo, (_proxy, _implementation))
        );
        require(success, "ProxyAdmin: delegatecall to upgrade proxy failed");
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
