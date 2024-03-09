import { readFileSync } from 'fs'

import { ethers } from 'ethers'

// import * as MyLargeContractArtifact from '../out/artifacts/MyContracts.sol/MyLargeContract.json'
// ;(async () => {
//   const rpcUrl = `https://moonbeam.public.blastapi.io`
//   const provider = new ethers.JsonRpcProvider(rpcUrl)
//   const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
//     ['bytes'],
//     ['0x' + '00'.repeat(100000)]
//   )
//   const initCode = ethers.concat([
//     MyLargeContractArtifact.bytecode.object,
//     constructorArgs,
//   ])
//   const est = await provider.estimateGas({
//     data: initCode,
//   })
//   console.log(est)
// })()
import { fetchChainIdForNetwork, fetchURLForNetwork } from '@sphinx-labs/core'
;(async () => {
  const networkNames = [
    'sepolia',
    // 'avalanche_fuji',
    // 'fantom_testnet',
    // 'gnosis_chiado',

    'evmos_testnet',
    'kava_testnet',
    'scroll_sepolia',
  ]

  for (const networkName of networkNames) {
    const rpcUrl = fetchURLForNetwork(fetchChainIdForNetwork(networkName))

    const provider = new ethers.JsonRpcProvider(rpcUrl)

    const to = '0x987CCa7d9EeB2593271fd1D155724f18eB2CC913'

    // You'll need to ABI encode and store the calldata elsewhere because
    // EthersJS throws an error when it attempts to ABI encode really large
    // amounts of data. I recommend using Forge, then writing the calldata to a file,
    // which you can read here.
    const calldata = readFileSync('a.txt', 'utf-8').replace(/\n/g, '') // trim \n

    const ret = await provider.send('eth_call', [
      {
        to,
        data: calldata,
        gas: '0xffffffffffff'
      },
      'latest',
    ])
    console.log(networkName, ret)
  }
})()
