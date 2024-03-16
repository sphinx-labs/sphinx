export const getMissingEndpointErrorMessage = (
  networks: Array<string>
): string =>
  `The following networks are missing an RPC endpoint in your foundry.toml:\n` +
  networks.map((network) => `- ${network}`).join('\n')

export const getFailedRequestErrorMessage = (networks: Array<string>): string =>
  `Failed to make a request to the following networks in your foundry.toml. Please \n` +
  `check that you've correctly defined the RPC endpoint for these networks:\n` +
  networks.map((network) => `- ${network}`).join('\n')

export const getUnsupportedNetworkErrorMessage = (
  unsupported: Array<{ chainId: string; networkName: string }>
): string =>
  // We include the chain ID in the error message since this may be helpful if the user's RPC URL is
  // mismatched with their network name. e.g. `sepolia = "http://super-random-network-url".
  `The following networks are not supported by Sphinx's DevOps Platform. If you think this is\n` +
  `a mistake, check that the chain ID matches the network name. If it doesn't match, you're\n` +
  `using the wrong RPC URL for this network.\n` +
  unsupported
    .map(({ networkName, chainId }) => `- ${networkName}, chain ID: ${chainId}`)
    .join('\n')

export const getLocalNetworkErrorMessage = (networks: Array<string>): string =>
  `The following networks are local networks. You can only propose on live networks.\n` +
  networks.map((network) => `- ${network}`).join('\n')

export const getMixedNetworkTypeErrorMessage = (
  networks: Array<{
    networkType: string
    network: string
  }>
): string =>
  `Detected a mix of test networks and production networks in the proposal. Proposals\n` +
  `must either contain test networks or production networks, but not both.\n` +
  networks
    .map(({ networkType, network }) => `- ${network}: ${networkType}`)
    .join(`\n`)

export const SphinxConfigMainnetsContainsTestnetsErrorMessage =
  `Your 'sphinxConfig.mainnets' array contains all test networks. Please put these networks\n` +
  `in 'sphinxConfig.testnets' instead.`

export const SphinxConfigTestnetsContainsMainnetsErrorMessage =
  `Your 'sphinxConfig.testnets' array contains all production networks. Please put these networks\n` +
  `in 'sphinxConfig.mainnets' instead.`

export const InvalidFirstSigArgumentErrorMessage =
  `The first argument passed to --sig is invalid. If you're passing in a function, make sure\n` +
  `it includes parenthesis, e.g. 'run()'. If you're passing in raw calldata, make sure it's\n` +
  `a valid hex string.`

export const SigCalledWithNoArgsErrorMessage = `Expected at least one argument passed to --sig, but none were supplied.`

export const HardhatResetNotAllowedErrorMessage = `Calling 'hardhat_reset' is not allowed.`

export const getRpcRequestStalledErrorMessage = (ms: number): string =>
  `RPC request stalled for ${
    ms / 1000
  } seconds. Please check that your RPC provider is functional, and\n` +
  `consider switching if it isn't.`
