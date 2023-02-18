import { ChugSplashExecutorType } from '@chugsplash/core'
import { ChugSplashExecutor } from '@chugsplash/executor'
import { providers } from 'ethers'

export const initializeExecutor = async (
  provider: providers.JsonRpcProvider
): Promise<ChugSplashExecutorType> => {
  // Instantiate the executor.
  const executor = new ChugSplashExecutor({
    useArgv: false,
  })

  // Setup the executor.
  await executor.setup(
    {
      privateKey:
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      // Passing the log level in when creating executor still does not work as expected.
      // If you attempt to remove this option, the foundry library will fail due to incorrect output to the console.
      // This is because the foundry library parses stdout and expects a very specific format.
      logLevel: 'error',
    },
    provider
  )

  return executor as any as ChugSplashExecutorType
}
