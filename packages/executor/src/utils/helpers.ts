import { ethers } from 'ethers'

/**
 * Parses a comma-separated list of addresses into an array of addresses.
 *
 * @param strategy Comma-separated list of addresses.
 * @returns Array of addresses.
 */
export const parseStrategyString = (strategy: string): string[] => {
  return strategy.split(',').map((address) => {
    return ethers.utils.getAddress(address)
  })
}
