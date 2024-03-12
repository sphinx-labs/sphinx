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
  const { receipts }: Awaited<ReturnType<typeof simulateDeploymentSubtask>> =
    await hre.run('sphinxSimulateDeployment', taskArgs)

  process.stdout.write(JSON.stringify({ receipts }))
}

let getaddrinfoErrors = 0

// If an error occurs, we write the error message and stack trace to `stdout` then exit the process
// with exit code `1`. We write the error to `stdout` instead of `stderr` because `stderr` may
// contain warnings that were written via `console.warn`, which are indistinguishable from the
// actual error message in `stderr`. By using `stdout`, we can throw an error that doesn't contain
// warnings in the parent process.
process.on('uncaughtException', (error) => {
  /**
   * This catches a common error where the DNS lookup for an rpc url fails. For some reason, this
   * error is not caught by ethers and is also not caught by our try/catch. So instead we catch it
   * specifically here and just silently handle it.
   *
   * It is safe to silently handle this because the user definitely has a valid RPC url if the process
   * made it to the simulation at all. So we can reasonably expect that if we handle this and then the
   * simulation retries, it will succeed.
   *
   * It's worth mentioning, that we've already had logic that handles this running in the website backend
   * and it very reliably works for handling this exact issue.
   */
  if (error.message.includes('getaddrinfo ENOTFOUND')) {
    if (getaddrinfoErrors < 25) {
      getaddrinfoErrors += 1
      return
    } else {
      throw error
    }
  }

  process.stdout.write(
    JSON.stringify({ message: error.message, stack: error.stack })
  )

  process.exit(1)
})
