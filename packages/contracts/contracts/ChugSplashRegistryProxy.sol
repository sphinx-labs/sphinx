// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Proxy } from "./libraries/Proxy.sol";

/**
 * @title ChugSplashManagerProxy
 * @notice A temporary proxy that will be removed once ChugSplash is non-upgradeable.
 *         BEWARE: This contract should be stable while ChugSplash is upgradeable because its
 *         bytecode determines the addresses of all contracts deployed by ChugSplash (via
 *         `CREATE2`).
 */
contract ChugSplashRegistryProxy is Proxy {
    /**
     * @notice The storage slot that holds the address of the ChugSplashManager implementation.
     *         bytes32(uint256(keccak256('chugsplash.manager.impl')) - 1)
     */
    bytes32 internal constant CHUGSPLASH_MANAGER_IMPL_SLOT_KEY =
        0x7b0358d93596f559fb0a8295e803eca8ad9478a0e8c810ef8867dd1bd7a1cbb1;

    /**
     * @param _admin Owner of this contract.
     */
    constructor(address _admin) payable Proxy(_admin) {}

    /**
     * @param _managerImpl Address of the initial ChugSplashManager implementation.
     */
    function initialize(address _managerImpl) public {
        require(managerImplementation() == address(0), "ChugSplashRegistryProxy: manager impl already initialized");
        assembly {
            sstore(CHUGSPLASH_MANAGER_IMPL_SLOT_KEY, _managerImpl)
        }
    }

    function setManagerImpl(address _managerImpl) public {
        require(msg.sender == _getAdmin(), "ChugSplashRegistryProxy: caller is not admin");
        assembly {
            sstore(CHUGSPLASH_MANAGER_IMPL_SLOT_KEY, _managerImpl)
        }
    }

    function managerImplementation() public view returns (address) {
        address impl;
        assembly {
            impl := sload(CHUGSPLASH_MANAGER_IMPL_SLOT_KEY)
        }
        return impl;
    }
}
