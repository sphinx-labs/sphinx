/* eslint-disable @typescript-eslint/no-var-requires */
import '@nomicfoundation/hardhat-ethers'

import * as dotenv from 'dotenv'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment, HardhatUserConfig } from 'hardhat/types'
import { Logger } from '@eth-optimism/common-ts'

import { isHttpNetworkConfig } from './src/utils'
import { SphinxJsonRpcProvider } from './src/provider'
import { SphinxSystemConfig, deploySphinxSystem } from './src/languages'
import { etherscanVerifySphinxSystem } from './src/etherscan'
import { ExecutionMode } from './src/constants'

// Load environment variables from .env
dotenv.config()

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.15',
    settings: {
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
      metadata: {
        bytecodeHash: 'none',
      },
    },
  },
  networks: {
    sepolia: {
      chainId: 11155111,
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    ethereum: {
      chainId: 1,
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    'optimism-sepolia': {
      chainId: 11155420,
      url: `https://opt-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    optimism: {
      chainId: 10,
      url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    arbitrum: {
      chainId: 42161,
      url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    'arbitrum-sepolia': {
      chainId: 421614,
      url: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    bnbt: {
      chainId: 97,
      url: process.env.BNB_TESTNET_URL,
      accounts,
    },
    bnb: {
      chainId: 56,
      url: process.env.BNB_MAINNET_URL,
      accounts,
    },
    'gnosis-chiado': {
      chainId: 10200,
      url: `${process.env.CHIADO_RPC_URL}`,
      accounts,
    },
    gnosis: {
      chainId: 100,
      url: process.env.GNOSIS_MAINNET_URL,
      accounts,
    },
    maticmum: {
      chainId: 80001,
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    polygon: {
      chainId: 137,
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    'polygon-zkevm': {
      chainId: 1101,
      url: `${process.env.POLYGON_ZKEVM_MAINNET_URL}`,
      accounts,
    },
    'polygon-zkevm-goerli': {
      chainId: 1442,
      url: `${process.env.POLYGON_ZKEVM_TESTNET_URL}`,
      accounts,
    },
    linea: {
      chainId: 59144,
      url: `https://linea-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    'linea-goerli': {
      chainId: 59140,
      url: `https://linea-goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    'fantom-testnet': {
      chainId: 4002,
      url: `${process.env.FANTOM_TESTNET_RPC_URL}`,
      accounts,
    },
    fantom: {
      chainId: 250,
      url: `${process.env.FANTOM_MAINNET_RPC_URL}`,
      accounts,
    },
    'avalanche-fuji': {
      chainId: 43113,
      url: `https://avalanche-fuji.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    avalanche: {
      chainId: 43114,
      url: `https://avalanche-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    base: {
      chainId: 8453,
      url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
    'base-sepolia': {
      chainId: 84532,
      url: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
    },
  },
}

task('deploy-system')
  .setDescription('Deploys the Sphinx contracts to the specified network')
  .addParam('systemConfig', 'Path to a Sphinx system config file')
  .setAction(
    async (
      args: {
        systemConfig: string
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      // Throw an error if we're on the Hardhat network. This ensures that the `url` field is
      // defined for this network.
      if (!isHttpNetworkConfig(hre.network.config)) {
        throw new Error(
          `Cannot deploy Sphinx on the Hardhat network using this task.`
        )
      }
      const provider = new SphinxJsonRpcProvider(hre.network.config.url)
      const signer = await hre.ethers.provider.getSigner()

      const systemConfig: SphinxSystemConfig =
        require(args.systemConfig).default

      const logger = new Logger({
        name: 'Logger',
      })

      await deploySphinxSystem(
        provider,
        signer,
        systemConfig.relayers,
        ExecutionMode.LiveNetworkCLI,
        logger
      )

      await etherscanVerifySphinxSystem(provider, logger)
    }
  )

export default config
