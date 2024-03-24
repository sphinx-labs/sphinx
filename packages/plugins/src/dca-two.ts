import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import { fetchNameForNetwork, setBalance } from '@sphinx-labs/core'

import * as DCAHubCompanionFactoryTwoArtifact from '../out/artifacts/MyContracts.sol/DCAHubCompanionFactoryTwo.json'

dotenv.config()
;(async () => {
  const rpcUrl = `https://moonbase-alpha.public.blastapi.io`
  // const rpcUrl = `https://go.getblock.io/c6560f084b4748378df66bf0f9a78c0d`
  // const rpcUrl = `${process.env.SEPOLIA_RPC_URL!}`

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  const chainId = await provider.getNetwork().then((n) => n.chainId)
  if (chainId === BigInt(31337)) {
    await setBalance(wallet.address, ethers.MaxUint256.toString(), provider)
  }

  const initCode = DCAHubCompanionFactoryTwoArtifact.bytecode.object

  const rcpt = await (
    await wallet.sendTransaction({
      data: initCode,
    })
  ).wait()
  console.log('contractAddress', rcpt?.contractAddress)

  const factory = new ethers.Contract(
    rcpt?.contractAddress!,
    DCAHubCompanionFactoryTwoArtifact.abi,
    wallet
  )
  const rcpt2 = await (await factory.entry2(4467448)).wait()
  const deployedAddress = await factory.deployed2()
  const code = await provider.getCode(deployedAddress)
  if (code.length !== 42948) {
    throw new Error(`Code length is not correct`)
  }
  console.log('txn hash', rcpt2!.hash)
})()
