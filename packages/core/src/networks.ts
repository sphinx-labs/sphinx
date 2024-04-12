// Warning: The constants in this file are commonly imported from the frontend of the Sphinx Managed website.
// Be careful when importing external dependencies to this file because they may cause issues when this file
// is imported by the website.
import {
  DEPRECATED_SPHINX_NETWORKS,
  ExplorerName,
  SPHINX_LOCAL_NETWORKS,
  SPHINX_NETWORKS,
  SupportedNetwork,
} from '@sphinx-labs/contracts/dist/networks'

export type SupportedLocalNetworkName = 'anvil'

export const COMPILER_CONFIG_VERSION = '0.2.0'

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

export const networkEnumToName = (networkEnum: bigint | string | number) => {
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

export const fetchSupportedNetworkByName = (
  networkName: string
): SupportedNetwork => {
  const network = SPHINX_NETWORKS.find((n) => n.name === networkName)

  if (network) {
    return network
  } else {
    throw new Error(`Unsupported network name: ${networkName}`)
  }
}

export const fetchNameForDeprecatedNetwork = (chainId: bigint) => {
  const network = [...DEPRECATED_SPHINX_NETWORKS].find(
    (n) => n.chainId === chainId
  )

  if (network) {
    return network.name
  } else {
    return undefined
  }
}

export const fetchNameForNetwork = (chainId: bigint) => {
  const network = [...SPHINX_NETWORKS, ...SPHINX_LOCAL_NETWORKS].find(
    (n) => n.chainId === chainId
  )

  if (network) {
    return network.name
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

export const isSupportedTestNetwork = (chainId: bigint): boolean => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network) {
    return network.networkType === 'Testnet'
  } else {
    return false
  }
}

export const isSupportedProductionNetwork = (chainId: bigint): boolean => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network) {
    return network.networkType === 'Mainnet'
  } else {
    return false
  }
}

export const isActionTransactionBatchingEnabled = (
  chainId: bigint
): boolean => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network) {
    return network.actionTransactionBatching
  } else {
    return false
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

export const calculateMerkleLeafGas = (chainId: bigint, foundryGas: string) => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)

  if (network?.hardcodedMerkleLeafGas) {
    if (BigInt(foundryGas) > BigInt(network?.hardcodedMerkleLeafGas)) {
      throw new Error('Transaction too large to be executed')
    }

    return network.hardcodedMerkleLeafGas
  } else {
    return foundryGas
  }
}

export const isEtherscanSupportedForNetwork = (
  chainId: bigint,
  mockSphinxNetworks?: any
) => {
  const networks: Array<SupportedNetwork> =
    mockSphinxNetworks ?? SPHINX_NETWORKS
  const network = networks.find((n) => n.chainId === chainId)

  if (network) {
    return network.blockexplorers.etherscan !== undefined
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

export const isBlockscoutSupportedForNetwork = (
  chainId: bigint,
  mockSphinxNetworks?: any
) => {
  const networks: Array<SupportedNetwork> =
    mockSphinxNetworks ?? SPHINX_NETWORKS
  const network = networks.find((n) => n.chainId === chainId)

  if (network) {
    return network.blockexplorers.blockscout !== undefined
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

export const isVerificationSupportedForNetwork = (
  chainId: bigint,
  mockSphinxNetworks?: any
) => {
  return (
    isEtherscanSupportedForNetwork(chainId, mockSphinxNetworks) ||
    isBlockscoutSupportedForNetwork(chainId, mockSphinxNetworks)
  )
}

export const fetchEtherscanConfigForNetwork = (
  chainId: bigint,
  explorerName?: ExplorerName,
  mockSphinxNetworks?: any
) => {
  const networks: Array<SupportedNetwork> =
    mockSphinxNetworks ?? SPHINX_NETWORKS

  const network = networks.find((n) => n.chainId === chainId)

  if (!isVerificationSupportedForNetwork(chainId, mockSphinxNetworks)) {
    throw new Error(
      `verification is not supported on network with id: ${chainId}`
    )
  }

  if (network) {
    // If an explorer name was provided, then return the config for it no matter what
    if (explorerName) {
      if (explorerName === 'Blockscout') {
        return network.blockexplorers.blockscout
      } else if (explorerName === 'Etherscan') {
        return network.blockexplorers.etherscan
      } else {
        throw new Error('unsupported explorer name, should never happen')
      }
    } else {
      // If an explorer name was not provided, then return the first defined config
      // prioritizing etherscan
      if (network.blockexplorers.etherscan) {
        return network.blockexplorers.etherscan
      } else if (network.blockexplorers.blockscout) {
        return network.blockexplorers.blockscout
      } else {
        throw new Error(
          'Failed to find etherscan or blockscout config for network, should never happen'
        )
      }
    }
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

export const fetchCurrencyForNetwork = (chainId: bigint) => {
  const network = [...SPHINX_LOCAL_NETWORKS, ...SPHINX_NETWORKS].find(
    (n) => n.chainId === chainId
  )

  if (network) {
    return network.currency
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}

/**
 * Returns `true` if a live network RPC endpoint can be generated from the given `chainId` using the
 * available environment variables.
 */
export const isLiveNetworkRpcApiKeyDefined = (chainId: bigint): boolean => {
  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)
  if (!network) {
    return false
  }
  if (!process.env[network.rpcUrlId]) {
    return false
  }
  return true
}

export const fetchURLForNetwork = (chainId: bigint) => {
  if (process.env.RUNNING_LOCALLY === 'true') {
    return `http://127.0.0.1:${Number(
      BigInt(42000) + (chainId % BigInt(1000))
    )}`
  }

  // Enforce that live network tests only run if they're executed from a CI process with 'develop'
  // as the source branch, or if they're executed from a local machine. This ensures that we don't
  // accidentally run live network tests on feature branches in CI.
  const CIRCLE_BRANCH = process.env.CIRCLE_BRANCH
  if (typeof CIRCLE_BRANCH === 'string' && CIRCLE_BRANCH !== 'develop') {
    throw new Error(
      `You cannot use live network RPC endpoints in CI with a source branch that isn't 'develop'.`
    )
  }

  const network = SPHINX_NETWORKS.find((n) => n.chainId === chainId)
  if (network) {
    if (!process.env[network.rpcUrlId]) {
      throw new Error(`${network.rpcUrlId} key not defined`)
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

export const implementsEIP2028 = (chainId: bigint) => {
  const network = [...SPHINX_NETWORKS, ...SPHINX_LOCAL_NETWORKS].find(
    (n) => n.chainId === chainId
  )

  if (network) {
    return network.eip2028 ?? true
  } else {
    throw new Error(`Unsupported network id ${chainId}`)
  }
}
