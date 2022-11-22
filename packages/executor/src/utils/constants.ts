export enum ExecutorSelectionStrategy {
  // TODO: Fill this in once we know the address
  SIMPLE_LOCK = '0x0000000000000000000000000000000000000000',
}

export const customChains = [
  {
    network: 'optimisticGoerli',
    chainId: 420,
    urls: {
      apiURL: 'https://api-goerli-optimism.etherscan.io/api',
      browserURL: 'https://goerli-optimism.etherscan.io',
    },
  },
]

export const etherscanApiKey = {
  optimisticGoerli: process.env.OPT_ETHERSCAN_API_KEY
    ? process.env.OPT_ETHERSCAN_API_KEY
    : '',
  goerli: process.env.ETH_ETHERSCAN_API_KEY
    ? process.env.ETH_ETHERSCAN_API_KEY
    : '',
}
