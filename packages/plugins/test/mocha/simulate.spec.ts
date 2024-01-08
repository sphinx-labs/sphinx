import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  ExecutionMode,
  ParsedConfig,
  SUPPORTED_MAINNETS,
  SUPPORTED_TESTNETS,
  SphinxJsonRpcProvider,
  fetchURLForNetwork,
  getNetworkNameForChainId,
  isFork,
  isLiveNetwork,
  toSupportedChainId,
  toSupportedNetworkName,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

import {
  getAnvilRpcUrl,
  killAnvilNodes,
  makeDeployment,
  makeStandardDeployment,
  startForkedAnvilNodes,
} from './common'
import { simulate } from '../../src/hardhat/simulate'

chai.use(chaiAsPromised)
const expect = chai.expect

describe('Simulate', () => {
  let parsedConfigArray: Array<ParsedConfig>

  before(async () => {
    process.env['SPHINX_API_KEY'] = 'test-api-key'

    const ownerWallets = [
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    ].map((pk) => new ethers.Wallet(pk))
    const { actionInputs } = makeStandardDeployment(0, ExecutionMode.Platform)

    const deployment = await makeDeployment(
      0, // First deployment
      Object.keys(SUPPORTED_MAINNETS).map(toSupportedNetworkName),
      Object.keys(SUPPORTED_TESTNETS).map(toSupportedNetworkName),
      'Project_Name',
      ownerWallets,
      3, // Threshold
      ExecutionMode.Platform,
      actionInputs,
      fetchURLForNetwork
    )
    parsedConfigArray = deployment.compilerConfigArray
  })

  // The main purpose of this test is to check that there aren't conditions on live networks that
  // would always cause the simulation to fail. These conditions may not be captured when testing on
  // local nodes. For example, networks like Arbitrum Sepolia have a block gas limit that's several
  // orders of magniture higher than standard local nodes, which caused a bug in the simulation
  // logic.
  it('succeeds on every live supported network', async () => {
    const results = await Promise.allSettled(
      parsedConfigArray.map((parsedConfig) =>
        simulate(
          parsedConfigArray,
          parsedConfig.chainId,
          fetchURLForNetwork(toSupportedChainId(Number(parsedConfig.chainId)))
        )
      )
    )

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const chainId = parsedConfigArray[index].chainId
        const networkName = getNetworkNameForChainId(BigInt(chainId))
        console.error(`Error on network ${networkName}:`, result.reason)
      }
    })

    // Check that all promises were resolved
    expect(results.every((result) => result.status === 'fulfilled')).to.be.true
  })

  // This test checks that we can simulate a deployment on an Anvil node that's forking Ethereum. We
  // added this test because we were previously receiving a `HeadersTimeoutError` originating from
  // undici, which is called by Hardhat during the simulation. The error was occurring because we
  // were fast-forwarding the block number on forked local nodes. It was only occurring ~50% of the
  // time in this situation for an unknown reason.
  it(`succeeds on anvil fork of ethereum`, async () => {
    const ethereumChainId = 1
    await startForkedAnvilNodes([ethereumChainId])

    const parsedConfig = parsedConfigArray.find(
      ({ chainId }) => chainId === ethereumChainId.toString()
    )
    if (!parsedConfig) {
      throw new Error(`Could not find Ethereum ParsedConfig.`)
    }

    // Get the Anvil RPC url, which is running the Ethereum fork.
    const rpcUrl = getAnvilRpcUrl(ethereumChainId)
    const provider = new SphinxJsonRpcProvider(rpcUrl)

    // Sanity check that the provider is targeting a forked network which isn't a live network.
    expect(await isFork(provider)).equals(true)
    expect(await isLiveNetwork(provider)).equals(false)

    // Run the simulation. If an error is thrown, the test will fail. We don't use `chaiAsPromised`
    // here because it truncates the error message if an error occurs.
    await simulate(
      [parsedConfig],
      parsedConfig.chainId,
      getAnvilRpcUrl(ethereumChainId)
    )

    await killAnvilNodes([ethereumChainId])
  })
})
