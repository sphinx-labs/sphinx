import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  DeploymentConfig,
  ExecutionMode,
  SphinxJsonRpcProvider,
  fetchURLForNetwork,
  fetchNameForNetwork,
  isFork,
  isLiveNetwork,
  NetworkConfig,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'

import {
  getAnvilRpcUrl,
  getGnosisSafeProxyAddress,
  killAnvilNodes,
  makeDeployment,
  makeStandardDeployment,
  startForkedAnvilNodes,
} from './common'
import { simulate } from '../../src/hardhat/simulate'

chai.use(chaiAsPromised)

describe('Simulate', () => {
  let networkConfigArray: Array<NetworkConfig>
  let deploymentConfig: DeploymentConfig

  before(async function () {
    // Skip the tests if the environment variable `CIRCLE_BRANCH` is defined and does not equal
    // 'develop', which enforces that these tests only run in CI when the source branch is
    // 'develop'. These tests will also run on local machines because the `CIRCLE_BRANCH`
    // environment variable isn't defined.
    const CIRCLE_BRANCH = process.env.CIRCLE_BRANCH
    if (typeof CIRCLE_BRANCH === 'string' && CIRCLE_BRANCH !== 'develop') {
      console.log('Skipping tests since this is not the develop branch')
      this.skip()
    }

    process.env['SPHINX_API_KEY'] = 'test-api-key'

    const ownerWallets = [
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    ].map((pk) => new ethers.Wallet(pk))
    const threshold = 3
    const safeAddress = getGnosisSafeProxyAddress(
      ownerWallets.map((o) => o.address),
      threshold,
      0
    )
    const { accountAccesses } = makeStandardDeployment(
      0,
      ExecutionMode.Platform,
      safeAddress
    )

    const productionNetworkNames = SPHINX_NETWORKS.filter(
      (n) => n.networkType === 'Mainnet'
    ).map((n) => n.name)
    const testnetNames = SPHINX_NETWORKS.filter(
      (n) => n.networkType === 'Testnet'
    ).map((n) => n.name)

    const deployment = await makeDeployment(
      0, // First deployment
      productionNetworkNames,
      testnetNames,
      'Project_Name',
      ownerWallets,
      threshold, // Threshold
      ExecutionMode.Platform,
      accountAccesses,
      fetchURLForNetwork
    )
    networkConfigArray = deployment.deploymentConfig.networkConfigs
    deploymentConfig = deployment.deploymentConfig
  })

  // The main purpose of this test is to check that there aren't conditions on live networks that
  // would always cause the simulation to fail. These conditions may not be captured when testing on
  // local nodes. For example, networks like Arbitrum Sepolia have a block gas limit that's several
  // orders of magniture higher than standard local nodes, which caused a bug in the simulation
  // logic.
  it('succeeds on every live supported network', async () => {
    const results = await Promise.allSettled(
      networkConfigArray.map((networkConfig) =>
        simulate(
          deploymentConfig,
          networkConfig.chainId,
          fetchURLForNetwork(BigInt(networkConfig.chainId))
        )
      )
    )

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const chainId = networkConfigArray[index].chainId
        const networkName = fetchNameForNetwork(BigInt(chainId))
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
    const ethereumChainId = BigInt(1)
    await startForkedAnvilNodes([ethereumChainId])

    const networkConfig = networkConfigArray.find(
      ({ chainId }) => chainId === ethereumChainId.toString()
    )
    if (!networkConfig) {
      throw new Error(`Could not find Ethereum NetworkConfig.`)
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
      deploymentConfig,
      networkConfig.chainId,
      getAnvilRpcUrl(ethereumChainId)
    )

    await killAnvilNodes([ethereumChainId])
  })
})
