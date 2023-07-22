// Warning: The constants in this file are commonly imported from the frontend of the Sphinx Managed website.
// Be careful when importing external dependencies to this file because they may cause issues when this file
// is imported by the website.

type SupportedMainnetNetworkName = 'ethereum' | 'optimism' | 'arbitrum'
type SupportedTestnetNetworkName =
  | 'goerli'
  | 'optimism-goerli'
  | 'arbitrum-goerli'
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
}
export const SUPPORTED_TESTNETS: Record<
  SupportedTestnetNetworkName,
  SupportedTestnetChainId
> = {
  goerli: 5,
  'optimism-goerli': 420,
  'arbitrum-goerli': 421613,
  'gnosis-chiado': 10200,
}
export const SUPPORTED_NETWORKS = {
  ...SUPPORTED_MAINNETS,
  ...SUPPORTED_TESTNETS,
}

// Used when it's necessary to enumerate the ids of supported networks.
export const supportedMainnetIds = Object.values(SUPPORTED_MAINNETS)
export const supportedTestnetIds = Object.values(SUPPORTED_TESTNETS)

export type SupportedMainnetChainId = 1 | 10 | 42161
export type SupportedTestnetChainId = 5 | 420 | 10200 | 421613
export type SupportedChainId = SupportedMainnetChainId | SupportedTestnetChainId
