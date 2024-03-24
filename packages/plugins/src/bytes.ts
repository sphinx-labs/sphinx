import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import { fetchNameForNetwork, setBalance } from '@sphinx-labs/core'

import * as MyBytesContractArtifact from '../out/artifacts/MyContracts.sol/MyBytesContract.json'

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

  const rcpt = await (
    await wallet.sendTransaction({
      data: '0x' + '11'.repeat(41000),
      to: ethers.ZeroAddress,
    })
  ).wait()

  console.log('txn hash', rcpt!.hash)
  console.log('gasUsed', rcpt!.gasUsed)
})()
