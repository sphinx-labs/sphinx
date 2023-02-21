import * as path from 'path'

import '@nomiclabs/hardhat-ethers'
import '../dist'

import { expect } from 'chai'
import hre from 'hardhat'
import {
  ChugSplashManagerABI,
  OWNER_MULTISIG_ADDRESS,
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
} from '@chugsplash/contracts'
import { Contract, Signer } from 'ethers'
import {
  chugsplashDeployAbstractTask,
  getChugSplashManager,
} from '@chugsplash/core'

import { getArtifactPaths } from '../dist/hardhat/artifacts'
import metaUpgradeConfig from '../chugsplash/meta-upgrade'

describe('Meta Upgrade', () => {
  let owner: Signer
  let nonOwner: Signer
  let RootChugSplashManager: Contract
  before(async () => {
    await hre.chugsplash.reset()

    owner = await hre.ethers.getImpersonatedSigner(OWNER_MULTISIG_ADDRESS)
    nonOwner = hre.ethers.provider.getSigner()
    RootChugSplashManager = await hre.ethers.getContractAt(
      ChugSplashManagerABI,
      ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS
    )
  })

  it('upgrades the root ChugSplashManager', async () => {
    const oldName = 'Root Manager'
    const newName = 'New Name'
    expect(await RootChugSplashManager.connect(nonOwner).name()).equals(oldName)

    const artifactPaths = await getArtifactPaths(
      hre,
      metaUpgradeConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )

    // We need to use the abstract task here so that we can pass in the owner as the signer
    await chugsplashDeployAbstractTask(
      hre.ethers.provider,
      owner,
      'chugsplash/meta-upgrade.ts',
      true,
      false,
      '',
      false,
      true,
      false,
      await owner.getAddress(),
      artifactPaths,
      hre.config.paths.canonicalConfigs,
      hre.config.paths.deployments,
      'hardhat',
      true,
      hre.chugsplash.executor
    )

    expect(await RootChugSplashManager.connect(nonOwner).name()).equals(newName)
  })
})
