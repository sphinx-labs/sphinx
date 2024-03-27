// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.22;

import './SwapAdapter.sol';
import './PayableMulticall.sol';
import {SimulationAdapter} from '@mean-finance/call-simulation/contracts/SimulationAdapter.sol';
import {IPermit2} from '../interfaces/external/IPermit2.sol';
import {Permit2Transfers} from '../libraries/Permit2Transfers.sol';
import './Governable.sol';

/**
 * @notice This contract will work as base companion for all our contracts. It will extend the capabilities of our companion
 *         contracts so that they can execute multicalls, swaps, revokes and more
 * @dev All public functions are payable, so that they can be multicalled together with other payable functions when msg.value > 0
 */
abstract contract BaseCompanion is SimulationAdapter, Governable, SwapAdapter, PayableMulticall {
  using Permit2Transfers for IPermit2;
  using SafeERC20 for IERC20;

  /**
   * @notice Returns the address of the Permit2 contract
   * @dev This value is constant and cannot change
   * @return The address of the Permit2 contract
   */
  // solhint-disable-next-line var-name-mixedcase
  IPermit2 public immutable PERMIT2;

  /// @notice The address of the swapper
  address public swapper;

  /// @notice The address of the allowance target
  address public allowanceTarget;

  constructor(
    address _swapper,
    address _allowanceTarget,
    address _governor,
    IPermit2 _permit2
  ) SwapAdapter() Governable(_governor) {
    swapper = _swapper;
    allowanceTarget = _allowanceTarget;
    PERMIT2 = _permit2;
  }

  receive() external payable {}

  /**
   * @notice Sends the specified amount of the given token to the recipient
   * @param _token The token to transfer
   * @param _amount The amount to transfer
   * @param _recipient The recipient of the token balance
   */
  function sendToRecipient(
    address _token,
    uint256 _amount,
    address _recipient
  ) external payable {
    _sendToRecipient(_token, _amount, _recipient);
  }

  /**
   * @notice Takes the given amount of tokens from the caller and transfers it to this contract
   * @param _token The token to take
   * @param _amount The amount to take
   */
  function takeFromCaller(
    IERC20 _token,
    uint256 _amount,
    address _recipient
  ) external payable {
    _token.safeTransferFrom(msg.sender, _recipient, _amount);
  }

  /**
   * @notice Executes a swap against the swapper
   * @param _allowanceToken The token to set allowance for (can be set to zero address to ignore)
   * @param _value The value to send to the swapper as part of the swap
   * @param _swapData The swap data
   * @param _tokenOut The token that will be bought as part of the swap
   */
  function runSwap(
    address _allowanceToken,
    uint256 _value,
    bytes calldata _swapData,
    address _tokenOut
  ) external payable returns (uint256 _amountOut) {
    if (_allowanceToken != address(0)) {
      IERC20(_allowanceToken).forceApprove(allowanceTarget, type(uint256).max);
    }

    _executeSwap(swapper, _swapData, _value);

    _amountOut = _tokenOut == PROTOCOL_TOKEN ? address(this).balance : IERC20(_tokenOut).balanceOf(address(this));
  }

  /**
   * @notice Takes the given amount of tokens from the caller with Permit2 and transfers it to this contract
   * @param _token The token to take
   * @param _amount The amount to take
   * @param _nonce The signed nonce
   * @param _deadline The signature's deadline
   * @param _signature The owner's signature
   * @param _recipient The address that will receive the funds
   */
  function permitTakeFromCaller(
    address _token,
    uint256 _amount,
    uint256 _nonce,
    uint256 _deadline,
    bytes calldata _signature,
    address _recipient
  ) external payable {
    PERMIT2.takeFromCaller(_token, _amount, _nonce, _deadline, _signature, _recipient);
  }

  /**
   * @notice Takes the a batch of tokens from the caller with Permit2 and transfers it to this contract
   * @param _tokens The tokens to take
   * @param _nonce The signed nonce
   * @param _deadline The signature's deadline
   * @param _signature The owner's signature
   * @param _recipient The address that will receive the funds
   */
  function batchPermitTakeFromCaller(
    IPermit2.TokenPermissions[] calldata _tokens,
    uint256 _nonce,
    uint256 _deadline,
    bytes calldata _signature,
    address _recipient
  ) external payable {
    PERMIT2.batchTakeFromCaller(_tokens, _nonce, _deadline, _signature, _recipient);
  }

  /**
   * @notice Checks if the contract has any balance of the given token, and if it does,
   *         it sends it to the given recipient
   * @param _token The token to check
   * @param _recipient The recipient of the token balance
   */
  function sendBalanceOnContractToRecipient(address _token, address _recipient) external payable {
    _sendBalanceOnContractToRecipient(_token, _recipient);
  }

  /**
   * @notice Sets a new swapper and allowance target
   * @param _newSwapper The address of the new swapper
   * @param _newAllowanceTarget The address of the new allowance target
   */
  function setSwapper(address _newSwapper, address _newAllowanceTarget) external onlyGovernor {
    swapper = _newSwapper;
    allowanceTarget = _newAllowanceTarget;
  }
}
