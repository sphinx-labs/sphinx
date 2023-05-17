// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ProxyUpdater } from "./ProxyUpdater.sol";

/**
 * @title OZUUPSUdater
 * @notice Proxy updater that works with OpenZeppelin UUPS proxies. This contract uses a special
    storage slot key called the `CHUGSPLASH_ADMIN_KEY` which stores the owner address for the
    duration of the upgrade. This is a convenient way to keep track of the admin during the upgrade
    because OpenZeppelin UUPS proxies do not have a standard ownership mechanism. When the upgrade
    is finished, this key is set back to address(0).
 */
contract OZUUPSUpdater is ProxyUpdater {
    /**
     * @notice The storage slot that holds the address of the implementation.
     *         bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
     */
    bytes32 internal constant IMPLEMENTATION_KEY =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /**
     * @notice The storage slot that holds the address of the ChugSplash admin.
     *         bytes32(uint256(keccak256('chugsplash.proxy.admin')) - 1)
     */
    bytes32 internal constant CHUGSPLASH_ADMIN_KEY =
        0xadf644ee9e2068b2c186f6b9a2f688d3450c4110b8018da281fbbd8aa6c34995;

    /**
     * @notice Address of this contract. This must be an immutable variable so that it remains
       consistent when delegate called from a proxy.
     */
    address internal immutable THIS_ADDRESS = address(this);

    /**
     * @notice An event that is emitted each time the implementation is changed. This event is part
     *         of the EIP-1967 specification.
     *
     * @param implementation The address of the implementation contract
     */
    event Upgraded(address indexed implementation);

    /**
     * @notice A modifier that reverts if not called by the ChugSplash admin or by address(0) to
       allow
     *         eth_call to interact with this proxy without needing to use low-level storage
     *         inspection. We assume that nobody is able to trigger calls from address(0) during
     *         normal EVM execution.
     */
    modifier ifChugSplashAdmin() {
        require(
            msg.sender == _getChugSplashAdmin() || msg.sender == address(0),
            "OZUUPSUpdater: caller is not admin"
        );
        _;
    }

    /**
     * @notice Check that the execution is not being performed through a delegate call. This allows
       a function to be
     * callable on the implementation contract but not through a proxy.
     */
    modifier notDelegated() {
        require(
            address(this) == THIS_ADDRESS,
            "OZUUPSUpdater: must not be called through delegatecall"
        );
        _;
    }

    /**
     * @notice Set the implementation contract address. Only callable by the ChugSplash admin.
     *
     * @param _implementation Address of the implementation contract.
     */
    function upgradeTo(address _implementation) external ifChugSplashAdmin {
        _setImplementation(_implementation);
    }

    /**
     * @notice Initiates an upgrade by setting the ChugSplash admin to the caller's address.
     */
    function initiate() external {
        if (_getChugSplashAdmin() != msg.sender) {
            _setChugSplashAdmin(msg.sender);
        }
    }

    /**
     * @notice Completes an upgrade by setting the ChugSplash admin to address(0) and setting the
       proxy's implementation to a new address. Only callable by the ChugSplash admin.
     *
     * @param _implementation Address of the implementation contract.
     */
    function complete(address _implementation) external ifChugSplashAdmin {
        _setChugSplashAdmin(address(0));
        _setImplementation(_implementation);
    }

    /**
     * @notice Implementation of the ERC1822 `proxiableUUID` function. This returns the storage slot
       used by the implementation. It is used to validate the implementation's compatibility when
       performing an upgrade. Since this function is only meant to be available on an implementation
       contract, it must revert if invoked through a proxy. This is guaranteed by the `notDelegated`
       modifier.

       @return The storage slot of the implementation.
     */
    function proxiableUUID() external view notDelegated returns (bytes32) {
        return IMPLEMENTATION_KEY;
    }

    /**
     * Only callable by the ChugSplash admin.
     * @inheritdoc ProxyUpdater
     */
    function setStorage(
        bytes32 _key,
        uint8 _offset,
        bytes memory _value
    ) public override ifChugSplashAdmin {
        super.setStorage(_key, _offset, _value);
    }

    /**
     * @notice Sets the implementation address.
     *
     * @param _implementation New implementation address.
     */
    function _setImplementation(address _implementation) internal {
        assembly {
            sstore(IMPLEMENTATION_KEY, _implementation)
        }
        emit Upgraded(_implementation);
    }

    /**
     * @notice Sets the ChugSplash admin to a new address.
     *
     * @param _newAdmin New admin address.
     */
    function _setChugSplashAdmin(address _newAdmin) internal {
        assembly {
            sstore(CHUGSPLASH_ADMIN_KEY, _newAdmin)
        }
    }

    /**
     * @notice Gets the ChugSplash admin's address.
     *
     * @return ChugSplash admin address.
     */
    function _getChugSplashAdmin() internal view returns (address) {
        address chugsplashAdmin;
        assembly {
            chugsplashAdmin := sload(CHUGSPLASH_ADMIN_KEY)
        }
        return chugsplashAdmin;
    }
}
