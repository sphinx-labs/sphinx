import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import {
  NetworkConfig,
  SphinxJsonRpcProvider,
  fetchChainIdForNetwork,
  fetchNameForNetwork,
  fetchURLForNetwork,
  getMerkleLeafGasFields,
} from '@sphinx-labs/core'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'

dotenv.config()

const label = process.env.LABEL
if (!label) {
  throw new Error(`Supply a LABEL env var.`)
}

;(async () => {
  const networkConfig: NetworkConfig = JSON.parse(
    readFileSync(`network-config-${label}.json`, 'utf-8')
  )
  // const rpcUrls = SPHINX_NETWORKS.filter(
  //   (n) => n.networkType === 'Testnet'
  // ).map((n) => fetchURLForNetwork(n.chainId))
  // const rpcUrls = ['https://linea-goerli.blockpi.network/v1/rpc/public']
  const rpcUrls = [
    // 'https://linea-goerli.blockpi.network/v1/rpc/public',
    fetchURLForNetwork(fetchChainIdForNetwork('sepolia')),
    // 'https://celo-alfajores-rpc.allthatnode.com',
    // fetchURLForNetwork(fetchChainIdForNetwork('evmos_testnet')),
    // fetchURLForNetwork(fetchChainIdForNetwork('kava_testnet')),
    fetchURLForNetwork(fetchChainIdForNetwork('rootstock_testnet')),
    // fetchURLForNetwork(fetchChainIdForNetwork('rari_sepolia')),
  ]

  const promises = rpcUrls.map(async (rpcUrl) => {
    const startTime = Date.now()
    const provider = new SphinxJsonRpcProvider(rpcUrl)
    const chainId = await provider.getNetwork().then((n) => n.chainId)
    const network = fetchNameForNetwork(BigInt(chainId))
    try {
      const gasEstimates = await getMerkleLeafGasFields(networkConfig, provider)
      const endTime = Date.now()
      return {
        success: true,
        gasEstimates,
        network,
        durationMs: endTime - startTime,
      }
    } catch (error) {
      const endTime = Date.now()
      return {
        success: false,
        network,
        error:
          error instanceof Error
            ? error
            : new Error('An unexpected error occurred'),
        durationMs: endTime - startTime,
      }
    }
  })

  const results = await Promise.allSettled(promises)
  const final = results.map((result) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          success: false,
          error: result.reason,
        }
  )
  writeFileSync(`merkle-leaf-gas-${label}.txt`, JSON.stringify(final, null, 2))
  console.log(`merkle-leaf-gas-${label}.txt`)
})()
