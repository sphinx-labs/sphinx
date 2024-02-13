export const BothNetworksSpecifiedError = `You must specify either 'testnets' or 'mainnets', but not both.`

export const ConfirmAndDryRunError =
  '--confirm and --dry-run cannot be used together'

export const getInvalidNetworksArgumentError = (arg: string | Array<string>) =>
  `Invalid values:\n  Argument: networks, Given: "${arg}", Choices: "testnets", "mainnets"`

export const coerceNetworks = (
  arg: string | Array<string>
): 'testnets' | 'mainnets' => {
  // Check if `arg` is an array and has both 'mainnets' and 'testnets'.
  if (
    Array.isArray(arg) &&
    arg.length === 2 &&
    arg.includes('testnets') &&
    arg.includes('mainnets')
  ) {
    throw new Error(BothNetworksSpecifiedError)
  }

  // Check if `arg` is a single string and is either 'mainnets' or 'testnets'.
  if (typeof arg === 'string' && (arg === 'testnets' || arg === 'mainnets')) {
    return arg
  }

  // If none of the above conditions are met, throw a general error.
  throw new Error(getInvalidNetworksArgumentError(arg))
}
