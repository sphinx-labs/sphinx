import { ChugSplashExecutorType } from '@chugsplash/core'
import { ChugSplashExecutor } from '@chugsplash/executor'
import { providers } from 'ethers'

import { addCommandLineArgs, removeFlagsFromCommandLineArgs } from './env'

export const initializeExecutor = async (
  provider: providers.JsonRpcProvider
): Promise<ChugSplashExecutorType> => {
  // We must remove the command line arguments that begin with '--' from the process.argv array,
  // or else the BaseServiceV2 (inherited by the executor) will throw an error when we instantiate
  // it.
  const removed = removeFlagsFromCommandLineArgs()

  // Instantiate the executor.
  const executor = new ChugSplashExecutor()

  // Setup the executor.
  await executor.setup(
    {
      privateKey:
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      logLevel: 'error',
    },
    false,
    provider
  )

  // Add the command line args back to the array.
  addCommandLineArgs(removed)

  return executor as any as ChugSplashExecutorType
}
