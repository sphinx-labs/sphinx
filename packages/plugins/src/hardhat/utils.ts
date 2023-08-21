import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import { SphinxJsonRpcProvider, isHttpNetworkConfig } from '@sphinx-labs/core'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

/**
 * @notice Gets the provider object, which is a `HardhatEthersProvider` on the in-process Hardhat
 * network or a `SphinxJsonRpcProvider` otherwise. We don't use a `HardhatEthersProvider` on live
 * networks because it doesn't include the built-in NetworkPlugins that EthersJS provides.
 * Particularly, the `HardhatEthersProvider` cannot submit transactions on Polygon Mainnet because
 * it doesn't include the `GasStationPlugin`, which calculates the correct gas price on this
 * network.
 */
export const getProvider = (
  hre: HardhatRuntimeEnvironment
): SphinxJsonRpcProvider | HardhatEthersProvider => {
  return isHttpNetworkConfig(hre.network.config)
    ? new SphinxJsonRpcProvider(hre.network.config.url)
    : hre.ethers.provider
}
