// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FunctionInputContract {
    // src: https://docs.soliditylang.org/en/latest/types.html
    function mapPure(
        uint256[] memory self,
        function(uint) external pure returns (uint) f
    ) external pure returns (uint256[] memory r) {
        r = new uint[](self.length);
        for (uint256 i = 0; i < self.length; i++) {
            r[i] = f(self[i]);
        }
    }
}
