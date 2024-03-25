import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import { fetchNameForNetwork, setBalance } from '@sphinx-labs/core'

import * as DCAHubCompanionFactoryOneArtifact from '../out/artifacts/MyContracts.sol/DCAHubCompanionFactoryOne.json'

dotenv.config()
;(async () => {
  // const rpcUrl = process.env.MOONBEAM_RPC_URL
  // const rpcUrl = `https://moonbase-alpha.public.blastapi.io`
  const rpcUrl = `${process.env.SEPOLIA_RPC_URL!}`

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  const chainId = await provider.getNetwork().then((n) => n.chainId)
  if (chainId === BigInt(31337)) {
    await setBalance(wallet.address, ethers.MaxUint256.toString(), provider)
  }

  const initCode = DCAHubCompanionFactoryOneArtifact.bytecode.object

  const rcpt = await (
    await wallet.sendTransaction({
      data: initCode,
    })
  ).wait()
  console.log('contractAddress', rcpt?.contractAddress)

  const factory = new ethers.Contract(
    rcpt?.contractAddress!,
    DCAHubCompanionFactoryOneArtifact.abi,
    wallet
  )
  const rcpt2 = await (await factory.entry1()).wait()
  console.log('gasUsed', fetchNameForNetwork(chainId), await factory.gasUsed())
  console.log('txn hash', rcpt2!.hash)
})()
