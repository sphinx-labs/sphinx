/**
 * Removes command line args in the `process.argv` array beginning with the first argument that
 * starts with '--'. This is necessary to prevent an error that occurs when running the executor
 * from within a Hardhat plugin task. This error occurs because the BaseServiceV2 (inherited by the
 * executor) parses these command line arguments and throws an error when it sees an unrecognized
 * argument that begins with '--'.
 *
 * @returns An array containing the removed command line args.
 */
export const removeFlagsFromCommandLineArgs = (): string[] => {
  const indexToRemove = process.argv.findIndex((arg) => arg.startsWith('--'))
  if (indexToRemove === -1) {
    return []
  }
  const removed = process.argv.slice(indexToRemove)
  process.argv = process.argv.slice(0, indexToRemove)
  return removed
}

/**
 * Adds the given array of arguments to `process.argv`.
 *
 * @param args The command line arguments to add.
 */
export const addCommandLineArgs = (args: string[]) => {
  process.argv = process.argv.concat(args)
}
