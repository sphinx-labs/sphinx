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

import * as MyMediumContractFactoryArtifact from '../out/artifacts/MyContracts.sol/MyMediumContractFactory.json'

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

  const initCode = MyMediumContractFactoryArtifact.bytecode.object

  // gas: 4_020_000
  // const address1 = '0xa84f22ea0e005cdbdfb6ef9a55894c667ddb1f58'
  // const address2 = '0x9cdda22e9f01a45a18805318c7e3b562325cf420'
  // -----------------------------------------------------------
  // // gas: 6_000_000
  // const address1 = '0x49fe30ae7a595d20ab253b2f50574e30161d2257'
  // const address2 = '0x08289a80a5ea71a850c8b0d0a6cebc9a33918579'
  // -----------------------------------------------------------
  // // this.deploy() (no hard-coded gas or try/catch)
  // const address1 = '0x6a7adf8e0e25da28c99f8594cd602875ef5b5c45'
  // const address2 = '0x3f84656a9a042179e3fc08cef0cec5016c4d0299'
  // -----------------------------------------------------------
  const address1 = (await (
    await wallet.sendTransaction({
      data: initCode,
    })
  ).wait())!.contractAddress
  // const address2 = (await (
  //   await wallet.sendTransaction({
  //     data: initCode,
  //   })
  // ).wait())!.contractAddress

  const factory1 = new ethers.Contract(
    address1!,
    MyMediumContractFactoryArtifact.abi,
    wallet
  )
  // const factory2 = new ethers.Contract(
  //   address2!,
  //   MyMediumContractFactoryArtifact.abi,
  //   wallet
  // )

  const nonce = await provider.getTransactionCount(wallet.address)

  const { gasPrice: baseGasPrice } = await provider.getFeeData()
  if (baseGasPrice === null) {
    throw new Error(`gasPrice is null`)
  }

  const gasPrice = BigInt(2) * baseGasPrice

  const response1 = await factory1.entry({ gasPrice, nonce })
  // const response2 = await factory2.entry({ gasPrice, nonce: nonce + 1 })

  const rcpt1 = await response1.wait()
  // const rcpt2 = await response2.wait()

  console.log(fetchNameForNetwork(chainId))

  const success1 = await factory1.success()
  // const success2 = await factory2.success()
  console.log('success1', success1)
  // console.log('success2', success2)
  console.log('gasUsed1', await factory1.gasUsed())
  // console.log('gasUsed2', await factory2.gasUsed())
  console.log('txn hash 1', rcpt1.hash)
  // console.log('txn hash 2', rcpt2.hash)
})()
