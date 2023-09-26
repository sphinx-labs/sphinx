import { expect } from 'chai'
import { Contract, ethers } from 'ethers'
import { sphinx } from 'hardhat'
import { ensureSphinxInitialized } from '@sphinx-labs/core'

import ChainOverrides, {
  ExpectedStateVariables,
  StateVariables,
  networks,
} from '../sphinx/ChainOverrides.config'
import { deployerPrivateKey, rpcProviders } from './constants'
import { deploy } from './helpers'

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

const deployerAddress = new ethers.Wallet(deployerPrivateKey).address

describe('ChainOverrides', () => {
  before(async () => {
    await Promise.all(
      networks.map(async (network) => {
        const provider = rpcProviders[network]
        const deployer = new ethers.Wallet(deployerPrivateKey, provider)
        await ensureSphinxInitialized(provider, deployer)
        await deploy(ChainOverrides, provider, deployerPrivateKey, 'hardhat')
      })
    )
  })

  it('Optimism Goerli has correct values', async () => {
    const networkName = 'optimism-goerli'
    const provider = rpcProviders[networkName]
    const signer = new ethers.JsonRpcSigner(provider, deployerAddress)
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      signer
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Arbitrum Goerli has correct values', async () => {
    const networkName = 'arbitrum-goerli'
    const provider = rpcProviders[networkName]
    const signer = new ethers.JsonRpcSigner(provider, deployerAddress)
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      signer
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Gnosis Chiado has correct values', async () => {
    const networkName = 'gnosis-chiado'
    const provider = rpcProviders[networkName]
    const signer = new ethers.JsonRpcSigner(provider, deployerAddress)
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      signer
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Base Goerli has correct values', async () => {
    const networkName = 'base-goerli'
    const provider = rpcProviders[networkName]
    const signer = new ethers.JsonRpcSigner(provider, deployerAddress)
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      signer
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Anvil has correct values', async () => {
    const networkName = 'anvil'
    const provider = rpcProviders[networkName]
    const signer = new ethers.JsonRpcSigner(provider, deployerAddress)
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      signer
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })

  it('Goerli has correct values', async () => {
    const networkName = 'goerli'
    const provider = rpcProviders[networkName]
    const signer = new ethers.JsonRpcSigner(provider, deployerAddress)
    const ChainOverridesContract = await sphinx.getContract(
      'ChainOverrides',
      'ChainOverrides',
      signer
    )

    const expectedStateVariables = ExpectedStateVariables[networkName]
    await checkStateVariables(ChainOverridesContract, expectedStateVariables)
  })
})
