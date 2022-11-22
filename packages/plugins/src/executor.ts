import { ChugSplashExecutor } from '@chugsplash/executor'

import { addCommandLineArgs, removeFlagsFromCommandLineArgs } from './env'

export const instantiateExecutor = (): ChugSplashExecutor => {
  // We must remove the command line arguments that begin with '--' from the process.argv array,
  // or else the BaseServiceV2 (inherited by the executor) will throw an error when we instantiate
  // it.
  const removed = removeFlagsFromCommandLineArgs()

  // Instantiate the executor.
  const executor = new ChugSplashExecutor()

  // Add the command line args back to the array.
  addCommandLineArgs(removed)

  return executor
}
