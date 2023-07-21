/**
 * Warning: The constants in this file are commonly imported from the frontend of the Sphinx Managed website.
 * Be careful when importing external dependencies to this file because they may cause issues when this file
 * is imported by the website.
 */

// Maps a live network name to its chain ID. Does not include testnets.
export const SUPPORTED_MAINNETS: {
  [networkName: string]: SupportedMainnetChainId
} = {
  ethereum: 1,
  optimism: 10,
  arbitrum: 42161,
}
export const SUPPORTED_TESTNETS: {
  [networkName: string]: SupportedTestnetChainId
} = {
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

export const LAYERZERO_CHAIN_ID_TO_STANDARD_ID = {
  101: 1,
  111: 10,
  10121: 5,
  10132: 420,
  10143: 421613,
}

export const LAYERZERO_ADDRESSES: {
  [K in SupportedChainId]: {
    endpointAddress: string
    relayerV2Address: string
    lzChainId: number
  }
} = {
  1: {
    endpointAddress: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    relayerV2Address: '0x902F09715B6303d4173037652FA7377e5b98089E',
    lzChainId: 101,
  },
  10: {
    endpointAddress: '0x3c2269811836af69497E5F486A85D7316753cf62',
    relayerV2Address: '0x81E792e5a9003CC1C8BF5569A00f34b65d75b017',
    lzChainId: 111,
  },
  5: {
    endpointAddress: '0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23',
    relayerV2Address: '0xA658742d33ebd2ce2F0bdFf73515Aa797Fd161D9',
    lzChainId: 10121,
  },
  420: {
    endpointAddress: '0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1',
    relayerV2Address: '0x7F417F2192B89Cf93b8c4Ee01d558883A0AD7B47',
    lzChainId: 10132,
  },
  10200: {
    endpointAddress: '0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1',
    relayerV2Address: '0xb23b28012ee92E8dE39DEb57Af31722223034747',
    lzChainId: 10145,
  },
  421613: {
    endpointAddress: '0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab',
    relayerV2Address: '0x79c2127C2cF1c41cdd0E24e6Ba70b6F3308B7B79',
    lzChainId: 10143,
  },
  42161: {
    endpointAddress: '0x3c2269811836af69497E5F486A85D7316753cf62',
    relayerV2Address: '0x177d36dBE2271A4DdB2Ad8304d82628eb921d790',
    lzChainId: 110,
  },
}
