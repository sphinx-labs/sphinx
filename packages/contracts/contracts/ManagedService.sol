// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ManagedService
 * @notice Contract controlled by the ChugSplash managed service. This contract allows the managed
   service to remotely execute deployments, propose deployments, and collect the protocol's fee.
Users can opt in to this functionality if they choose to do so.
 */
contract ManagedService is AccessControl {
    bytes32 public constant CALLER_ROLE = keccak256("CALLER_ROLE");

    /**
     * @notice Role required to collect the protocol creator's payment.
     */
    bytes32 internal constant PROTOCOL_PAYMENT_RECIPIENT_ROLE =
        keccak256("PROTOCOL_PAYMENT_RECIPIENT_ROLE");

    event ExecutedCall(address indexed from, address indexed to, uint256 value);

    /**
     * @notice Emitted when a protocol payment recipient claims a payment.
     *
     * @param recipient The recipient that withdrew the funds.
     * @param amount    Amount of ETH withdrawn.
     */
    event ProtocolPaymentClaimed(address indexed recipient, uint256 amount);

    /**
     * @notice Reverts if the caller is not a protocol payment recipient.
     */
    error CallerIsNotProtocolPaymentRecipient();

    /**
     * @param _owner The address that will be granted the `DEFAULT_ADMIN_ROLE`. This address is the
       multisig owned by the ChugSplash team.
     */
    constructor(address _owner) {
        _grantRole(bytes32(0), _owner);
    }

    /**
     * @notice Executes an arbitrary call to any contract. This is primarily used to claim
     *         organizations on behalf of users.
     * @param _to Address of target contract.
     * @param _data The calldata.
     */
    function executeCall(
        address _to,
        bytes memory _data,
        uint256 _value
    ) external payable onlyRole(CALLER_ROLE) returns (bytes memory) {
        emit ExecutedCall(msg.sender, _to, _value);
        (bool success, bytes memory returnData) = _to.call{ value: _value }(_data);
        require(success, "PermissionedCaller: call failed");
        return returnData;
    }

    /**
     * @notice Allows the protocol creators to claim their royalty, which is only earned during
       remotely executed deployments.
     */
    function claimProtocolPayment(uint256 _amount) external {
        if (!hasRole(PROTOCOL_PAYMENT_RECIPIENT_ROLE, msg.sender)) {
            revert CallerIsNotProtocolPaymentRecipient();
        }
        if (_amount > address(this).balance) {
            revert("ManagedService: Insufficient funds to withdraw protocol payment");
        }

        emit ProtocolPaymentClaimed(msg.sender, _amount);

        // slither-disable-next-line arbitrary-send-eth
        (bool success, ) = payable(msg.sender).call{ value: _amount }(new bytes(0));
        if (!success) {
            revert("ManagedService: Failed to withdraw protocol payment");
        }
    }

    /**
     * @notice Allows for this contract to receive ETH.
     */
    receive() external payable {}
}
