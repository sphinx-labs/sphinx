// TODO(docs): this is executed in a child process.

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
