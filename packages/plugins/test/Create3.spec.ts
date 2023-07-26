import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { Contract } from 'ethers'
import '@nomiclabs/hardhat-ethers'
import {
  UserConfig,
  deployAbstractTask,
  ensureSphinxInitialized,
  getParsedConfig,
  getSphinxManagerAddress,
  getTargetAddress,
} from '@sphinx/core'

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
        _immutableAddress: ethers.constants.AddressZero,
      },
    },
  },
}

describe('Create3', () => {
  let Stateless: Contract
  let StatelessWithSalt: Contract
  before(async () => {
    const owner = ethers.provider.getSigner()

    const ownerAddress = await owner.getAddress()

    const provider = hre.ethers.provider

    const cre = createSphinxRuntime(
      'hardhat',
      false,
      true,
      hre.config.paths.compilerConfigs,
      hre,
      true
    )

    await ensureSphinxInitialized(provider, provider.getSigner())

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

  it('has different address than contract without salt', () => {
    expect(Stateless.address).to.not.equal(StatelessWithSalt.address)
  })

  it('does deploy immutable contract with salt', async () => {
    expect(await StatelessWithSalt.hello()).to.equal('Hello, world!')
    expect(await StatelessWithSalt.immutableUint()).to.deep.equal(
      ethers.BigNumber.from(2)
    )
  })
})
