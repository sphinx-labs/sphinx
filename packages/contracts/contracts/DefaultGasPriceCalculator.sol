// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IGasPriceCalculator } from "./interfaces/IGasPriceCalculator.sol";

/**
 * @title DefaultGasPriceCalculator
 * @notice Default implementation of the IGasPriceCalculator interface. This is used on Ethereum and
           networks that have the same semantics for `tx.gasprice`.
 */
contract DefaultGasPriceCalculator is IGasPriceCalculator {
    /**
     * @inheritdoc IGasPriceCalculator
     */
    function getGasPrice() external view returns (uint256) {
        return tx.gasprice;
    }
}
