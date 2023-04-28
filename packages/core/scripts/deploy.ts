import { Logger } from '@eth-optimism/common-ts'
import hre from 'hardhat'
import '@nomiclabs/hardhat-ethers'

import { initializeChugSplash } from '../dist'

const main = async () => {
  // Set executors to passed in addresses or default to the signer's address
  const args = process.argv.slice(2)
  const executors =
    args.length > 0
      ? args
      : [await hre.ethers.provider.getSigner().getAddress()]

  const logger = new Logger({
    name: 'deploy',
  })
  const provider = hre.ethers.provider
  await initializeChugSplash(
    provider,
    await provider.getSigner(),
    executors,
    logger
  )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
