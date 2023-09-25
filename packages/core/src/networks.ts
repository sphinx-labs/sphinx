// Warning: The constants in this file are commonly imported from the frontend of the Sphinx Managed website.
// Be careful when importing external dependencies to this file because they may cause issues when this file
// is imported by the website.

export type SupportedLocalNetworkName = 'anvil' | 'hardhat'

// TODO(md): update these
export type SupportedMainnetNetworkName =
  | 'ethereum'
  | 'optimism'
  | 'arbitrum'
  | 'polygon'
  | 'bnb'
  | 'gnosis'
  | 'linea'
  | 'polygon_zkevm'
  | 'avalanche'
  | 'fantom'
  | 'base'
export type SupportedTestnetNetworkName =
  | 'goerli'
  | 'optimism_goerli'
  | 'arbitrum_goerli'
  | 'polygon_mumbai'
  | 'bnb_testnet'
  | 'gnosis_chiado'
  | 'linea_goerli'
  | 'polygon_zkevm_goerli'
  | 'avalanche_fuji'
  | 'fantom_testnet'
  | 'base_goerli'

export type SupportedNetworkName =
  | SupportedMainnetNetworkName
  | SupportedTestnetNetworkName
  | SupportedLocalNetworkName

// Maps a live network name to its chain ID. Does not include testnets.
export const SUPPORTED_MAINNETS: Record<
  SupportedMainnetNetworkName,
  SupportedMainnetChainId
> = {
  ethereum: 1,
  optimism: 10,
  arbitrum: 42161,
  polygon: 137,
  bnb: 56,
  gnosis: 100,
  linea: 59144,
  polygon_zkevm: 1101,
  avalanche: 43114,
  fantom: 250,
  base: 8453,
}

// TODO(post-foundry): are you supporting hardhat? if not, c/f hardhat.

export const SUPPORTED_LOCAL_NETWORKS: Record<
  SupportedLocalNetworkName,
  SupportedLocalChainId
> = {
  anvil: 31337,
  hardhat: 31337,
}

export const SUPPORTED_TESTNETS: Record<
  SupportedTestnetNetworkName,
  SupportedTestnetChainId
> = {
  goerli: 5,
  optimism_goerli: 420,
  arbitrum_goerli: 421613,
  polygon_mumbai: 80001,
  bnb_testnet: 97,
  gnosis_chiado: 10200,
  linea_goerli: 59140,
  polygon_zkevm_goerli: 1442,
  avalanche_fuji: 43113,
  fantom_testnet: 4002,
  base_goerli: 84531,
}
export const SUPPORTED_NETWORKS = {
  ...SUPPORTED_MAINNETS,
  ...SUPPORTED_TESTNETS,
  ...SUPPORTED_LOCAL_NETWORKS,
}

// Used when it's necessary to enumerate the ids of supported networks.
export const supportedMainnetIds = Object.values(SUPPORTED_MAINNETS)
export const supportedTestnetIds = Object.values(SUPPORTED_TESTNETS)

export type SupportedLocalChainId = 31337

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
  | 8453
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
  | 84531
export type SupportedChainId =
  | SupportedMainnetChainId
  | SupportedTestnetChainId
  | SupportedLocalChainId

export const MinimumWalletBalanceTestnets = {
  goerli: '0.15',
  'optimism-goerli': '0.15',
  'arbitrum-goerli': '0.15',
  bnbt: '0.15',
  maticmum: '0.15',
  'gnosis-chiado': '0.15',
  'linea-goerli': '0.15',
  'polygon-zkevm-goerli': '0.15',
  'avalanche-fuji': '1',
  'fantom-testnet': '1',
  'base-goerli': '0.15',
}

export const MinimumWalletBalanceMainnets = {
  ethereum: '.05',
  optimism: '.025',
  arbitrum: '.025',
  matic: '1',
  bnb: '.05',
  xdai: '1',
  linea: '0.025',
  'polygon-zkevm': '0.025',
  avalanche: '1',
  fantom: '1',
  base: '0.025',
}

export const MinimumWalletBalance = {
  ...MinimumWalletBalanceTestnets,
  ...MinimumWalletBalanceMainnets,
}

// Maps a chain ID to the USDC address on the network.
export const USDC_ADDRESSES: { [chainId: string]: string } = {
  // Optimism Goerli:
  420: '0x7E07E15D2a87A24492740D16f5bdF58c16db0c4E',
  // Optimism Mainnet:
  10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
}

export const fetchCurrencyForNetwork = (chainId: number) => {
  switch (chainId) {
    // mainnet
    case 1:
      return 'ETH'
    // goerli
    case 5:
      return 'ETH'
    // optimism
    case 10:
      return 'ETH'
    // optimism goerli
    case 420:
      return 'ETH'
    // arbitrum
    case 42161:
      return 'ETH'
    // arbitrum goerli
    case 421613:
      return 'ETH'
    // BNB
    case 56:
      return 'BNB'
    // BNB testnet
    case 97:
      return 'BNB'
    // Gnosis
    case 100:
      return 'xDAI'
    // Chiado
    case 10200:
      return 'xDAI'
    // Polygon
    case 137:
      return 'MATIC'
    // Polygon Mumbai
    case 80001:
      return 'MATIC'
    // Polygon zkEVM Testnet
    case 1101:
      return 'ETH'
    // Polygon zkEVM Mainnet
    case 1442:
      return 'ETH'
    // Linea Mainnet
    case 59144:
      return 'ETH'
    // Linea Testnet
    case 59140:
      return 'ETH'
    case 4002:
      return 'FTM'
    case 250:
      return 'FTM'
    case 43113:
      return 'AVAX'
    case 43114:
      return 'AVAX'
    case 8453:
      return 'ETH'
    case 84531:
      return 'ETH'
    default:
      throw new Error('Unsupported network')
  }
}

export const fetchURLForNetwork = (chainId: number) => {
  if (process.env.RUNNING_LOCALLY === 'true') {
    return `http://127.0.0.1:${42000 + (chainId % 1000)}`
  }

  if (!process.env.ALCHEMY_API_KEY) {
    throw new Error('ALCHEMY_API_KEY key not defined')
  }
  switch (chainId) {
    // mainnet
    case 1:
      return `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    // goerli
    case 5:
      return `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    // optimism
    case 10:
      return `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    // optimism goerli
    case 420:
      return `https://opt-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    // arbitrum goerli
    case 421613:
      return `https://arb-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    // arbitrum mainnet
    case 42161:
      return `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    // bnbt
    case 97:
      if (!process.env.BNB_TESTNET_URL) {
        throw new Error('BNB_TESTNET_URL key not defined')
      }
      return process.env.BNB_TESTNET_URL
    case 56:
      if (!process.env.BNB_MAINNET_URL) {
        throw new Error('BNB_MAINNET_URL key not defined')
      }
      return process.env.BNB_MAINNET_URL
    // gnosis chiado
    case 10200:
      if (!process.env.CHIADO_RPC_URL) {
        throw new Error('CHIADO_RPC_URL key not defined')
      }
      return process.env.CHIADO_RPC_URL
    case 100:
      if (!process.env.GNOSIS_MAINNET_URL) {
        throw new Error('GNOSIS_MAINNET_URL key not defined')
      }
      return process.env.GNOSIS_MAINNET_URL
    // polygon mumbai
    case 80001:
      return `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    case 137:
      return `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    case 1101:
      if (!process.env.POLYGON_ZKEVM_MAINNET_URL) {
        throw new Error('POLYGON_ZKEVM_MAINNET_URL key not defined')
      }
      return process.env.POLYGON_ZKEVM_MAINNET_URL
    case 1442:
      if (!process.env.POLYGON_ZKEVM_TESTNET_URL) {
        throw new Error('POLYGON_ZKEVM_TESTNET_URL key not defined')
      }
      return process.env.POLYGON_ZKEVM_TESTNET_URL
    case 59144:
      return `https://linea-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
    case 59140:
      return `https://linea-goerli.infura.io/v3/${process.env.INFURA_API_KEY}`
    case 4002:
      if (!process.env.FANTOM_TESTNET_RPC_URL) {
        throw new Error('FANTOM_TESTNET_RPC_URL key not defined')
      }
      return process.env.FANTOM_TESTNET_RPC_URL
    case 250:
      if (!process.env.FANTOM_MAINNET_RPC_URL) {
        throw new Error('FANTOM_MAINNET_RPC_URL key not defined')
      }
      return process.env.FANTOM_MAINNET_RPC_URL
    case 43113:
      return `https://avalanche-fuji.infura.io/v3/${process.env.INFURA_API_KEY}`
    case 43114:
      return `https://avalanche-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
    case 8453:
      if (!process.env.BASE_MAINNET_URL) {
        throw new Error('BASE_MAINNET_URL key not defined')
      }
      return process.env.BASE_MAINNET_URL
    case 84531:
      if (!process.env.BASE_GOERLI_URL) {
        throw new Error('BASE_GOERLI_URL key not defined')
      }
      return process.env.BASE_GOERLI_URL
    default:
      throw new Error(`Unsupported chain for id ${chainId}`)
  }
}
