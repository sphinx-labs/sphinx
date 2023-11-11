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
    /**
     * @dev Role required to collect the protocol creator's payment.
     */
    bytes32 internal constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /**
     * @notice Emitted when a protocol payment recipient claims a payment.
     *
     * @param recipient The recipient that withdrew the funds.
     * @param amount    Amount of ETH withdrawn.
     */
    event Withdew(address indexed recipient, uint256 amount);

    /**
     * @notice Emitted when a call is made to a remote contract.
     *
     * @param to   The address of the remote contract.
     * @param data The data that was sent to the remote contract.
     */
    event Called(address indexed relayer, address indexed to, bytes data, bytes res);

    /**
     * @notice A modifer that refunds the caller for the gas spent in the function call.
     */
    modifier refund {
        uint256 gasAtStart = gasleft();
        _;
        uint256 gasSpent = gasAtStart - gasleft() + 28925;
        (bool success, ) = payable(msg.sender).call{ value: gasSpent * tx.gasprice }(new bytes(0));
        require(success, "ManagedService: failed to refund caller");
    }

    /**
     * @param _owner The address that will be granted the `DEFAULT_ADMIN_ROLE`. This address is the
       multisig owned by the Sphinx team.
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
     */
    function withdraw(uint256 _amount) external refund {
        require(
            hasRole(RELAYER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ManagedService: invalid caller"
        );
        require(_amount <= address(this).balance, "ManagedService: insufficient funds to withdraw");

        emit Withdew(msg.sender, _amount);

        // slither-disable-next-line arbitrary-send-eth
        (bool success, ) = payable(msg.sender).call{ value: _amount }(new bytes(0));
        require(success, "ManagedService: failed to funds");
    }

    // TODO - docs
    function call(address _to, bytes calldata _data) external payable refund returns (bytes memory) {
        require(hasRole(RELAYER_ROLE, msg.sender), "ManagedService: invalid caller");

        // slither-disable-next-line arbitrary-send-eth
        (bool success, bytes memory res) = _to.call{ value: msg.value }(_data);

        if (!success) {
            if (res.length < 68) revert("ManagedService: Transaction reverted silently");
            assembly {
                res := add(res, 0x04)
            }
            revert(abi.decode(res, (string)));
        } else {
            emit Called(msg.sender, _to, _data, res);
            return res;
        }
    }
}
