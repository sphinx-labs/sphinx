import { ChugSplashExecutorType } from '@chugsplash/core'
import { ChugSplashExecutor } from '@chugsplash/executor'
import { providers } from 'ethers'

export const initializeExecutor = async (
  provider: providers.JsonRpcProvider
): Promise<ChugSplashExecutorType> => {
  // Instantiate the executor.
  const executor = new ChugSplashExecutor({
    useArgv: false,
    privateKey:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    provider,
    initChugSplash: false,
  })

  // Setup the executor.
  await executor.init()

  // Return the executor with the correct type.
  return executor as any as ChugSplashExecutorType
}
