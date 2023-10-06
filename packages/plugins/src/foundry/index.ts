import {
  getSphinxRegistryReadOnly,
  getPreviousConfigUri,
  ensureSphinxInitialized,
  SphinxJsonRpcProvider,
  isLiveNetwork,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

const args = process.argv.slice(2)
const command = args[0]

;(async () => {
  switch (command) {
    case 'getPreviousConfigUri': {
      const rpcUrl = args[1]
      const proxyAddress = args[2]
      const provider = new SphinxJsonRpcProvider(rpcUrl)
      const registry = await getSphinxRegistryReadOnly(provider)

      const configUri = await getPreviousConfigUri(
        provider,
        registry,
        proxyAddress
      )

      const exists = configUri !== undefined

      const encodedConfigUri = ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'string'],
        [exists, configUri ?? '']
      )

      process.stdout.write(encodedConfigUri)
      break
    }
    case 'deployOnAnvil': {
      const rpcUrl = args[1]
      const executor = args[2]
      const executorArray = executor !== ethers.ZeroAddress ? [executor] : []
      const provider = new SphinxJsonRpcProvider(rpcUrl)

      // TODO(docs): hardhat works on anvil. also, we generate this address to ensure that this deployer's
      // nonce doesn't...
      const firstSphinxPrivateKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['string', 'uint256'],
          ['sphinx.deployer', 0]
        )
      )
      const secondSphinxPrivateKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['string', 'uint256'],
          ['sphinx.deployer', 1]
        )
      )
      await provider.send('hardhat_setBalance', [
        new ethers.Wallet(firstSphinxPrivateKey).address,
        ethers.toBeHex(ethers.parseEther('100')),
      ])
      // TODO(docs) We use the second private key here because the first one is broadcasting
      // transactions in Foundry
      const wallet = new ethers.Wallet(secondSphinxPrivateKey, provider)
      await provider.send('hardhat_setBalance', [
        wallet.address,
        ethers.toBeHex(ethers.parseEther('100')),
      ])

      await ensureSphinxInitialized(provider, wallet, executorArray, [], [])

      break
    }
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
