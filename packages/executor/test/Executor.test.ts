import '@chugsplash/plugins'

import hre, { chugsplash } from 'hardhat'
import { Contract } from 'ethers'
import {
  chugsplashApproveAbstractTask,
  chugsplashClaimAbstractTask,
  chugsplashFundAbstractTask,
  chugsplashProposeAbstractTask,
  readUnvalidatedChugSplashConfig,
  readValidatedChugSplashConfig,
} from '@chugsplash/core'
import { expect } from 'chai'
import { getConfigArtifacts } from '@chugsplash/plugins/src/hardhat/artifacts'

import { createChugSplashRuntime } from '../../plugins/src/utils'

const configPath = './chugsplash/ExecutorTest.config.ts'

describe('Remote Execution', () => {
  let Proxy: Contract
  let NonProxy: Contract
  before(async () => {
    const provider = hre.ethers.provider
    const signer = provider.getSigner()
    const signerAddress = await signer.getAddress()
    const canonicalConfigPath = hre.config.paths.canonicalConfigs
    const deploymentFolder = hre.config.paths.deployments

    const userConfig = await readUnvalidatedChugSplashConfig(configPath)

    const configArtifacts = await getConfigArtifacts(hre, userConfig.contracts)

    const cre = await createChugSplashRuntime(
      configPath,
      true,
      true,
      hre.config.paths.canonicalConfigs,
      hre,
      // if the config parsing fails and exits with code 1, you should flip this to false to see verbose output
      false
    )

    const parsedConfig = await readValidatedChugSplashConfig(
      provider,
      configPath,
      configArtifacts,
      'hardhat',
      cre,
      true
    )

    // claim
    await chugsplashClaimAbstractTask(
      provider,
      signer,
      parsedConfig,
      true,
      signerAddress,
      'hardhat',
      cre
    )

    // fund
    await chugsplashFundAbstractTask(
      provider,
      signer,
      configPath,
      configArtifacts,
      'hardhat',
      parsedConfig,
      cre
    )

    await chugsplashProposeAbstractTask(
      provider,
      signer,
      parsedConfig,
      configPath,
      '',
      'hardhat',
      configArtifacts,
      canonicalConfigPath,
      cre,
      false
    )

    // approve
    await chugsplashApproveAbstractTask(
      provider,
      signer,
      configPath,
      false,
      configArtifacts,
      'hardhat',
      canonicalConfigPath,
      deploymentFolder,
      parsedConfig,
      cre
    )

    Proxy = await chugsplash.getContract(
      parsedConfig.options.projectName,
      'ExecutorProxyTest'
    )

    NonProxy = await chugsplash.getContract(
      parsedConfig.options.projectName,
      'ExecutorNonProxyTest'
    )
  })

  it('does deploy proxied contract remotely', async () => {
    expect(await Proxy.number()).to.equal(1)
    expect(await Proxy.stored()).to.equal(true)
    expect(await Proxy.storageName()).to.equal('First')
    expect(await Proxy.otherStorage()).to.equal(
      '0x1111111111111111111111111111111111111111'
    )
  })

  it('does deploy non-proxy contract remotely', async () => {
    expect(await NonProxy.val()).equals(1)
  })
})
