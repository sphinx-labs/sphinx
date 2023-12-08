import { SphinxJsonRpcProvider, isLiveNetwork } from '@sphinx-labs/core'
import { ethers } from 'ethers'

const args = process.argv.slice(2)
const command = args[0]

;(async () => {
  switch (command) {
    case 'isLiveNetwork': {
      const rpcUrl = args[1]
      const provider = new SphinxJsonRpcProvider(rpcUrl)

      const abiEncodedResult = ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool'],
        [await isLiveNetwork(provider)]
      )

      process.stdout.write(abiEncodedResult)
      break
    }
  }
})()
