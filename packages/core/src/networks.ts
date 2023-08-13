// Warning: The constants in this file are commonly imported from the frontend of the Sphinx Managed website.
// Be careful when importing external dependencies to this file because they may cause issues when this file
// is imported by the website.

type SupportedMainnetNetworkName =
  | 'ethereum'
  | 'optimism'
  | 'arbitrum'
  | 'matic' // Polygon
  | 'bnb'
  | 'xdai' // Gnosis
  | 'linea'
  | 'polygon-zkevm'
  | 'avalanche'
  | 'fantom'
type SupportedTestnetNetworkName =
  | 'goerli'
  | 'optimism-goerli'
  | 'arbitrum-goerli'
  | 'maticmum' // Polygon Mumbai
  | 'bnbt' // BNB Smart Chain testnet
  | 'gnosis-chiado'
  | 'linea-goerli'
  | 'polygon-zkevm-goerli'
  | 'avalanche-fuji'
  | 'fantom-testnet'

export type SupportedNetworkName =
  | SupportedMainnetNetworkName
  | SupportedTestnetNetworkName

// Maps a live network name to its chain ID. Does not include testnets.
export const SUPPORTED_MAINNETS: Record<
  SupportedMainnetNetworkName,
  SupportedMainnetChainId
> = {
  ethereum: 1,
  optimism: 10,
  arbitrum: 42161,
  matic: 137,
  bnb: 56,
  xdai: 100,
  linea: 59144,
  'polygon-zkevm': 1101,
  avalanche: 43114,
  fantom: 250,
}
export const SUPPORTED_TESTNETS: Record<
  SupportedTestnetNetworkName,
  SupportedTestnetChainId
> = {
  goerli: 5,
  'optimism-goerli': 420,
  'arbitrum-goerli': 421613,
  maticmum: 80001,
  bnbt: 97,
  'gnosis-chiado': 10200,
  'linea-goerli': 59140,
  'polygon-zkevm-goerli': 1442,
  'avalanche-fuji': 43113,
  'fantom-testnet': 4002,
}
export const SUPPORTED_NETWORKS = {
  ...SUPPORTED_MAINNETS,
  ...SUPPORTED_TESTNETS,
}

// Used when it's necessary to enumerate the ids of supported networks.
export const supportedMainnetIds = Object.values(SUPPORTED_MAINNETS)
export const supportedTestnetIds = Object.values(SUPPORTED_TESTNETS)

export type SupportedMainnetChainId =
  | 1
  | 10
  | 42161
  | 137
  | 56
  | 100
  | 59144
  | 1101
  | 43114
  | 250
export type SupportedTestnetChainId =
  | 5
  | 420
  | 80001
  | 97
  | 421613
  | 10200
  | 59140
  | 1442
  | 43113
  | 4002
export type SupportedChainId = SupportedMainnetChainId | SupportedTestnetChainId

// Maps a chain ID to the USDC address on the network.
export const USDC_ADDRESSES: { [chainId: string]: string } = {
  // Optimism Goerli:
  420: '0x7E07E15D2a87A24492740D16f5bdF58c16db0c4E',
  // Optimism Mainnet:
  10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
}
