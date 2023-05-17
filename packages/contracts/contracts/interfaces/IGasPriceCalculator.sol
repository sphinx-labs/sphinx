// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title IGasPriceCalculator
 * @notice Interface for a contract that calculates the gas price of a transaction. This is simply
   `tx.gasprice` on Ethereum and networks that have the same semantics for `tx.gasprice`. On other
   chains, however, a non-standard gas price may be used.
 */
interface IGasPriceCalculator {
    /**
     * @notice Returns the gas price of the current transaction.
     *
     * @return The gas price of the current transaction.
     */
    function getGasPrice() external view returns (uint256);
}
