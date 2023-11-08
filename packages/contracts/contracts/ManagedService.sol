// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ManagedService
 * @notice Contract controlled by the Sphinx managed service. This contract allows the managed
   service to remotely execute deployments and collect the protocol's fee.
Users can opt in to this functionality if they choose to do so.
 */
contract ManagedService is AccessControl {
    ERC20 public immutable usdc;

    /**
     * @dev Role required to collect the protocol creator's payment.
     */
    bytes32 internal constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /**
     * @dev Role required to be a remote executor for a deployment.
     */
    bytes32 internal constant REMOTE_EXECUTOR_ROLE = keccak256("REMOTE_EXECUTOR_ROLE");

    /**
     * @notice Emitted when a protocol payment recipient claims a payment.
     *
     * @param recipient The recipient that withdrew the funds.
     * @param amount    Amount of ETH withdrawn.
     */
    event ProtocolPaymentClaimed(address indexed recipient, uint256 amount);

    /**
     * @param _owner The address that will be granted the `DEFAULT_ADMIN_ROLE`. This address is the
       multisig owned by the Sphinx team.
     */
    constructor(address _owner, address _usdc) {
        usdc = ERC20(_usdc);
        _grantRole(bytes32(0), _owner);
    }

    /**
     * @notice Allows the protocol creators to claim their royalty, which is only earned during
       remotely executed deployments.
     */
    function withdrawRelayerFunds(uint256 _amount) external {
        require(
            hasRole(RELAYER_ROLE, msg.sender) && !hasRole(REMOTE_EXECUTOR_ROLE, msg.sender),
            "ManagedService: invalid caller"
        );
        require(_amount <= address(this).balance, "ManagedService: insufficient funds to withdraw");

        emit ProtocolPaymentClaimed(msg.sender, _amount);

        // slither-disable-next-line arbitrary-send-eth
        (bool success, ) = payable(msg.sender).call{ value: _amount }(new bytes(0));
        require(success, "ManagedService: failed to withdraw relayer funds");
    }

    function withdrawUSDCBalance(address _to, uint256 _amount) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ManagedService: caller is not admin");
        usdc.transfer(_to, _amount);
    }

    /**
     * @notice Allows for this contract to receive ETH.
     */
    receive() external payable {}
}
