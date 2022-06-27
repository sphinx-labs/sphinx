// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library EthUtils {
    function getCodeSize(address _address) internal view returns (uint256) {
        uint256 sz;
        assembly {
            sz := extcodesize(_address)
        }
        return sz;
    }

    function hasCode(address _address) internal view returns (bool) {
        return getCodeSize(_address) > 0;
    }
}
