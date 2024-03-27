import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { SphinxJsonRpcProvider, fetchNameForNetwork } from '@sphinx-labs/core'
import { ethers } from 'ethers'

import {
  bytecode as gasLimitCheckerBytecode,
  deployedBytecode as gasLimitCheckerDeployedBytecode,
} from '../out/artifacts/MyContracts.sol/GasLimitChecker.json'

dotenv.config()

const fileName = 'gas-limit.json'

const getGasLimit = async (
  rpcUrl: string,
  networkName: string
): Promise<number> => {
  const provider = new SphinxJsonRpcProvider(rpcUrl)
  let low = BigInt(0)
  let high = BigInt(27_500)

  const simulateDeployment = async (iterations: bigint): Promise<void> => {
    const initCode = gasLimitCheckerBytecode.object
    const encodedConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256'],
      [iterations]
    )
    const initCodeWithArgs = ethers.concat([initCode, encodedConstructorArgs])
    const deployedCode = await provider.send('eth_call', [
      {
        data: initCodeWithArgs,
      },
      'latest',
    ])
    if (deployedCode !== gasLimitCheckerDeployedBytecode.object) {
      throw new Error(`TODO(docs): returned 0x`)
    }
  }

  try {
    await simulateDeployment(high)
    throw new Error(`TODO(docs): increase initial max ${networkName}`)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === `TODO(docs): increase initial max ${networkName}`
    ) {
      throw error
    }
  }

  // Check up-front if the low amount does throw an error
  try {
    await simulateDeployment(low)
  } catch (error) {
    throw new Error(
      `The initial low amount resulted in an error on ${networkName}, which probably indicates a network issue.`
    )
  }

  let maxAcceptable = low // Initialize maxAcceptable with low, valid value

  while (low <= high) {
    const mid = low + (high - low) / BigInt(2)

    try {
      await simulateDeployment(mid)
      // If the call succeeds, this is a new valid maximum
      maxAcceptable = mid
      low = mid + BigInt(1)
    } catch (error) {
      high = mid - BigInt(1)
    }
  }

  return Number(maxAcceptable)
}
;(async () => {
  const urls = [
    // 'https://sepolia.optimism.io',
    // 'https://sepolia-rollup.arbitrum.io/rpc',
    // 'https://rpc.sepolia.org',
    // 'https://arbitrum-sepolia.blockpi.network/v1/rpc/public',
    // 'https://sepolia-rollup.arbitrum.io/rpc',
    // 'https://polygon.blockpi.network/v1/rpc/public',
    // 'https://blast-sepolia.blockpi.network/v1/rpc/public',
    // 'https://scroll.blockpi.network/v1/rpc/public',
    // 'https://scroll-sepolia.blockpi.network/v1/rpc/public',
    // 'https://forno.celo.org',
    // 'https://rpc.ankr.com/celo',
    // 'https://1rpc.io/celo',
    // ,
    // '',
    // 'https://rpc.scroll.io',
    'https://evmos-evm.publicnode.com',
    'https://rpc.linea.build',
  ]
  const existingArray = JSON.parse(readFileSync(fileName, 'utf-8'))
  const existingUrls = existingArray.map((e) => e.rpcUrl)
  const newUrls = urls.filter((url) => !existingUrls.includes(url))

  const results = await Promise.all(
    newUrls.map(async (rpcUrl) => {
      const provider = new SphinxJsonRpcProvider(rpcUrl)
      const chainId = await provider.getNetwork().then((n) => n.chainId)
      const networkName = fetchNameForNetwork(chainId)
      const gasLimit = await getGasLimit(rpcUrl, networkName)
      return { rpcUrl, gasLimit, networkName }
    })
  )
  const finalArray = results.concat(existingArray)

  // const results = await Promise.all(
  //   SPHINX_NETWORKS.map(async (network) => {
  //     const rpcUrl = fetchURLForNetwork(network.chainId)
  //     const gasLimit = await getGasLimit(rpcUrl)
  //     return { rpcUrl, gasLimit, networkName }
  //   })
  // )
  finalArray.sort((a, b) => b.gasLimit - a.gasLimit)
  console.log(results)
  writeFileSync(fileName, JSON.stringify(finalArray, null, 2))
  console.log(fileName)
})()
