import { expect } from 'chai'
import { Contract, ethers } from 'ethers'
import hre, { sphinx } from 'hardhat'
import {
  deployAbstractTask,
  ensureSphinxInitialized,
  getParsedConfig,
} from '@sphinx-labs/core'

import * as plugins from '../dist'
import { createSphinxRuntime } from '../src/cre'
import ChainOverrides, {
  ExpectedStateVariables,
  StateVariables,
  networks,
} from '../sphinx/ChainOverrides.config'
import { rpcProviders } from './constants'

const checkStateVariables = async (
  contract: Contract,
  expectedStateVariables: StateVariables
) => {
  expect((await contract.immutableUserDefinedType()).toString()).to.equal(
    expectedStateVariables.immutableUserDefinedType,
    'immutableUserDefinedType incorrect'
  )
  expect((await contract.immutableBigNumberUint()).toString()).to.equal(
    expectedStateVariables.immutableBigNumberUint.toString(),
    'immutableBigNumberUint incorrect'
  )
  expect((await contract.immutableBigNumberInt()).toString()).to.equal(
    expectedStateVariables.immutableBigNumberInt.toString(),
    'immutableBigNumberInt incorrect'
  )
  expect(await contract.immutableAddress()).to.equal(
    expectedStateVariables.immutableAddress,
    'immutableAddress incorrect'
  )
  expect(await contract.immutableContract()).to.equal(
    expectedStateVariables.immutableContract,
    'immutableContract incorrect'
  )
  expect((await contract.immutableEnum()).toString()).to.equal(
    expectedStateVariables.immutableEnum.toString(),
    'immutableEnum incorrect'
  )
}

const deploy = async (network: string) => {
  const provider = rpcProviders[network]
  const wallet = new ethers.Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    provider
  )
  const ownerAddress = await wallet.getAddress()

  const cre = createSphinxRuntime(
    'hardhat',
    false,
    hre.config.networks.hardhat.allowUnlimitedContractSize,
    true,
    hre.config.paths.compilerConfigs,
    hre,
    true
  )

  await ensureSphinxInitialized(provider, wallet)

  const compilerConfigPath = hre.config.paths.compilerConfigs
  const deploymentFolder = hre.config.paths.deployments

  const { parsedConfig, configCache, configArtifacts } = await getParsedConfig(
    ChainOverrides,
    provider,
    cre,
    plugins.makeGetConfigArtifacts(hre),
    ownerAddress
  )

  await deployAbstractTask(
    provider,
    wallet,
    compilerConfigPath,
    deploymentFolder,
    'hardhat',
    cre,
    parsedConfig,
    configCache,
    configArtifacts
  )
}

describe('ChainOverrides', () => {
  before(async () => {
    await Promise.all(networks.map((network) => deploy(network)))
  })

  it('Optimism Goerli has correct values', async () => {
    const networkName = 'optimism-goerli'
    const provider = rpcProviders[networkName]
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      await provider.getSigner()
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Arbitrum Goerli has correct values', async () => {
    const networkName = 'arbitrum-goerli'
    const provider = rpcProviders[networkName]
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      await provider.getSigner()
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Gnosis Chiado has correct values', async () => {
    const networkName = 'gnosis-chiado'
    const provider = rpcProviders[networkName]
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      await provider.getSigner()
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Base Goerli has correct values', async () => {
    const networkName = 'base-goerli'
    const provider = rpcProviders[networkName]
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      await provider.getSigner()
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Anvil has correct values', async () => {
    const networkName = 'anvil'
    const provider = rpcProviders[networkName]
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      await provider.getSigner()
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Goerli has correct values', async () => {
    const networkName = 'goerli'
    const provider = rpcProviders[networkName]
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      await provider.getSigner()
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })
})
