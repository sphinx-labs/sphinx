import { SphinxJsonRpcProvider } from '@sphinx-labs/core'
import { ethers } from 'ethers'

import { killAnvilNodes, startAnvilNodes } from '../test/mocha/common'
import * as GasLimitChecker from '../out/artifacts/MyContracts.sol/GasLimitChecker.json'
;(async () => {
  await startAnvilNodes([BigInt(31337)])

  const rpcUrl = 'http://127.0.0.1:8545'
  const provider = new SphinxJsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    provider
  )
  const factory = new ethers.ContractFactory(
    GasLimitChecker.abi,
    GasLimitChecker.bytecode,
    wallet
  )

  await provider.send('evm_setBlockGasLimit', [ethers.toBeHex(300_000_000)])

  const contract = await factory.deploy(1096)
  await contract.waitForDeployment()
  const txn = contract.deploymentTransaction()
  const rcpt = await provider.getTransactionReceipt(txn!.hash)

  await killAnvilNodes([BigInt(31337)])

  console.log('gasUsed', rcpt!.gasUsed)
})()
