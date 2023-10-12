// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConflictingQualifiedNames {
  bool public x;

  constructor (bool _x) {
    x = _x;
  }

  function set(bool _y) public {
    x = _y;
  }
}