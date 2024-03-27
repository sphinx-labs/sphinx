import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import {
  SphinxJsonRpcProvider,
  fetchChainIdForNetwork,
  fetchNameForNetwork,
  fetchURLForNetwork,
} from '@sphinx-labs/core'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'

dotenv.config()

const fileName = 'calldata-limit.json'

const getTooHighErrorMessageTODO = (networkName: string): string =>
  `The initial upper bound value is too low on ${networkName}.`

const getCalldataLimit = async (
  rpcUrl: string,
  networkName: string
): Promise<bigint> => {
  const provider = new SphinxJsonRpcProvider(rpcUrl)
  let low = BigInt(0)
  let high = BigInt(15_000_000)

  try {
    await provider.send('eth_call', [
      {
        to: ethers.ZeroAddress,
        data: '0x' + '11'.repeat(Number(high)),
      },
      'latest',
    ])
    throw new Error(getTooHighErrorMessageTODO(networkName))
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === getTooHighErrorMessageTODO(networkName)
    ) {
      throw error
    }
  }

  // Check up-front if the low amount does throw an error
  try {
    await provider.send('eth_call', [
      {
        to: ethers.ZeroAddress,
        data: '0x' + '11'.repeat(Number(low)),
      },
      'latest',
    ])
  } catch (error) {
    throw new Error(
      `The initial low amount resulted in an error on ${networkName}, which probably indicates a network issue.`
    )
  }

  let maxAcceptable = low // Initialize maxAcceptable with low, valid value

  while (low <= high) {
    const mid = low + (high - low) / BigInt(2)

    try {
      await provider.send('eth_call', [
        {
          to: ethers.ZeroAddress,
          data: '0x' + '11'.repeat(Number(mid)),
        },
        'latest',
      ])

      // If the call succeeds, this is a new valid maximum
      maxAcceptable = mid
      low = mid + BigInt(1)
    } catch (error) {
      high = mid - BigInt(1)
    }
  }

  return maxAcceptable
}

;(async () => {
  const urls = [
    'https://rpc.linea.build',
    // ,
    // '',
    // 'https://zkevm-rpc.com',
    // 'https://rpc.public.zkevm-test.net',
    // 'https://sepolia.optimism.io',
    // 'https://sepolia-rollup.arbitrum.io/rpc',
    // 'https://rpc.sepolia.org',
    // 'https://arbitrum-sepolia.blockpi.network/v1/rpc/public',
    // 'https://sepolia-rollup.arbitrum.io/rpc',
    // 'https://polygon.blockpi.network/v1/rpc/public',
    // 'https://blast-sepolia.blockpi.network/v1/rpc/public',
    // 'https://scroll.blockpi.network/v1/rpc/public',
    // 'https://scroll-sepolia.blockpi.network/v1/rpc/public',
  ]
  const existingArray = JSON.parse(readFileSync(fileName, 'utf-8'))
  const existingUrls = existingArray.map((e) => e.rpcUrl)
  const newUrls = urls.filter((url) => !existingUrls.includes(url))

  const results = await Promise.all(
    newUrls.map(async (rpcUrl) => {
      const provider = new SphinxJsonRpcProvider(rpcUrl)
      const chainId = await provider.getNetwork().then((n) => n.chainId)
      const networkName = fetchNameForNetwork(chainId)
      const calldataLimit = await getCalldataLimit(rpcUrl, networkName)
      return { rpcUrl, calldataLimit, networkName }
    })
  )
  const finalArray = results.concat(existingArray)

  // const results = await Promise.all(
  //   SPHINX_NETWORKS.map(async (network) => {
  //     const provider = new SphinxJsonRpcProvider(rpcUrl)
  //     const rpcUrl = fetchURLForNetwork(network.chainId)
  //     const chainId = await provider.getNetwork().then((n) => n.chainId)
  //     const networkName = fetchNameForNetwork(chainId)
  //     const calldataLimit = await getCalldataLimit(rpcUrl)
  //     return { rpcUrl, calldataLimit, networkName }
  //   })
  // )

  finalArray.sort((a, b) =>
    Number(BigInt(b.calldataLimit) - BigInt(a.calldataLimit))
  )

  console.log(results)
  writeFileSync(fileName, JSON.stringify(finalArray, null, 2))
  console.log(fileName)
})()
