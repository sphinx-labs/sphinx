export const WEBSITE_URL = `https://sphinx.dev`

export type Integration = 'hardhat' | 'foundry'

export enum ExecutionMode {
  LocalNetworkCLI,
  LiveNetworkCLI,
  Platform,
}

export const MAX_UINT64 = BigInt(2) ** BigInt(64) - BigInt(1)

export const DEFAULT_CALL_DEPTH = '2'
