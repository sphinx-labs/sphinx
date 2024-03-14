import {
  AccountAccess,
  AccountAccessKind,
  DeployedContractSize,
  ParsedAccountAccess,
} from './types'

/**
 * Calculates the storage used by a single AccountAccess. This function is intentionally very simple.
 * We naively assume that every write takes up a full 32 bytes of storage despite the fact that there
 * are many cases where the storage usage is less or even negative. We do this because we prefer to
 * always overestimate the cost by a reasonable amount. Since the block gas limit on Moonbeam and
 * related networks is comfortably high (15 million), this does not impede the users ability to deploy
 * large contracts.
 */
const calculateStorageSizeForAccountAccess = (
  access: AccountAccess,
  deployedContractSizes: DeployedContractSize[]
): { contractStorageSize: number; writeStorageSize: number } => {
  const storageWriteSize =
    access.storageAccesses.filter((storageAccess) => storageAccess.isWrite)
      .length * 32

  if (access.kind === AccountAccessKind.Create) {
    const deployedContractSize = deployedContractSizes.find(
      (deployedContact) => deployedContact.account === access.account
    )

    if (!deployedContractSize) {
      throw new Error(
        'Failed to find deployed contract size. This is a bug, please report it to the developers.'
      )
    }

    return {
      writeStorageSize: storageWriteSize,
      contractStorageSize: Number(deployedContractSize.size),
    }
  } else {
    return {
      writeStorageSize: storageWriteSize,
      contractStorageSize: 0,
    }
  }
}

/**
 * Calculates the cost of a transaction on Moonbeam using their higher gas cost per byte.
 *
 * @param baseGas The estimated gas cost according to Foundry.
 * @param deployedContractSizes The sizes of any contracts deployed during this transaction.
 * @param access The ParsedAccountAccess for the transaction.
 * @returns
 */
export const calculateActionLeafGasForMoonbeam = (
  foundryGas: string,
  deployedContractSizes: DeployedContractSize[],
  access: ParsedAccountAccess
): string => {
  // Fetch the storage used by the root account access
  const { contractStorageSize, writeStorageSize } =
    calculateStorageSizeForAccountAccess(access.root, deployedContractSizes)

  // Fetch the storage used by all the nested accesses
  const nestedStorageSizes = access.nested.map((nestedAccountAccess) =>
    calculateStorageSizeForAccountAccess(
      nestedAccountAccess,
      deployedContractSizes
    )
  )
  const nestedContractStorageSize = nestedStorageSizes
    .map((storageSize) => storageSize.contractStorageSize)
    .reduce((prev, curr) => prev + curr, 0)
  const nestedWriteStorageSize = nestedStorageSizes
    .map((storageSize) => storageSize.writeStorageSize)
    .reduce((prev, curr) => prev + curr, 0)

  // Calculate the total storage for the full transaction
  const totalContractSize = contractStorageSize + nestedContractStorageSize
  const totalWriteStorageSize = writeStorageSize + nestedWriteStorageSize

  // Gas per byte ratio = Block Gas Limit / (Block Storage Limit (kb) * 1024 Bytes)
  const ratio = 15_000_000 / (40 * 1024)

  // Total gas cost for storage on moonbeam
  // The ratio isn't an exact integer, so we round the result up
  const moonbeamStorageCost = Math.ceil(
    (totalContractSize + totalWriteStorageSize) * ratio
  )

  /**
   * The final cost is cost estimated by Foundry + the cost of the storage required for
   * the deployment on Moonbeam.
   * Note that this is a very naive estimate because we are using the maximum possible
   * storage cost, and we are assuming the storage cost in Moonbeam is in addition to
   * the normal 200 gas included for storage of contracts on Ethereum.
   * In practice, this means we will probably wildly overestimate the gas cost for large
   * contracts which may limit what the user is able to deploy on Moonbeam and related
   * networks.
   */
  return (BigInt(foundryGas) + BigInt(moonbeamStorageCost)).toString()
}

export type ExplorerName = 'Blockscout' | 'Etherscan'

export type BlockExplorers = {
  etherscan?: {
    apiURL: string
    browserURL: string
    envKey: string
  }
  blockscout?: {
    apiURL: string
    browserURL: string
    envKey: string
    selfHosted: boolean
  }
}

export type SupportedNetwork = {
  name: string
  displayName: string
  chainId: bigint
  rpcUrl: () => string
  blockexplorers: BlockExplorers
  currency: string
  dripSize: string
  requiredEnvVariables: Array<string>
  networkType: NetworkType
  dripVersion: number
  decimals: number
  queryFilterBlockLimit: number
  legacyTx: boolean
  actionGasLimitBuffer: boolean
  useHigherMaxGasLimit: boolean
  eip2028: boolean
  rollupStack?: {
    provider: RollupProvider
    type: RollupType
  }
  handleNetworkSpecificMerkleLeafGas?: (
    foundryGas: string,
    deployedContractSizes: DeployedContractSize[],
    access: ParsedAccountAccess
  ) => string
}

export type SupportedLocalNetwork = {
  name: string
  chainId: bigint
  networkType: NetworkType
  legacyTx: false
  actionGasLimitBuffer: false
  useHigherMaxGasLimit: false
  eip2028: true
  dripSize: string
  currency: string
}

export const SPHINX_LOCAL_NETWORKS: Array<SupportedLocalNetwork> = [
  {
    name: 'anvil',
    chainId: BigInt(31337),
    networkType: 'Local',
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
    dripSize: '1',
    currency: 'ETH',
  },
]

export type NetworkType = 'Testnet' | 'Mainnet' | 'Local'
type RollupProvider = 'Conduit' | 'Caldera'
type RollupType = 'OP Stack' | 'Arbitrum'

export const SPHINX_NETWORKS: Array<SupportedNetwork> = [
  {
    name: 'ethereum',
    displayName: 'Ethereum',
    chainId: BigInt(1),
    rpcUrl: () =>
      `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.etherscan.io/api',
        browserURL: 'https://etherscan.io',
        envKey: 'ETH_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://eth.blockscout.com/api',
        browserURL: 'https://eth.blockscout.com/',
        envKey: 'ETH_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'sepolia',
    displayName: 'Sepolia',
    chainId: BigInt(11155111),
    rpcUrl: () =>
      `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-sepolia.etherscan.io/api',
        browserURL: 'https://sepolia.etherscan.io',
        envKey: 'ETH_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://eth-sepolia.blockscout.com/api',
        browserURL: 'https://eth-sepolia.blockscout.com/',
        envKey: 'ETH_SEPOLIA_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'optimism',
    displayName: 'Optimism',
    chainId: BigInt(10),
    rpcUrl: () =>
      `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-optimistic.etherscan.io/api',
        browserURL: 'https://optimistic.etherscan.io/',
        envKey: 'OPT_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://optimism.blockscout.com/api',
        browserURL: 'https://optimism.blockscout.com/',
        envKey: 'OPT_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'optimism_sepolia',
    displayName: 'Optimism Sepolia',
    chainId: BigInt(11155420),
    rpcUrl: () =>
      `https://opt-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-sepolia-optimism.etherscan.io/api',
        browserURL: 'https://sepolia-optimism.etherscan.io/',
        envKey: 'OPT_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://optimism-sepolia.blockscout.com/api',
        browserURL: 'https://optimism-sepolia.blockscout.com/',
        envKey: 'OPT_SEPOLIA_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'arbitrum',
    displayName: 'Arbitrum',
    chainId: BigInt(42161),
    rpcUrl: () =>
      `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.arbiscan.io/api',
        browserURL: 'https://arbiscan.io/',
        envKey: 'ARB_ETHERSCAN_API_KEY',
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'arbitrum_sepolia',
    displayName: 'Arbitrum Sepolia',
    chainId: BigInt(421614),
    rpcUrl: () =>
      `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-sepolia.arbiscan.io/api',
        browserURL: 'https://sepolia.arbiscan.io/',
        envKey: 'ARB_ETHERSCAN_API_KEY',
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'polygon',
    displayName: 'Polygon',
    chainId: BigInt(137),
    rpcUrl: () =>
      `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.polygonscan.com/api',
        browserURL: 'https://polygonscan.com',
        envKey: 'POLYGON_ETHERSCAN_API_KEY',
      },
    },
    currency: 'MATIC',
    dripSize: '1',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'polygon_mumbai',
    displayName: 'Polygon Mumbai',
    chainId: BigInt(80001),
    rpcUrl: () =>
      `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-testnet.polygonscan.com/api',
        browserURL: 'https://mumbai.polygonscan.com/',
        envKey: 'POLYGON_ETHERSCAN_API_KEY',
      },
    },
    currency: 'MATIC',
    dripSize: '1',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'bnb',
    displayName: 'Binance Smart Chain',
    chainId: BigInt(56),
    rpcUrl: () => process.env.BNB_MAINNET_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.bscscan.com/api',
        browserURL: 'https://bscscan.com',
        envKey: 'BNB_ETHERSCAN_API_KEY',
      },
    },
    currency: 'BNB',
    dripSize: '0.05',
    requiredEnvVariables: ['BNB_MAINNET_URL'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'bnb_testnet',
    displayName: 'Binance Smart Chain Testnet',
    chainId: BigInt(97),
    rpcUrl: () => process.env.BNB_TESTNET_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-testnet.bscscan.com/api',
        browserURL: 'https://testnet.bscscan.com',
        envKey: 'BNB_ETHERSCAN_API_KEY',
      },
    },
    currency: 'BNB',
    dripSize: '0.15',
    requiredEnvVariables: ['BNB_TESTNET_URL'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'gnosis',
    displayName: 'Gnosis',
    chainId: BigInt(100),
    rpcUrl: () => process.env.GNOSIS_MAINNET_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.gnosisscan.io/api',
        browserURL: 'https://gnosisscan.io',
        envKey: 'GNOSIS_MAINNET_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://gnosis-chiado.blockscout.com/api',
        browserURL: 'https://gnosis-chiado.blockscout.com/',
        envKey: 'GNOSIS_MAINNET_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'xDAI',
    dripSize: '1',
    requiredEnvVariables: ['GNOSIS_MAINNET_URL'],
    networkType: 'Mainnet',
    dripVersion: 2,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'gnosis_chiado',
    displayName: 'Gnosis Chiado',
    chainId: BigInt(10200),
    rpcUrl: () => process.env.CHIADO_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://gnosis-chiado.blockscout.com/api',
        browserURL: 'https://gnosis-chiado.blockscout.com',
        envKey: 'GNOSIS_CHIADO_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'xDAI',
    dripSize: '0.15',
    requiredEnvVariables: ['CHIADO_RPC_URL'],
    networkType: 'Testnet',
    dripVersion: 2,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'linea',
    displayName: 'Linea',
    chainId: BigInt(59144),
    rpcUrl: () =>
      `https://linea-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.lineascan.build/api',
        browserURL: 'https://lineascan.build',
        envKey: 'LINEA_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://explorer.goerli.linea.build/api',
        browserURL: 'https://explorer.goerli.linea.build/',
        // key is not required on this network
        envKey: 'LINEA_BLOCKSCOUT_API_KEY',
        selfHosted: true,
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    requiredEnvVariables: ['INFURA_API_KEY'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'linea_goerli',
    displayName: 'Linea Goerli',
    chainId: BigInt(59140),
    rpcUrl: () =>
      `https://linea-goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-goerli.lineascan.build/api',
        browserURL: 'https://goerli.lineascan.build',
        envKey: 'LINEA_ETHERSCAN_API_KEY',
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    requiredEnvVariables: ['INFURA_API_KEY'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'polygon_zkevm',
    displayName: 'Polygon zkEVM',
    chainId: BigInt(1101),
    rpcUrl: () => process.env.POLYGON_ZKEVM_MAINNET_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-zkevm.polygonscan.com/api',
        browserURL: 'https://zkevm.polygonscan.com/',
        envKey: 'POLYGON_ZKEVM_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://zkevm.blockscout.com/api',
        browserURL: 'https://zkevm.blockscout.com/',
        // key is not required on this network
        envKey: 'POLYGON_ZKEVM_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    requiredEnvVariables: ['POLYGON_ZKEVM_MAINNET_URL'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'polygon_zkevm_goerli',
    displayName: 'Polygon zkEVM Goerli',
    chainId: BigInt(1442),
    rpcUrl: () => process.env.POLYGON_ZKEVM_TESTNET_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-testnet-zkevm.polygonscan.com/api',
        browserURL: 'https://testnet-zkevm.polygonscan.com',
        envKey: 'POLYGON_ZKEVM_ETHERSCAN_API_KEY',
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    requiredEnvVariables: ['POLYGON_ZKEVM_TESTNET_URL'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'avalanche',
    displayName: 'Avalanche',
    chainId: BigInt(43114),
    rpcUrl: () =>
      `https://avalanche-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.snowtrace.io/api',
        browserURL: 'https://snowtrace.io/',
        envKey: 'AVAX_ETHERSCAN_API_KEY',
      },
    },
    currency: 'AVAX',
    dripSize: '1',
    requiredEnvVariables: ['INFURA_API_KEY'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'avalanche_fuji',
    displayName: 'Avalanche Fuji',
    chainId: BigInt(43113),
    rpcUrl: () =>
      `https://avalanche-fuji.infura.io/v3/${process.env.INFURA_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-testnet.snowtrace.io/api',
        browserURL: 'https://testnet.snowtrace.io/',
        envKey: 'AVAX_ETHERSCAN_API_KEY',
      },
    },
    currency: 'AVAX',
    dripSize: '1',
    requiredEnvVariables: ['INFURA_API_KEY'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'fantom',
    displayName: 'Fantom',
    chainId: BigInt(250),
    rpcUrl: () => process.env.FANTOM_MAINNET_RPC_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.ftmscan.com/api',
        browserURL: 'https://ftmscan.com',
        envKey: 'FANTOM_ETHERSCAN_API_KEY',
      },
    },
    currency: 'FTM',
    dripSize: '1',
    requiredEnvVariables: ['FANTOM_MAINNET_RPC_URL'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'fantom_testnet',
    displayName: 'Fantom Testnet',
    chainId: BigInt(4002),
    rpcUrl: () => process.env.FANTOM_TESTNET_RPC_URL!,
    blockexplorers: {},
    currency: 'FTM',
    dripSize: '1',
    requiredEnvVariables: ['FANTOM_TESTNET_RPC_URL'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'base',
    displayName: 'Base',
    chainId: BigInt(8453),
    rpcUrl: () =>
      `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.basescan.org/api',
        browserURL: 'https://basescan.org/',
        envKey: 'BASE_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://base.blockscout.com/api',
        browserURL: 'https://base.blockscout.com/',
        envKey: 'BASE_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'base_sepolia',
    displayName: 'Base Sepolia',
    chainId: BigInt(84532),
    rpcUrl: () =>
      `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-sepolia.basescan.org/',
        browserURL: 'https://sepolia.basescan.org/',
        envKey: 'BASE_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://base-sepolia.blockscout.com/api',
        browserURL: 'https://base-sepolia.blockscout.com/',
        envKey: 'BASE_SEPOLIA_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    requiredEnvVariables: ['ALCHEMY_API_KEY'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'celo',
    displayName: 'Celo',
    chainId: BigInt(42220),
    rpcUrl: () =>
      `https://celo-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.celoscan.io/api',
        browserURL: 'https://celoscan.io/',
        envKey: 'CELO_ETHERSCAN_API_KEY',
      },
    },
    currency: 'CELO',
    dripSize: '1',
    requiredEnvVariables: ['INFURA_API_KEY'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'celo_alfajores',
    displayName: 'Celo Alfajores',
    chainId: BigInt(44787),
    rpcUrl: () =>
      `https://celo-alfajores.infura.io/v3/${process.env.INFURA_API_KEY}`,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-alfajores.celoscan.io/api',
        browserURL: 'https://alfajores.celoscan.io/',
        envKey: 'CELO_ETHERSCAN_API_KEY',
      },
    },
    currency: 'CELO',
    dripSize: '0.15',
    requiredEnvVariables: ['INFURA_API_KEY'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'moonriver',
    displayName: 'Moonriver',
    chainId: BigInt(1285),
    rpcUrl: () => process.env.MOONRIVER_RPC_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-moonriver.moonscan.io/api',
        browserURL: 'https://moonriver.moonscan.io',
        envKey: 'MOONRIVER_ETHERSCAN_API_KEY',
      },
    },
    currency: 'MOVR',
    dripSize: '0.15',
    requiredEnvVariables: ['MOONRIVER_RPC_URL'],
    queryFilterBlockLimit: 500,
    dripVersion: 1,
    networkType: 'Mainnet',
    decimals: 18,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: true,
    eip2028: true,
    handleNetworkSpecificMerkleLeafGas: calculateActionLeafGasForMoonbeam,
  },
  {
    name: 'moonbeam',
    displayName: 'Moonbeam',
    chainId: BigInt(1284),
    rpcUrl: () => process.env.MOONBEAM_RPC_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-moonbeam.moonscan.io/api',
        browserURL: 'https://moonbeam.moonscan.io',
        envKey: 'MOONBEAM_ETHERSCAN_API_KEY',
      },
    },
    currency: 'GLMR',
    dripSize: '1',
    requiredEnvVariables: ['MOONBEAM_RPC_URL'],
    queryFilterBlockLimit: 500,
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: true,
    eip2028: true,
    handleNetworkSpecificMerkleLeafGas: calculateActionLeafGasForMoonbeam,
  },
  {
    name: 'moonbase_alpha',
    displayName: 'Moonbase Alpha',
    chainId: BigInt(1287),
    rpcUrl: () => process.env.MOONBASE_ALPHA_RPC_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-moonbase.moonscan.io/api',
        browserURL: 'https://moonbase.moonscan.io/',
        envKey: 'MOONBEAM_ETHERSCAN_API_KEY',
      },
    },
    currency: 'GLMR',
    dripSize: '0.05',
    requiredEnvVariables: ['MOONBASE_ALPHA_RPC_URL'],
    queryFilterBlockLimit: 500,
    networkType: 'Testnet',
    dripVersion: 2,
    decimals: 18,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: true,
    eip2028: true,
    handleNetworkSpecificMerkleLeafGas: calculateActionLeafGasForMoonbeam,
  },
  {
    name: 'fuse',
    displayName: 'Fuse',
    chainId: BigInt(122),
    rpcUrl: () => process.env.FUSE_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://explorer.fuse.io/api',
        browserURL: 'https://explorer.fuse.io',
        envKey: 'FUSE_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'FUSE',
    dripSize: '1',
    requiredEnvVariables: ['FUSE_RPC_URL'],
    networkType: 'Mainnet',
    dripVersion: 1,
    legacyTx: true,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'evmos',
    displayName: 'Evmos',
    chainId: BigInt(9001),
    rpcUrl: () => process.env.EVMOS_RPC_URL!,
    blockexplorers: {},
    currency: 'EVMOS',
    dripSize: '1',
    requiredEnvVariables: ['EVMOS_RPC_URL'],
    dripVersion: 1,
    networkType: 'Mainnet',
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'evmos_testnet',
    displayName: 'Evmos Testnet',
    chainId: BigInt(9000),
    rpcUrl: () => process.env.EVMOS_TESTNET_RPC_URL!,
    blockexplorers: {},
    currency: 'EVMOS',
    dripSize: '0.015',
    requiredEnvVariables: ['EVMOS_TESTNET_RPC_URL'],
    networkType: 'Testnet',
    dripVersion: 2,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'kava',
    displayName: 'Kava',
    chainId: BigInt(2222),
    rpcUrl: () => process.env.KAVA_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://kavascan.com/api',
        browserURL: 'https://kavascan.com',
        // key is not required on this network
        envKey: 'KAVA_ETHERSCAN_API_KEY',
        selfHosted: true,
      },
    },
    currency: 'KAVA',
    dripSize: '1',
    requiredEnvVariables: ['KAVA_RPC_URL'],
    dripVersion: 1,
    networkType: 'Mainnet',
    legacyTx: true,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'kava_testnet',
    displayName: 'Kava Testnet',
    chainId: BigInt(2221),
    rpcUrl: () => process.env.KAVA_TESTNET_RPC_URL!,
    blockexplorers: {},
    currency: 'KAVA',
    dripSize: '1',
    requiredEnvVariables: ['KAVA_TESTNET_RPC_URL'],
    networkType: 'Testnet',
    dripVersion: 1,
    legacyTx: true,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'oktc',
    displayName: 'OKT Chain',
    chainId: BigInt(66),
    rpcUrl: () => process.env.OKTC_RPC_URL!,
    blockexplorers: {},
    currency: 'OKT',
    dripSize: '1',
    requiredEnvVariables: ['OKTC_RPC_URL'],
    dripVersion: 2,
    queryFilterBlockLimit: 500,
    networkType: 'Mainnet',
    legacyTx: true,
    decimals: 18,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
  },
  {
    name: 'scroll',
    displayName: 'Scroll',
    chainId: BigInt(534352),
    rpcUrl: () => process.env.SCROLL_RPC_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.scrollscan.com/api',
        browserURL: 'https://scrollscan.com/',
        envKey: 'SCROLL_ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://blockscout.scroll.io/api',
        browserURL: 'https://blockscout.scroll.io/api',
        // key is not required on this network
        envKey: 'SCROLL_BLOCKSCOUT_API_KEY',
        selfHosted: true,
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    requiredEnvVariables: ['SCROLL_RPC_URL'],
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: true,
    eip2028: true,
  },
  {
    name: 'scroll_sepolia',
    displayName: 'Scroll Sepolia',
    chainId: BigInt(534351),
    rpcUrl: () => process.env.SCROLL_TESTNET_RPC_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-sepolia.scrollscan.com/api',
        browserURL: 'https://sepolia.scrollscan.com/',
        envKey: 'SCROLL_ETHERSCAN_API_KEY',
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    requiredEnvVariables: ['SCROLL_TESTNET_RPC_URL'],
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: true,
    eip2028: true,
  },
  {
    name: 'rootstock',
    displayName: 'Rootstock',
    chainId: BigInt(30),
    rpcUrl: () => process.env.ROOTSTOCK_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://rootstock.blockscout.com/api',
        browserURL: 'https://rootstock.blockscout.com/',
        envKey: 'ROOTSTOCK_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'RBTC',
    dripSize: '0.001',
    requiredEnvVariables: ['ROOTSTOCK_RPC_URL'],
    dripVersion: 3,
    networkType: 'Mainnet',
    legacyTx: true,
    decimals: 8,
    queryFilterBlockLimit: 2000,
    actionGasLimitBuffer: true,
    useHigherMaxGasLimit: true,
    eip2028: false,
  },
  {
    name: 'rootstock_testnet',
    displayName: 'Rootstock Testnet',
    chainId: BigInt(31),
    rpcUrl: () => process.env.ROOTSTOCK_TESTNET_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://rootstock-testnet.blockscout.com/api',
        browserURL: 'https://rootstock-testnet.blockscout.com/',
        envKey: 'ROOTSTOCK_TESTNET_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'RBTC',
    dripSize: '0.001',
    requiredEnvVariables: ['ROOTSTOCK_TESTNET_RPC_URL'],
    dripVersion: 3,
    networkType: 'Testnet',
    legacyTx: true,
    decimals: 8,
    queryFilterBlockLimit: 2000,
    actionGasLimitBuffer: true,
    useHigherMaxGasLimit: true,
    eip2028: false,
  },
  {
    name: 'zora',
    displayName: 'Zora',
    chainId: BigInt(7777777),
    rpcUrl: () => process.env.ZORA_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://explorer.zora.energy/api',
        browserURL: 'https://explorer.zora.energy/',
        // key is not necessary on this network
        envKey: 'ZORA_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
    requiredEnvVariables: ['ZORA_RPC_URL'],
    rollupStack: {
      provider: 'Conduit',
      type: 'OP Stack',
    },
  },
  {
    name: 'zora_sepolia',
    displayName: 'Zora Sepolia',
    chainId: BigInt(999999999),
    rpcUrl: () => process.env.ZORA_SEPOLIA_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://sepolia.explorer.zora.energy/api',
        browserURL: 'https://sepolia.explorer.zora.energy/',
        // key is not necessary on this network
        envKey: 'ZORA_SEPOLIA_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
    requiredEnvVariables: ['ZORA_SEPOLIA_RPC_URL'],
    rollupStack: {
      provider: 'Conduit',
      type: 'OP Stack',
    },
  },
  {
    name: 'rari',
    displayName: 'RARI',
    chainId: BigInt(1380012617),
    rpcUrl: () => process.env.RARI_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://mainnet.explorer.rarichain.org/api',
        browserURL: 'https://mainnet.explorer.rarichain.org/',
        // key is not necessary on this network
        envKey: 'RARI_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
    requiredEnvVariables: ['RARI_RPC_URL'],
    rollupStack: {
      provider: 'Caldera',
      type: 'Arbitrum',
    },
  },
  {
    name: 'rari_sepolia',
    displayName: 'RARI Sepolia',
    chainId: BigInt(1918988905),
    rpcUrl: () => process.env.RARI_SEPOLIA_RPC_URL!,
    blockexplorers: {
      blockscout: {
        apiURL: 'https://explorer.rarichain.org/api',
        browserURL: 'https://explorer.rarichain.org/',
        // key is not necessary on this network
        envKey: 'RARI_SEPOLIA_BLOCKSCOUT_API_KEY',
        selfHosted: false,
      },
    },
    currency: 'ETH',
    dripSize: '0.15',
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
    requiredEnvVariables: ['RARI_SEPOLIA_RPC_URL'],
    rollupStack: {
      provider: 'Caldera',
      type: 'Arbitrum',
    },
  },
  {
    name: 'blast_sepolia',
    displayName: 'Blast Sepolia',
    chainId: BigInt(168587773),
    rpcUrl: () => process.env.BLAST_SEPOLIA_RPC_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api-sepolia.blastscan.io/api',
        browserURL: 'https://sepolia.blastscan.io/',
        envKey: 'BLAST_ETHERSCAN_API_KEY',
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    networkType: 'Testnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
    requiredEnvVariables: ['BLAST_SEPOLIA_RPC_URL'],
  },
  {
    name: 'blast',
    displayName: 'Blast',
    chainId: BigInt(81457),
    rpcUrl: () => process.env.BLAST_MAINNET_RPC_URL!,
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.blastscan.io/api',
        browserURL: 'https://blastscan.io/',
        envKey: 'BLAST_ETHERSCAN_API_KEY',
      },
    },
    currency: 'ETH',
    dripSize: '0.025',
    networkType: 'Mainnet',
    dripVersion: 1,
    decimals: 18,
    queryFilterBlockLimit: 2000,
    legacyTx: false,
    actionGasLimitBuffer: false,
    useHigherMaxGasLimit: false,
    eip2028: true,
    requiredEnvVariables: ['BLAST_MAINNET_RPC_URL'],
  },
]
