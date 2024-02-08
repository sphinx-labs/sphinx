// Warning: The constants in this file are commonly imported from the frontend of the Sphinx Managed website.
// Be careful when importing external dependencies to this file because they may cause issues when this file
// is imported by the website.
import {
  SPHINX_LOCAL_NETWORKS,
  SPHINX_NETWORKS,
} from '@sphinx-labs/contracts/dist/networks'

export type SupportedLocalNetworkName = 'anvil'

export const COMPILER_CONFIG_VERSION = '0.1.0'

/**
 * Data returned by the `anvil_metadata` and `hardhat_metadata` RPC methods.
 *
 * @param forkedNetwork Info about the network that the local node is forking, if it exists. If the
 * local node isn't forking a network, this field can be `undefined` or `null` depending on whether
 * the network is an Anvil or Hardhat node.
 */
export type LocalNetworkMetadata = {
  clientVersion: string
  chainId: number
  instanceId: string
  latestBlockNumber: number
  latestBlockHash: string
  forkedNetwork?: {
    chainId: number
    forkBlockNumber: number
    forkBlockHash: string
  } | null
  snapshots?: Record<string, unknown>
}

export const networkEnumToName = (networkEnum: bigint | string) => {
  const networkEnumBigInt = BigInt(networkEnum)

  const network = SPHINX_NETWORKS.find(
    (_, index) => BigInt(index + 1) === networkEnumBigInt
  )

  if (network) {
    return network.name
  } else {
    throw new Error(`Unsupported network enum ${networkEnum}`)
  }
}

export const fetchChainIdForNetwork = (networkName: string) => {
  const network = [...SPHINX_NETWORKS, ...SPHINX_LOCAL_NETWORKS].find(
    (n) => n.name === networkName
  )

  if (network) {
    return network.chainId
  } else {
    throw new Error(`Unsupported network name ${networkName}`)
  }
}

// Warning: Not supported on Anvil since this is expected to only be used on live networks
export const fetchDripSizeForNetwork = (chainId: bigint) => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network) {
    return network.dripSize
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

// Warning: Not supported on Anvil since this is expected to only be used on live networks
export const fetchDecimalsForNetwork = (chainId: bigint) => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network) {
    return network.decimals
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

// Warning: Not supported on Anvil since this is expected to only be used on live networks
export const fetchDripVersionForNetwork = (chainId: bigint) => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network) {
    return network.dripVersion
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

export const isVerificationSupportedForNetwork = (chainId: bigint) => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network) {
    return network.etherscan.blockExplorer !== 'Unsupported'
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

// Warning: Not supported on Anvil since this is expected to only be used on live networks
export const fetchCurrencyForNetwork = (chainId: bigint) => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network) {
    return network.currency
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

export const fetchURLForNetwork = (chainId: bigint) => {
  if (process.env.RUNNING_LOCALLY === 'true') {
    return `http://127.0.0.1:${Number(
      BigInt(42000) + (chainId % BigInt(1000))
    )}`
  }

  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)
  if (network) {
    for (const requiredEnvVariable of network.requiredEnvVariables) {
      if (!process.env[requiredEnvVariable]) {
        throw new Error(`${requiredEnvVariable} key not defined`)
      }
    }

    return network.rpcUrl()
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

export const isLegacyTransactionsRequiredForNetwork = (chainId: bigint) => {
  const network = [...SPHINX_NETWORKS, ...SPHINX_LOCAL_NETWORKS].find(
    (n) => n.chainId === chainId
  )

  if (network) {
    return network.legacyTx ?? false
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

export const shouldBufferExecuteActionsGasLimit = (chainId: bigint) => {
  const network = [...SPHINX_NETWORKS, ...SPHINX_LOCAL_NETWORKS].find(
    (n) => n.chainId === chainId
  )

  if (network) {
    return network.actionGasLimitBuffer ?? false
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

/**
 * The number of blocks that Hardhat rewinds when forking the given network. Rewinding the block
 * number protects against chain reorgs. Copied from Hardhat:
 * https://github.com/NomicFoundation/hardhat/blob/caa504fe0e53c183578f42d66f4740b8ec147051/packages/hardhat-core/src/internal/hardhat-network/provider/utils/reorgs-protection.ts
 */
export const getLargestPossibleReorg = (chainIdStr: string): bigint => {
  const chainId = Number(chainIdStr)

  // mainnet
  if (chainId === 1) {
    return BigInt(5)
  }

  // Kovan
  if (chainId === 42) {
    return BigInt(5)
  }

  // Goerli
  if (chainId === 5) {
    return BigInt(5)
  }

  // Rinkeby
  if (chainId === 4) {
    return BigInt(5)
  }

  // Ropsten
  if (chainId === 3) {
    return BigInt(100)
  }

  // xDai
  if (chainId === 100) {
    return BigInt(38)
  }

  return BigInt(30)
}
