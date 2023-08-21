import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { Contract } from 'ethers'
import '@nomicfoundation/hardhat-ethers'
import {
  UserConfig,
  deployAbstractTask,
  ensureSphinxInitialized,
  getParsedConfig,
  getSphinxManagerAddress,
  getTargetAddress,
} from '@sphinx-labs/core'

import * as plugins from '../dist'
import { createSphinxRuntime } from '../src/cre'

const projectName = 'Create3'
const referenceName = 'Stateless'

const userConfig: UserConfig = {
  projectName,
  contracts: {
    [referenceName]: {
      contract: 'Stateless',
      kind: 'immutable',
      constructorArgs: {
        _immutableUint: 2,
        _immutableAddress: ethers.ZeroAddress,
      },
    },
  },
}

describe('Create3', () => {
  let Stateless: Contract
  let StatelessWithSalt: Contract
  before(async () => {
    const owner = await ethers.provider.getSigner()

    const ownerAddress = await owner.getAddress()

    const provider = hre.ethers.provider

    const cre = createSphinxRuntime(
      'hardhat',
      false,
      hre.config.networks.hardhat.allowUnlimitedContractSize,
      true,
      hre.config.paths.compilerConfigs,
      hre,
      true
    )

    await ensureSphinxInitialized(provider, owner)

    const compilerConfigPath = hre.config.paths.compilerConfigs
    const deploymentFolder = hre.config.paths.deployments

    const { parsedConfig, configCache, configArtifacts } =
      await getParsedConfig(
        userConfig,
        provider,
        cre,
        plugins.makeGetConfigArtifacts(hre),
        ownerAddress
      )

    await deployAbstractTask(
      provider,
      owner,
      compilerConfigPath,
      deploymentFolder,
      'hardhat',
      cre,
      parsedConfig,
      configCache,
      configArtifacts
    )

    const salt = 1
    userConfig.contracts[referenceName].salt = salt
    const {
      parsedConfig: newParsedConfig,
      configCache: newConfigCache,
      configArtifacts: newConfigArtifacts,
    } = await getParsedConfig(
      userConfig,
      provider,
      cre,
      plugins.makeGetConfigArtifacts(hre),
      ownerAddress
    )

    await deployAbstractTask(
      provider,
      owner,
      compilerConfigPath,
      deploymentFolder,
      'hardhat',
      cre,
      newParsedConfig,
      newConfigCache,
      newConfigArtifacts
    )

    const managerAddress = getSphinxManagerAddress(ownerAddress, projectName)

    Stateless = await hre.ethers.getContractAt(
      'Stateless',
      getTargetAddress(managerAddress, referenceName),
      owner
    )
    StatelessWithSalt = await hre.ethers.getContractAt(
      'Stateless',
      getTargetAddress(managerAddress, referenceName, salt),
      owner
    )
  })

  it('has different address than contract without salt', async () => {
    expect(await Stateless.getAddress()).to.not.equal(
      await StatelessWithSalt.getAddress()
    )
  })

  it('does deploy immutable contract with salt', async () => {
    expect(await StatelessWithSalt.hello()).to.equal('Hello, world!')
    expect(await StatelessWithSalt.immutableUint()).to.deep.equal(BigInt(2))
  })
})
