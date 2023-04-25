// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IGasPriceCalculator } from "./interfaces/IGasPriceCalculator.sol";

/**
 * @title DefaultGasPriceCalculator
 */
contract DefaultGasPriceCalculator is IGasPriceCalculator {
    function getGasPrice() external view returns (uint256) {
        return tx.gasprice;
    }
}
