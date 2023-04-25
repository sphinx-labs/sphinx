// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title IGasPriceCalculator
 */
interface IGasPriceCalculator {
    function getGasPrice() external view returns (uint256);
}
