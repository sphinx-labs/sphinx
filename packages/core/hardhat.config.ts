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
import {
  DrippieArtifact,
  SPHINX_NETWORKS,
  getDrippieAddress,
} from '@sphinx-labs/contracts'
import { Contract, Wallet } from 'ethers'
import ora from 'ora'

import { SphinxJsonRpcProvider } from './src/provider'
import { deploySphinxSystem } from './src/languages'
import { verifySphinxSystem } from './src/etherscan'
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

task('withdraw-drippie')
  .setDescription('Withdraws the maximum amount from drippie')
  .setAction(async (_, hre: HardhatRuntimeEnvironment) => {
    // Throw an error if we're on the Hardhat network. This ensures that the `url` field is
    // defined for this network.
    if (!('url' in hre.network.config)) {
      throw new Error(
        `Cannot deploy Sphinx on the Hardhat network using this task.`
      )
    }
    const provider = new SphinxJsonRpcProvider(hre.network.config.url)
    const signer = new Wallet(process.env.PRIVATE_KEY!).connect(provider)

    const drippieContract = new Contract(
      getDrippieAddress(),
      DrippieArtifact.abi,
      signer
    )

    const spinner = ora()
    spinner.start('sending transaction...')

    const tx = await drippieContract.withdrawETH(
      process.env.DRIPPIE_WITHDRAW_TO
    )
    await tx.wait()

    spinner.succeed('withdrawal complete')
  })

task('deploy-system')
  .setDescription('Deploys the Sphinx contracts to the specified network')
  .setAction(async (_, hre: HardhatRuntimeEnvironment) => {
    // Throw an error if we're on the Hardhat network. This ensures that the `url` field is
    // defined for this network.
    if (!('url' in hre.network.config)) {
      throw new Error(
        `Cannot deploy Sphinx on the Hardhat network using this task.`
      )
    }
    const provider = new SphinxJsonRpcProvider(hre.network.config.url)
    const signer = new Wallet(process.env.PRIVATE_KEY!).connect(provider)

    const spinner = ora()
    const logger = new Logger({
      name: 'Logger',
    })

    await deploySphinxSystem(
      provider,
      signer,
      [],
      ExecutionMode.LiveNetworkCLI,
      true,
      spinner
    )

    if (
      isVerificationSupportedForNetwork((await provider.getNetwork()).chainId)
    ) {
      await verifySphinxSystem(provider, logger)
    } else {
      spinner.info('Verification unsupported on this network')
    }
  })

export default config
