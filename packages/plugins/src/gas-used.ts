import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import {
  SphinxJsonRpcProvider,
  fetchChainIdForNetwork,
  fetchNameForNetwork,
  fetchURLForNetwork,
  setBalance,
} from '@sphinx-labs/core'

import * as GasUsedArtifact from '../out/artifacts/MyContracts.sol/GasUsed.json'
dotenv.config()

const networkName = process.argv[3]
if (!networkName) {
  throw new Error(`Supply a network name, e.g. --network anvil.`)
}

;(async () => {
  const chainId = fetchChainIdForNetwork(networkName)
  const rpcUrl =
    chainId === BigInt(31337)
      ? 'http://127.0.0.1:8545'
      : fetchURLForNetwork(chainId)

  const provider = new SphinxJsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  if (chainId === BigInt(31337)) {
    await setBalance(wallet.address, ethers.MaxUint256.toString(), provider)
  }

  const factory = new ethers.ContractFactory(
    GasUsedArtifact.abi,
    GasUsedArtifact.bytecode.object,
    wallet
  )
  const deployed = await factory.deploy()
  const contract = (await deployed.waitForDeployment()) as ethers.Contract

  await (await contract.setGasUsed()).wait()

  const gasUsed = await contract.gasUsed()
  console.log('gasUsed()', gasUsed)
})()
