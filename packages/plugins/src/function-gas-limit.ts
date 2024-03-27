import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import {
  ActionInputType,
  CreateActionInput,
  ExecutionMode,
  FunctionCallActionInput,
  NetworkConfig,
  SphinxJsonRpcProvider,
  doDeterministicDeploy,
  ensureSphinxAndGnosisSafeDeployed,
  fetchChainIdForNetwork,
  fetchNameForNetwork,
  fetchURLForNetwork,
  getMerkleLeafGasFields,
} from '@sphinx-labs/core'
import { Operation, SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import { ethers } from 'ethers'

import * as FunctionGasLimitCheckerArtifact from '../out/artifacts/MyContracts.sol/FunctionGasLimitChecker.json'

dotenv.config()

const getGasLimit = async (rpcUrl: string): Promise<number> => {
  const provider = new SphinxJsonRpcProvider(rpcUrl)
  const chainId = await provider.getNetwork().then((n) => n.chainId)
  const networkName = fetchNameForNetwork(chainId)
  let low = BigInt(0)
  let high = BigInt(27_500)

  const simulateDeployment = async (iterations: bigint): Promise<void> => {
    const contractAddress = '0x36b11cD4103C68dA1ea803F128E4e10b5bB99E43'
    const iface = new ethers.Interface(FunctionGasLimitCheckerArtifact.abi)
    const txData = iface.encodeFunctionData('gasLimit', [iterations])
    const deployedCode = await provider.send('eth_call', [
      {
        to: contractAddress,
        data: txData,
      },
      'latest',
    ])
    if (deployedCode === '0x') {
      throw new Error(`TODO(docs): returned 0x`)
    }
  }

  // await simulateDeployment(BigInt(2195))
  // console.log('initial succeeded (good)')
  // await simulateDeployment(BigInt(2196))
  // console.log('second succeeded (bad)')
  // return 2

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
  const urls = [fetchURLForNetwork(fetchChainIdForNetwork('scroll_sepolia'))]
  const results = await Promise.all(
    urls.map(async (rpcUrl) => {
      const calldataLimit = await getGasLimit(rpcUrl)
      return { rpcUrl, calldataLimit }
    })
  )

  // const results = await Promise.all(
  //   SPHINX_NETWORKS.map(async (network) => {
  //     const rpcUrl = fetchURLForNetwork(network.chainId)
  //     const calldataLimit = await getGasLimit(rpcUrl)
  //     return { rpcUrl, calldataLimit, chainId: network.chainId.toString() }
  //   })
  // )

  const fileName = 'gas-limit.json'
  writeFileSync(fileName, JSON.stringify(results))
  console.log(fileName)
})()
