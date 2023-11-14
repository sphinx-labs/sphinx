// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { console } from "sphinx-forge-std/console.sol";

/**
 * @title ManagedService
 * @notice Contract controlled by the Sphinx managed service. This contract is used by
           the managed service to remotely execute deployments.
           Users can opt in to this functionality if they choose to do so.
 */
contract ManagedService is AccessControl {
    /**
     * @dev Role required to make calls through this contract.
     */
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /**
     * @notice Emitted when funds are withdrawn from this contract.
     *
     * @param recipient The recipient that withdrew the funds.
     * @param amount    Amount of ETH withdrawn.
     */
    event Withdew(address indexed recipient, uint256 amount);

    /**
     * @notice Emitted when a call is made to a remote contract.
     *
     * @param relayer The address of the account that made the call.
     * @param to      The address of the remote contract.
     * @param data    A keccak256 hash of the input data.
     */
    event Called(address indexed relayer, address indexed to, bytes32 data);

    /**
     * @notice A modifer that refunds the caller for the gas spent in the function call.
     */
    modifier refund {
        uint256 start = gasleft();
        _;
        uint256 spent = start - gasleft() + 40000;
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
    receive() external payable {}

    /**
     * @notice Allows for the relayers or admin to withdraw ETH from the contract.
     *
     * @param _amount The amount of ETH to withdraw.
     */
    function withdraw(uint256 _amount) external {
        withdrawTo(_amount, msg.sender);
    }

    /**
     * @notice Allows for the relayers or admin to send ETH from the contract to a recipient.
     *
     * @param _amount The amount of ETH to withdraw.
     * @param _recipient The address that will receive the ETH.
     */
    function withdrawTo(uint256 _amount, address _recipient) public {
        require(
            hasRole(RELAYER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ManagedService: invalid caller"
        );
        require(_amount <= address(this).balance, "ManagedService: insufficient funds");
        require(_recipient != address(0), "ManagedService: recipient is zero address");

        emit Withdew(_recipient, _amount);

        // slither-disable-next-line arbitrary-send-eth
        (bool success, ) = payable(_recipient).call{ value: _amount }(new bytes(0));
        require(success, "ManagedService: failed to send funds");
    }

    /**
     * @notice Allows for the relayers to make arbitrary calls using this contract. The relayers will
     *         be automatically refunded for the gas spent in the call.
     *
     * @param _to   The target address.
     * @param _data The data that will be sent.
     */
    function exec(address _to, bytes calldata _data) public payable refund returns (bytes memory) {
        require(
            hasRole(RELAYER_ROLE, msg.sender),
            "ManagedService: invalid caller"
        );

        // slither-disable-next-line arbitrary-send-eth
        (bool success, bytes memory res) = _to.call{ value: msg.value }(_data);

        if (!success) {
            if (res.length < 68) revert("ManagedService: Transaction reverted silently");
            assembly {
                res := add(res, 0x04)
            }
            revert(abi.decode(res, (string)));
        } else {
            emit Called(msg.sender, _to, keccak256(_data));
            return res;
        }
    }
}
