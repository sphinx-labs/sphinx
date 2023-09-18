// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { DefaultCreate3 } from "@sphinx-labs/contracts/contracts/DefaultCreate3.sol";

contract LocalSphinxManager is DefaultCreate3 {
    mapping(bytes32 => uint256) public callNonces;

    function setCallNonce(bytes32 _callHash, uint256 _nonce) external {
        callNonces[_callHash] = _nonce;
    }
}
