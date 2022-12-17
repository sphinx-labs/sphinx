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
  {
    network: 'arbitrum-goerli',
    chainId: 421613,
    urls: {
      apiURL: 'https://api-goerli.arbiscan.io/api',
      browserURL: 'https://goerli.arbiscan.io/',
    },
  },
]

export const etherscanApiKey = process.env.ETHERSCAN_API_KEY
