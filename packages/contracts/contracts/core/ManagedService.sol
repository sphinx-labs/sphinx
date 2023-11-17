// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ManagedService
 * @notice Contract controlled by the Sphinx managed service. This contract is used by
 *         the managed service to remotely execute deployments. Users can opt into this
 *         functionality if they choose to do so.
 */
contract ManagedService is AccessControl, ReentrancyGuard {

    /**
     * @notice Role required to make calls through this contract.
     */
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /**
     * @notice Emitted when funds are withdrawn from this contract.
     *
     * @param recipient The recipient that withdrew the funds.
     * @param amount    Amount of ETH withdrawn.
     */
    event Withdrew(address indexed recipient, uint256 amount);

    /**
     * @notice Emitted when a call is made.
     *
     * @param relayer  The address of the account that made the call.
     * @param to       The address of the remote contract.
     * @param dataHash A keccak256 hash of the input data.
     */
    event Called(address indexed relayer, address indexed to, bytes32 dataHash);

    /**
     * @notice Emitted when funds are transferred to this contract.
     *
     * @param sender The address that sent the funds.
     * @param amount The amount of funds sent to this contract.
     */
    event Deposited(address indexed sender, uint256 amount);

    /**
     * @notice A modifier that refunds the caller for the gas spent in the function call.
     *
     *         Includes a conservative 40k buffer to cover the cost of the refund modifier
     *         which is not included in the gas usage calculation.
     */
    modifier refund() {
        uint256 start = gasleft();
        _;
        uint256 spent = start - gasleft() + 42000;
        (bool success, ) = payable(msg.sender).call{ value: spent * tx.gasprice }(new bytes(0));
        require(success, "ManagedService: failed to refund caller");
    }

    /**
     * @param _owner The address that will be granted the `DEFAULT_ADMIN_ROLE`. This address is the
     *               multisig owned by the Sphinx team.
     */
    constructor(address _owner) {
        _grantRole(bytes32(0), _owner);
    }

    /**
     * @notice Allows for this contract to receive ETH.
     */
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Allows for the relayers or admin to send ETH from the contract to a recipient.
     *
     * @param _amount    The amount of ETH to withdraw.
     * @param _recipient The address that will receive the ETH.
     */
    function withdrawTo(uint256 _amount, address _recipient) public nonReentrant {
        require(
            hasRole(RELAYER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ManagedService: invalid caller"
        );
        require(_amount <= address(this).balance, "ManagedService: insufficient funds");
        require(_recipient != address(0), "ManagedService: recipient is zero address");

        emit Withdrew(_recipient, _amount);

        // slither-disable-next-line arbitrary-send-eth
        (bool success, ) = payable(_recipient).call{ value: _amount }(new bytes(0));
        require(success, "ManagedService: failed to send funds");
    }

    /**
     * @notice Allows for the relayers to make arbitrary calls using this contract. The relayers
     *         will be automatically refunded for the gas spent on the call.
     *
     *         If the underlying call reverts, then we decode and forward the revert reason.
     *
     * @param  _to   The target address.
     * @param  _data The data that will be sent.
     *
     * @return bytes The return value of the underlying call.
     */
    function exec(
        address _to,
        bytes calldata _data
    ) public payable nonReentrant refund returns (bytes memory) {
        require(hasRole(RELAYER_ROLE, msg.sender), "ManagedService: invalid caller");
        require(_to != address(0), "ManagedService: target is address(0)");

        // slither-disable-next-line arbitrary-send-eth
        (bool success, bytes memory res) = _to.call{ value: msg.value }(_data);

        if (!success) {
            // If the call failed, then decode and forward the revert reason
            if (res.length == 0) revert("ManagedService: Transaction reverted silently");
            assembly {
                revert(add(32, res), mload(res))
            }
        } else {
            emit Called(msg.sender, _to, keccak256(_data));
            return res;
        }
    }
}
