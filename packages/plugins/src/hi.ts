import { readFileSync, writeFileSync } from 'fs'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import { fetchNameForNetwork, setBalance } from '@sphinx-labs/core'

import * as MyContract1 from '../out/artifacts/MyContracts.sol/MyContract1.json'
import * as MyLargeContractArtifact from '../out/artifacts/MyContracts.sol/MyLargeContract.json'
import * as MyMediumContractArtifact from '../out/artifacts/MyContracts.sol/MyMediumContract.json'

dotenv.config()
;(async () => {
  // const rpcUrl = `https://moonbase-alpha.public.blastapi.io`
  const rpcUrl = `http://127.0.0.1:8545`
  // const rpcUrl = `${process.env.OPTIMISM_SEPOLIA_RPC_URL!}`
  // const rpcUrl = `${process.env.SEPOLIA_RPC_URL!}`

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  const chainId = await provider.getNetwork().then((n) => n.chainId)
  if (chainId === BigInt(31337)) {
    await setBalance(wallet.address, ethers.MaxUint256.toString(), provider)
  }

  // const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
  //   ['int256', 'uint256', 'address', 'address'],
  //   [11, 1, ethers.ZeroAddress, ethers.ZeroAddress]
  // )
  // const initCode = ethers.concat([MyContract1.bytecode.object, constructorArgs])
  // -----------------------------------------------------------------
  // const initCode = MyLargeContractArtifact.bytecode.object
  // -----------------------------------------------------------------
  const initCode = MyMediumContractArtifact.bytecode.object

  const est = await provider.send('eth_estimateGas', [
    {
      data: initCode,
    },
    'latest',
  ])
  console.log('estimateGas', BigInt(est))

  const rcpt = await (
    await wallet.sendTransaction({
      data: initCode,
    })
  ).wait()
  console.log(rcpt!.gasUsed)
  // writeFileSync(
  //   `receipt-${fetchNameForNetwork(chainId)}.json`,
  //   JSON.stringify(rcpt)
  // )
})()
// // import { fetchChainIdForNetwork, fetchURLForNetwork } from '@sphinx-labs/core'
// // ;(async () => {
// //   // const networkNames = [
// //   //   'sepolia',
// //   //   // 'avalanche_fuji',
// //   //   // 'fantom_testnet',
// //   //   // 'gnosis_chiado',

// //   //   'evmos_testnet',
// //   //   'kava_testnet',
// //   //   'scroll_sepolia',
// //   // ]

// //   const rpcUrls = [
// //     // Moonbeam
// //     // 'https://1rpc.io/glmr',
// //     // 'https://moonbeam.public.blastapi.io',
// //     // 'https://moonbeam-rpc.dwellir.com',
// //     // 'https://moonbeam.unitedbloc.com',
// //     // Moonriver
// //     // 'https://moonriver.public.blastapi.io',
// //     // 'https://moonriver-rpc.dwellir.com',
// //     'https://moonriver-mainnet.gateway.pokt.network/v1/lb/62a74fdb123e6f003963642f',
// //     'https://moonriver.unitedbloc.com',
// //     'https://moonriver.blastapi.io/e61786fd-b97e-4b56-9798-b5db4a3445da', // Private free tier
// //     // Moonbase Alpha
// //     'https://moonbase-rpc.dwellir.com',
// //     'https://moonbeam-alpha.api.onfinality.io/public',
// //     'https://moonbase.unitedbloc.com:1000',
// //     'https://moonbase-alpha.public.blastapi.io',
// //     'https://rpc.api.moonbase.moonbeam.network',
// //     'https://rpc.testnet.moonbeam.network',
// //   ]

// //   // for (const networkName of networkNames) {
// //   //   const rpcUrl = fetchURLForNetwork(fetchChainIdForNetwork(networkName))
// //   for (const rpcUrl of rpcUrls) {
// //     const provider = new ethers.JsonRpcProvider(rpcUrl)

// //     const to = '0x987CCa7d9EeB2593271fd1D155724f18eB2CC913'

// //     // You'll need to ABI encode and store the calldata elsewhere because
// //     // EthersJS throws an error when it attempts to ABI encode really large
// //     // amounts of data. I recommend using Forge, then writing the calldata to a file,
// //     // which you can read here.
// //     const calldata = readFileSync('a.txt', 'utf-8').replace(/\n/g, '') // trim \n

// //     const ret = await provider.send('eth_call', [
// //       {
// //         to,
// //         data: calldata,
// //       },
// //       'latest',
// //     ])
// //     console.log(ret)
// //   }
// // })()
