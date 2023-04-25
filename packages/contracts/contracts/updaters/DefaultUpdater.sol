// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ProxyUpdater } from "./ProxyUpdater.sol";

/**
 * @title DefaultUpdater
 * @notice Proxy Updater for an OpenZeppelin Transparent Upgradeable proxy. This is the proxy
 *         updater used by default proxies in the ChugSplash system. To learn more about the
 *         transparent proxy pattern, see:
 *         https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent_proxy
 */
contract DefaultUpdater is ProxyUpdater {
    /**
     * @notice The storage slot that holds the address of the owner.
     *         bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
     */
    bytes32 internal constant OWNER_KEY =
        0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    /**
     * @notice A modifier that reverts if not called by the owner or by address(0) to allow
     *         eth_call to interact with this proxy without needing to use low-level storage
     *         inspection. We assume that nobody is able to trigger calls from address(0) during
     *         normal EVM execution.
     */
    modifier ifAdmin() {
        require(
            msg.sender == _getAdmin() || msg.sender == address(0),
            "DefaultUpdater: caller is not admin"
        );
        _;
    }

    function setStorage(bytes32 _key, uint8 _offset, bytes memory _segment) external ifAdmin {
        super.setStorageValue(_key, _offset, _segment);
    }

    /**
     * @notice Queries the owner of the proxy contract.
     *
     * @return Owner address.
     */
    function _getAdmin() internal view returns (address) {
        address owner;
        assembly {
            owner := sload(OWNER_KEY)
        }
        return owner;
    }
}
