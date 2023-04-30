import { Logger } from '@eth-optimism/common-ts'
import hre from 'hardhat'
import { getChainId } from '@openzeppelin/upgrades-core'
import '@nomiclabs/hardhat-ethers'

import {
  initializeChugSplash,
  isSupportedNetworkOnEtherscan,
  verifyChugSplash,
} from '../dist'

const main = async () => {
  // Set executors to passed in addresses or default to the signer's address
  const args = process.argv.slice(4)
  const executors =
    args.length > 0
      ? args
      : [await hre.ethers.provider.getSigner().getAddress()]

  const logger = new Logger({
    name: 'deploy',
  })
  const provider = hre.ethers.provider

  // Deploy Contracts
  await initializeChugSplash(
    provider,
    await provider.getSigner(),
    executors,
    logger
  )

  // Verify ChugSplash contracts on etherscan
  try {
    // Verify the ChugSplash contracts if the current network is supported.
    if (isSupportedNetworkOnEtherscan(await getChainId(provider))) {
      const apiKey = process.env.ETHERSCAN_API_KEY
      if (apiKey) {
        logger.info(
          '[ChugSplash]: attempting to verify the chugsplash contracts...'
        )
        await verifyChugSplash(provider, provider.network.name, apiKey)
        logger.info(
          '[ChugSplash]: finished attempting to verify the chugsplash contracts'
        )
      } else {
        logger.info(
          `[ChugSplash]: skipped verifying chugsplash contracts. reason: no api key found`
        )
      }
    } else {
      logger.info(
        `[ChugSplash]: skipped verifying chugsplash contracts. reason: etherscan config not detected for: ${provider.network.name}`
      )
    }
  } catch (e) {
    logger.error(
      `[ChugSplash]: error: failed to verify chugsplash contracts on ${provider.network.name}`,
      e
    )
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
