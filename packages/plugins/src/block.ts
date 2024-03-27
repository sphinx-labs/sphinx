import { writeFileSync } from 'fs'

import { SphinxJsonRpcProvider } from '@sphinx-labs/core'
;(async () => {
  const rpcUrl = process.env.MOONBEAM_RPC_URL!

  const provider = new SphinxJsonRpcProvider(rpcUrl)

  const rcpt = await provider.getTransactionReceipt(
    '0xf00006f67a9f563dcfe6bb84ec0deb0ffe1cfd0b47eb4074a20443f9d81557d8'
  )
  writeFileSync('kevin-receipt.json', JSON.stringify(rcpt))

  const block = await provider.getBlock(
    '0xd6429a878cb95bae340339977e1ad1b87af2ec3374759245f64f7737cf08c9de'
  )
  writeFileSync('kevin-block.json', JSON.stringify(block))
})()
