// import { readFileSync, writeFileSync } from 'fs'

// import { SphinxJsonRpcProvider, fetchNameForNetwork } from '@sphinx-labs/core'

// const fileName = 'gas-limit.json'
// const gasLimit: Array<{
//   rpcUrl: string
//   calldataLimit: string
//   chainId: string
// }> = JSON.parse(readFileSync(fileName, 'utf-8'))

// const newArray: Array<{
//   rpcUrl: string
//   gasLimit: string
//   networkName: string
// }> = []
// for (const e of gasLimit) {
//   newArray.push({
//     rpcUrl: e.rpcUrl,
//     gasLimit: e.calldataLimit,
//     networkName: fetchNameForNetwork(BigInt(e.chainId)),
//   })
// }
// newArray.sort((a, b) => Number(BigInt(b.gasLimit) - BigInt(a.gasLimit)))
// writeFileSync(fileName, JSON.stringify(newArray))
// console.log(fileName)

// // ;(async () => {
// //   const newArray: Array<{
// //     rpcUrl: string
// //     calldataLimit: string
// //     networkName: string
// //   }> = []
// //   for (const e of calldataLimit) {
// //     const provider = new SphinxJsonRpcProvider(e.rpcUrl)
// //     const networkName = fetchNameForNetwork(
// //       await provider.getNetwork().then((n) => n.chainId)
// //     )
// //     newArray.push({ ...e, networkName })
// //   }

// //   newArray.sort((a, b) =>
// //     Number(BigInt(b.calldataLimit) - BigInt(a.calldataLimit))
// //   )
// //   const fileName = 'calldata-limit.json'
// //   writeFileSync(fileName, JSON.stringify(newArray))
// //   console.log(fileName)
// // })()
