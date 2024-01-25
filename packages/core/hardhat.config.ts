/* eslint-disable @typescript-eslint/no-var-requires */
import '@nomicfoundation/hardhat-ethers'

import * as dotenv from 'dotenv'
import { task } from 'hardhat/config'
import {
  HardhatRuntimeEnvironment,
  HardhatUserConfig,
  NetworksUserConfig,
} from 'hardhat/types'
import { Logger } from '@eth-optimism/common-ts'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'

import { isHttpNetworkConfig } from './src/utils'
import { SphinxJsonRpcProvider } from './src/provider'
import { SphinxSystemConfig, deploySphinxSystem } from './src/languages'
import { etherscanVerifySphinxSystem } from './src/etherscan'
import { ExecutionMode } from './src/constants'
import { isVerificationSupportedForNetwork } from './src/networks'

// Load environment variables from .env
dotenv.config()

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []

const fetchSupportedNetworkHardhatConfig = () => {
  const networks: NetworksUserConfig = {}

  for (const network of SPHINX_NETWORKS) {
    networks[network.name] = {
      chainId: Number(network.chainId),
      url: network.rpcUrl() ?? '',
      accounts,
    }
  }

  return networks
}

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
  networks: fetchSupportedNetworkHardhatConfig(),
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

      if (
        isVerificationSupportedForNetwork((await provider.getNetwork()).chainId)
      ) {
        await etherscanVerifySphinxSystem(provider, logger)
      } else {
        logger.info('[Sphinx]: Verification unsupported on this network')
      }
    }
  )

export default config
