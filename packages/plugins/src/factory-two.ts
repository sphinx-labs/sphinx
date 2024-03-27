import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import { fetchNameForNetwork, setBalance } from '@sphinx-labs/core'

import * as MyContract1FactoryTwoArtifact from '../out/artifacts/MyContracts.sol/MyContract1FactoryTwo.json'
import * as MyContract1Artifact from '../out/artifacts/MyContracts.sol/MyContract1.json'

dotenv.config()
;(async () => {
  const rpcUrl = `https://moonbase-alpha.public.blastapi.io`
  // const rpcUrl = ``
  // const rpcUrl = `${process.env.SEPOLIA_RPC_URL!}`

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  const chainId = await provider.getNetwork().then((n) => n.chainId)
  if (chainId === BigInt(31337)) {
    await setBalance(wallet.address, ethers.MaxUint256.toString(), provider)
  }

  const initCode = MyContract1FactoryTwoArtifact.bytecode.object

  const rcpt = await (
    await wallet.sendTransaction({
      data: initCode,
    })
  ).wait()
  console.log('contractAddress', rcpt?.contractAddress)

  const factory = new ethers.Contract(
    rcpt?.contractAddress!,
    MyContract1FactoryTwoArtifact.abi,
    wallet
  )
  await (await factory.entry2(634156)).wait()
  const deployedAddress = await factory.deployed2()
  const ct = new ethers.Contract(
    deployedAddress,
    MyContract1Artifact.abi,
    provider
  )
  console.log('int arg', await ct.intArg())
})()
