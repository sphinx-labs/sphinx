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
      const provider = new SphinxJsonRpcProvider(rpcUrl)

      // TODO(docs): hardhat works on anvil. also, we generate this address to ensure that this deployer's
      // nonce doesn't...
      const deployerPrivateKey = ethers.toBeHex(
        BigInt(ethers.keccak256(ethers.toUtf8Bytes('sphinx.deployer'))) - 1n
      )
      const wallet = new ethers.Wallet(deployerPrivateKey, provider)
      await provider.send('hardhat_setBalance', [
        wallet.address,
        ethers.toBeHex(ethers.parseEther('100')),
      ])

      await ensureSphinxInitialized(provider, wallet, [], [], [])

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
