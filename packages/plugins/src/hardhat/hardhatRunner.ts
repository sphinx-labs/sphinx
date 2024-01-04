// This file is meant to be called in a child process to simulate a deployment using a forked
// Hardhat node. For more info, see the documentation inside the `simulate` function in
// `simulate.ts`.

import hre from 'hardhat'

import {
  simulateDeploymentSubtask,
  simulateDeploymentSubtaskArgs,
} from './simulate'

process.stdin.setEncoding('utf8')

let inputData = ''

process.stdin.on('data', (chunk) => {
  inputData += chunk
})

process.stdin.on('end', async () => {
  const taskArgs = JSON.parse(inputData)
  await runHardhatSimulation(taskArgs)
})

const runHardhatSimulation = async (
  taskArgs: simulateDeploymentSubtaskArgs
): Promise<void> => {
  const {
    receipts,
    batches,
  }: Awaited<ReturnType<typeof simulateDeploymentSubtask>> = await hre.run(
    'sphinxSimulateDeployment',
    taskArgs
  )

  process.stdout.write(JSON.stringify({ receipts, batches }))
}

// This display errors in a coherent stack trace. The default behavior displays the stack
// trace twice, where one is a stringified version that's difficult to read.
process.on('uncaughtException', (error) => {
  console.error(error)
  process.exit(1)
})
