import * as fs from 'fs'

import { SphinxJsonRpcProvider } from '@sphinx-labs/core'

const rpcUrl = `https://moonbeam.api.onfinality.io/rpc?apikey=ddd80976-de40-4263-9fd3-db995404eb6e`
// const rpcUrl = process.env.SEPOLIA_RPC_URL!

;(async () => {
  const provider = new SphinxJsonRpcProvider(rpcUrl)

  // const txnHash =
  //   '0xf00006f67a9f563dcfe6bb84ec0deb0ffe1cfd0b47eb4074a20443f9d81557d8'
  const txnHash =
    '0x6ccf7176af20a6e53090bb04baea317b9e7239ae24fbf1f5477e1101078c0c9a'
  const trace = await provider.send('debug_traceTransaction', [
    txnHash,
    { tracer: 'callTracer' },
  ])
  const file = `trace-${txnHash.slice(0, 8)}.json`
  fs.writeFileSync(file, JSON.stringify(trace))
  console.log(file)
})()
