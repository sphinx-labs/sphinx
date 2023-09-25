// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract FunctionInputContract {
    // src: https://docs.soliditylang.org/en/latest/types.html
    function mapPure(uint[] memory self, function (uint) external pure returns (uint) f)
        external
        pure
        returns (uint[] memory r)
    {
        r = new uint[](self.length);
        for (uint i = 0; i < self.length; i++) {
            r[i] = f(self[i]);
        }
    }
}
