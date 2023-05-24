import '@chugsplash/plugins'

import hre, { chugsplash } from 'hardhat'
import { Contract } from 'ethers'
import {
  ProposalRoute,
  chugsplashApproveAbstractTask,
  chugsplashClaimAbstractTask,
  chugsplashFundAbstractTask,
  chugsplashProposeAbstractTask,
  readValidatedChugSplashConfig,
} from '@chugsplash/core'
import { expect } from 'chai'
import { makeGetConfigArtifacts } from '@chugsplash/plugins/src/hardhat/artifacts'

import { createChugSplashRuntime } from '../../plugins/src/cre'

const configPath = './chugsplash/ExecutorTest.config.ts'

describe('Remote Execution', () => {
  if (!process.env.IPFS_API_KEY_SECRET || !process.env.IPFS_PROJECT_ID) {
    throw new Error(
      'IPFS_API_KEY_SECRET and IPFS_PROJECT_ID must be set to run automated executor tests'
    )
  }

  let Proxy: Contract
  let Immutable: Contract
  before(async () => {
    const provider = hre.ethers.provider
    const signer = provider.getSigner()
    const signerAddress = await signer.getAddress()

    const cre = await createChugSplashRuntime(
      true,
      true,
      hre.config.paths.canonicalConfigs,
      hre,
      // if the config parsing fails and exits with code 1, you should flip this to false to see verbose output
      true
    )

    const { parsedConfig, configArtifacts, configCache } =
      await readValidatedChugSplashConfig(
        configPath,
        provider,
        cre,
        makeGetConfigArtifacts(hre)
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
      configCache,
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
      ProposalRoute.REMOTE_EXECUTION,
      cre,
      configCache
    )

    // approve
    await chugsplashApproveAbstractTask(
      configCache,
      provider,
      signer,
      configPath,
      false,
      configArtifacts,
      'hardhat',
      parsedConfig,
      cre
    )

    Proxy = await chugsplash.getContract(
      parsedConfig.options.projectName,
      'ExecutorProxyTest'
    )

    Immutable = await chugsplash.getContract(
      parsedConfig.options.projectName,
      'ExecutorImmutableTest'
    )
  })

  it.only('does deploy proxied contract remotely', async () => {
    expect(await Proxy.number()).to.equal(1)
    expect(await Proxy.stored()).to.equal(true)
    expect(await Proxy.storageName()).to.equal('First')
    expect(await Proxy.otherStorage()).to.equal(
      '0x1111111111111111111111111111111111111111'
    )
  })

  it('does deploy non-proxy contract remotely', async () => {
    expect(await Immutable.val()).equals(1)
  })
})
