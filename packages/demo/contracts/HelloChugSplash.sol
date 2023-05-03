// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4 <0.9.0;

import {IERC20} from 'isolmate/interfaces/tokens/IERC20.sol';
import {IGreeter} from 'interfaces/IGreeter.sol';

contract Greeter is IGreeter {
  // Empty string for revert checks
  /// @dev result of doing keccak256(bytes(''))
  bytes32 internal constant _EMPTY_STRING = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;

  /// @inheritdoc IGreeter
  address public immutable OWNER;

  /// @inheritdoc IGreeter
  string public greeting;

  /// @inheritdoc IGreeter
  IERC20 public token;

  /**
   * @notice Defines the owner to the msg.sender and sets the
   * initial greeting
   *
   * @param _greeting Initial greeting
   * @param _token Initial token
   */
  constructor(string memory _greeting, IERC20 _token) {
    OWNER = msg.sender;
    token = _token;
    setGreeting(_greeting);
  }

  /// @inheritdoc IGreeter
  function setGreeting(string memory _greeting) public onlyOwner {
    if (keccak256(bytes(_greeting)) == _EMPTY_STRING) {
      revert Greeter_InvalidGreeting();
    }

    greeting = _greeting;
    emit GreetingSet(_greeting);
  }

  /// @inheritdoc IGreeter
  function greet() external view returns (string memory _greeting, uint256 _balance) {
    _greeting = greeting;
    _balance = token.balanceOf(msg.sender);
  }

  /**
   * @notice Reverts in case the function was not called by
   * the owner of the contract
   */
  modifier onlyOwner() {
    if (msg.sender != OWNER) {
      revert Greeter_OnlyOwner();
    }
    _;
  }
}
