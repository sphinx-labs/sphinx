import * as path from 'path'

import '@nomiclabs/hardhat-ethers'
import '../dist'

import { expect } from 'chai'
import hre from 'hardhat'
import {
  ChugSplashManagerABI,
  ChugSplashRegistryProxyABI,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  OWNER_MULTISIG_ADDRESS,
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
} from '@chugsplash/contracts'
import { Contract, Signer } from 'ethers'
import {
  ArtifactPaths,
  chugsplashDeployAbstractTask,
  chugsplashTransferOwnershipAbstractTask,
} from '@chugsplash/core'

import { getArtifactPaths } from '../dist/hardhat/artifacts'
import metaUpgradeConfig from '../chugsplash/meta-upgrade'

const configPath = 'chugsplash/meta-upgrade.ts'

describe('Meta Upgrade', () => {
  let owner: Signer
  let nonOwner: Signer
  let RootChugSplashManager: Contract
  let ChugSplashRegistry: Contract
  let artifactPaths: ArtifactPaths
  before(async () => {
    await hre.chugsplash.reset()

    nonOwner = hre.ethers.provider.getSigner()
    owner = await hre.ethers.getImpersonatedSigner(OWNER_MULTISIG_ADDRESS)

    // Send funds to the owner's address, since its balance is zero on the Hardhat network
    await nonOwner.sendTransaction({
      to: await owner.getAddress(),
      value: hre.ethers.utils.parseEther('10'), // 10 ETH
    })

    RootChugSplashManager = await hre.ethers.getContractAt(
      ChugSplashManagerABI,
      ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS
    )
    ChugSplashRegistry = await hre.ethers.getContractAt(
      ChugSplashRegistryProxyABI,
      CHUGSPLASH_REGISTRY_PROXY_ADDRESS
    )

    artifactPaths = await getArtifactPaths(
      hre,
      metaUpgradeConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )
  })

  it.only('upgrades the root ChugSplashManager', async () => {
    const oldName = 'Root Manager'
    const newName = 'New Name'
    expect(await RootChugSplashManager.connect(nonOwner).name()).equals(oldName)

    // We need to use the abstract task here so that we can pass in the owner as the signer
    await chugsplashDeployAbstractTask(
      hre.ethers.provider,
      owner,
      configPath,
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

  // TODO: rm
  it('upgrades the ChugSplashRegistry', async () => {
    const managerReferenceName = 'RootChugSplashManager'
    const creationCodeWithConstructorArgs = getCreationCodeWithConstructorArgs(
      ChugSplashManager.bytecode,
      parseConfigVariables(rootManagerConfig.constructorArgs),
      managerReferenceName,
      managerArtifact.abi
    )
    const managerImplAddress = getImplAddress(
      projectName,
      managerReferenceName,
      creationCodeWithConstructorArgs
    )

    if (!expectedManagerImplAddress) {
      throw new Error(
        `Could not find root ChugSplashManager's implementation address`
      )
    }
    expect(await ChugSplashRegistry.managerImplementation()).does.not.equal(
      expectedManagerImplAddress
    )

    // Transfer ownership of the ChugSplashRegistry's proxy from the owner to the root
    // ChugSplashManager.
    await chugsplashTransferOwnershipAbstractTask(
      hre.ethers.provider,
      owner,
      configPath,
      CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
      true,
      artifactPaths,
      'hardhat'
    )

    // We need to use the abstract task here so that we can pass in the owner as the signer
    await chugsplashDeployAbstractTask(
      hre.ethers.provider,
      owner,
      configPath,
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

    expect(await ChugSplashRegistry.managerImplementation()).equals(
      expectedManagerImplAddress
    )
  })
})
