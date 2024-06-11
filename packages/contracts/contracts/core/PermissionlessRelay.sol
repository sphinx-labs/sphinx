// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title PermissionlessRelay
 * @notice A contract used for the `executor` field in the Sphinx Merkle tree which allows permissionless
 * execution of signed bundles by any address. This allows the Sphinx backend to work with any relayer account.
 */
contract PermissionlessRelay is ReentrancyGuard {
    /**
     * @notice Emitted when a call is made.
     *
     * @param relayer  The address of the account that made the call.
     * @param to       The address of the remote contract.
     * @param value    The value transferred from the caller to the destination address.
     * @param dataHash A keccak256 hash of the input data.
     */
    event Called(
        address indexed relayer,
        address payable indexed to,
        uint256 value,
        bytes32 indexed dataHash
    );

    /**
     * @notice Allows for the relayers to make arbitrary calls using this contract. We forward
     * the return value of the underlying function call to allow maximum flexibility in future
     * uses of this contract.
     *
     * @notice If `_to` is an EOA then this function will still call it and return successfully.
     *
     * @param  _to   The target address.
     * @param  _data The data that will be sent.
     *
     * @return bytes The return value of the underlying call.
     */
    function exec(
        address payable _to,
        bytes calldata _data
    ) public payable nonReentrant returns (bytes memory) {
        require(_to != address(0), "PermissionlessRelay: target is address(0)");

        emit Called(msg.sender, _to, msg.value, keccak256(_data));

        // slither-disable-next-line arbitrary-send-eth
        (bool success, bytes memory res) = _to.call{ value: msg.value }(_data);

        if (!success) {
            // If the call failed, then decode and forward the revert reason
            if (res.length == 0) revert("PermissionlessRelay: Transaction reverted silently");
            assembly {
                revert(add(32, res), mload(res))
            }
        } else {
            return res;
        }
    }
}
