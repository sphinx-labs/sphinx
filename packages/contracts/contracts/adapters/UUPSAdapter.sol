// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IProxyAdapter } from "../IProxyAdapter.sol";
import { Proxy } from "../libraries/Proxy.sol";

/**
 * @title UUPSAdapter
 * @notice Adapter for an OpenZeppelin UUPS Upgradeable proxy. To learn more about the transparent proxy
 *         pattern, see: https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent-vs-uups
 */
contract UUPSAdapter is IProxyAdapter {
    /**
     * @inheritdoc IProxyAdapter
     */
    function upgradeProxyTo(address payable _proxy, address _implementation) external {
        Proxy(_proxy).upgradeTo(_implementation);
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function upgradeProxyToAndCall(
        address payable _proxy,
        address _implementation,
        bytes calldata _data
    ) external returns (bytes memory) {
        // We perform a low-level call here to avoid OpenZeppelin's `TransparentUpgradeableProxy`
        // reverting on successful calls, which is likely occurring because its `upgradeToAndCall`
        // function doesn't return any data.
        (bool success, bytes memory returndata) = _proxy.call(
            abi.encodeCall(Proxy.upgradeToAndCall, (_implementation, _data))
        );
        require(success, "DefaultAdapter: call to proxy failed");
        return returndata;
    }

    /**
     * @inheritdoc IProxyAdapter
     */
    function changeProxyAdmin(address payable _proxy, address _newAdmin) external {
        Proxy(_proxy).changeAdmin(_newAdmin);
    }
}
