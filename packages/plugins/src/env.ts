/**
 * Removes all command line args in the `process.argv` array that begin with '--'. This is necessary
 * to prevent an error that occurs when running the executor from within a Hardhat plugin task. This
 * error occurs because the BaseServiceV2 (inherited by the executor) parses these command line
 * arguments and throws an error when it sees arguments that it does not recognize.
 */
export const removeFlagsFromCommandLineArgs = (): void => {
  process.argv = process.argv.filter((arg) => !arg.startsWith('--'))
}
