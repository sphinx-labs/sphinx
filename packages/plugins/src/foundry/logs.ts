// These variables are used to capture any errors or warnings that occur during the Sphinx

import { defaultAbiCoder, hexConcat } from 'ethers/lib/utils'

// config validation process.
let validationWarnings: string = ''
let validationErrors: string = ''
// This function overrides the default 'stderr.write' function to capture any errors or warnings
// that occur during the validation process.
export const validationStderrWrite = (message: string) => {
  if (message.startsWith('\nWarning: ')) {
    validationWarnings += message.replace('\n', '')
  } else if (message.startsWith('\nError: ')) {
    // We remove '\nError: ' because Foundry already displays the word "Error" when an error occurs.
    validationErrors += message.replace('\nError: ', '')
  } else {
    validationErrors += message
  }
  return true
}

export const getEncodedFailure = (err: Error): string => {
  // Trim a trailing '\n' character from the end of 'warnings' if it exists.
  const prettyWarnings = getPrettyWarnings()

  let prettyError: string
  if (err.name === 'ValidationError') {
    // We return the error messages and warnings.

    // Removes unnecessary '\n' characters from the end of 'errors'
    prettyError = validationErrors.endsWith('\n\n')
      ? validationErrors.substring(0, validationErrors.length - 2)
      : validationErrors
  } else {
    // A non-parsing error occurred. We return the full stack trace if it exists. Otherwise we
    // return the error name and message.
    const errorMessage = err.stack ?? `${err.name}: ${err.message}`
    // Strip 'Error: ' from the beginning of the error message if it exists, since Foundry already
    // displays the word "Error" when an error occurs.
    prettyError = errorMessage.startsWith('Error: ')
      ? errorMessage.substring(7)
      : errorMessage
  }

  const encodedErrorsAndWarnings = defaultAbiCoder.encode(
    ['string', 'string'],
    [prettyError, prettyWarnings]
  )

  const encodedFailure = hexConcat([
    encodedErrorsAndWarnings,
    defaultAbiCoder.encode(['bool'], [false]), // false = failure
  ])

  return encodedFailure
}

// Removes a '\n' character from the end of 'warnings' if it exists.
export const getPrettyWarnings = (): string => {
  return validationWarnings.endsWith('\n\n')
    ? validationWarnings.substring(0, validationWarnings.length - 1)
    : validationWarnings
}
