export enum ExecutorSelectionStrategy {
  // TODO: Fill this in once we know the address
  SIMPLE_LOCK = '0x0000000000000000000000000000000000000000',
}

// Array of custom chains for Etherscan verification. Each array element must be in the following
// format:
// https://hardhat.org/hardhat-runner/plugins/nomiclabs-hardhat-etherscan#adding-support-for-other-networks
export const customChains = []

export const etherscanApiKey = process.env.ETHERSCAN_API_KEY
