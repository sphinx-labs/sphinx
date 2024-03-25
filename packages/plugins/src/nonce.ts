import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import { fetchNameForNetwork, setBalance } from '@sphinx-labs/core'

import * as DCAHubCompanionFactoryTwoArtifact from '../out/artifacts/MyContracts.sol/DCAHubCompanionFactoryTwo.json'

dotenv.config()
;(async () => {
  const rpcUrl = process.env.MOONBEAM_RPC_URL
  // const rpcUrl = `https://moonbase-alpha.public.blastapi.io`
  // const rpcUrl = `${process.env.SEPOLIA_RPC_URL!}`

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  const chainId = await provider.getNetwork().then((n) => n.chainId)
  if (chainId === BigInt(31337)) {
    await setBalance(wallet.address, ethers.MaxUint256.toString(), provider)
  }

  const initCode = DCAHubCompanionFactoryTwoArtifact.bytecode.object

  const gasPrice =
    chainId === BigInt(1284) ? BigInt(500) * BigInt(10 ** 9) : undefined

  await (
    await wallet.sendTransaction({
      data: initCode,
      gasPrice,
      nonce: 19,
    })
  ).wait()
})()
