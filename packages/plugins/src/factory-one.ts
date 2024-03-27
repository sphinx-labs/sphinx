import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import { fetchNameForNetwork, setBalance } from '@sphinx-labs/core'

import * as MyContract1FactoryOneArtifact from '../out/artifacts/MyContracts.sol/MyContract1FactoryOne.json'

dotenv.config()
;(async () => {
  // const rpcUrl = `https://moonbase-alpha.public.blastapi.io`
  // const rpcUrl = ``
  const rpcUrl = `${process.env.SEPOLIA_RPC_URL!}`

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  const chainId = await provider.getNetwork().then((n) => n.chainId)
  if (chainId === BigInt(31337)) {
    await setBalance(wallet.address, ethers.MaxUint256.toString(), provider)
  }

  const initCode = MyContract1FactoryOneArtifact.bytecode.object

  const rcpt = await (
    await wallet.sendTransaction({
      data: initCode,
    })
  ).wait()
  console.log('contractAddress', rcpt?.contractAddress)

  const factory = new ethers.Contract(
    rcpt?.contractAddress!,
    MyContract1FactoryOneArtifact.abi,
    wallet
  )
  await (await factory.entry1()).wait()
  console.log('gasUsed', await factory.gasUsed())
})()
