import {
  SphinxJsonRpcProvider,
  fetchChainIdForNetwork,
  fetchNameForNetwork,
  fetchURLForNetwork,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

import * as Artifact from '../out/artifacts/MyContracts.sol/GasSpender.json'
;(async () => {
  const provider = new SphinxJsonRpcProvider(
    fetchURLForNetwork(fetchChainIdForNetwork('gnosis_chiado'))
    // 'https://rpc.chiadochain.net'
  )

  const iterations = 15_000
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256'],
    [iterations]
  )

  const initCodeWithArgs = ethers.concat([
    Artifact.bytecode.object,
    encodedArgs,
  ])

  const gasPrice = ethers.parseUnits('400', 'gwei')
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
  await (
    await wallet.sendTransaction({
      data: initCodeWithArgs,
      gasPrice: ethers.toBeHex(gasPrice).replace('0x0', '0x'),
    })
  ).wait()
})()
