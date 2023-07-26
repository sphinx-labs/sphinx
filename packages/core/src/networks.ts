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
type SupportedTestnetNetworkName =
  | 'goerli'
  | 'optimism-goerli'
  | 'arbitrum-goerli'
  | 'maticmum' // Polygon Mumbai
  | 'bnbt' // BNB Smart Chain testnet
  | 'gnosis-chiado'

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
}
export const SUPPORTED_NETWORKS = {
  ...SUPPORTED_MAINNETS,
  ...SUPPORTED_TESTNETS,
}

// Used when it's necessary to enumerate the ids of supported networks.
export const supportedMainnetIds = Object.values(SUPPORTED_MAINNETS)
export const supportedTestnetIds = Object.values(SUPPORTED_TESTNETS)

export type SupportedMainnetChainId = 1 | 10 | 42161 | 137 | 56 | 100
export type SupportedTestnetChainId = 5 | 420 | 80001 | 97 | 421613 | 10200
export type SupportedChainId = SupportedMainnetChainId | SupportedTestnetChainId
