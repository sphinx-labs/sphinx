import * as path from 'path'

// Hardhat plugins
import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import '../dist'

import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import {
  getChugSplashManagerProxyAddress,
  chugsplashRegisterAbstractTask,
  parseChugSplashConfig,
  chugsplashDeployAbstractTask,
  getEIP1967ProxyAdminAddress,
  getChugSplashManager,
  proxyTypeHashes,
} from '@chugsplash/core'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import * as ProxyAdminArtifact from '@openzeppelin/contracts/build/contracts/ProxyAdmin.json'

import {
  getArtifactPaths,
  importOpenZeppelinStorageLayouts,
} from '../src/hardhat/artifacts'
import uupsOwnableUpgradeConfig from '../chugsplash/hardhat/UUPSOwnableUpgradableUpgrade.config'
import uupsAccessControlUpgradeConfig from '../chugsplash/hardhat/UUPSAccessControlUpgradableUpgrade.config'
import transparentUpgradeConfig from '../chugsplash/hardhat/TransparentUpgradableUpgrade.config'

describe('Transfer', () => {
  let signer: SignerWithAddress
  before(async () => {
    const signers = await hre.ethers.getSigners()
    // Get the last signer. This ensures that the deployer of the OpenZeppelin proxies uses a
    // consistent nonce, which prevents a situation where the addresses of the proxies in this test
    // file don't match the addresses defined in the `externalProxy` field of the relevant
    // ChugSplash files.
    signer = signers[signers.length - 1]
  })

  it('did upgrade transparent proxy', async () => {
    const MyTokenV1 = await hre.ethers.getContractFactory(
      'TransparentUpgradableV1',
      signer
    )
    hre.upgrades.silenceWarnings()
    const TransparentUpgradableTokenV1 = await hre.upgrades.deployProxy(
      MyTokenV1
    )
    await TransparentUpgradableTokenV1.deployed()

    const provider = hre.ethers.provider

    // check owner is signer
    expect(await TransparentUpgradableTokenV1.owner()).to.equal(
      signer.address,
      'proxy owner is not signer'
    )

    // check deployed contract has expected field
    expect(await TransparentUpgradableTokenV1.originalInt()).to.deep.equal(
      BigNumber.from(0),
      'originalInt not set correctly'
    )

    const canonicalConfigPath = hre.config.paths.canonicalConfigs
    const deploymentFolder = hre.config.paths.deployments

    const artifactPaths = await getArtifactPaths(
      hre,
      transparentUpgradeConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )

    await chugsplashRegisterAbstractTask(
      provider,
      signer,
      await parseChugSplashConfig(
        provider,
        transparentUpgradeConfig,
        artifactPaths,
        'hardhat'
      ),
      signer.address,
      true,
      'hardhat'
    )

    const managerProxyAddress = getChugSplashManagerProxyAddress(
      transparentUpgradeConfig.options.projectName
    )

    const ProxyAdmin = await hre.ethers.getContractAt(
      ProxyAdminArtifact.abi,
      await getEIP1967ProxyAdminAddress(
        provider,
        TransparentUpgradableTokenV1.address
      ),
      signer
    )
    await ProxyAdmin.changeProxyAdmin(
      TransparentUpgradableTokenV1.address,
      managerProxyAddress
    )

    const configPath =
      './chugsplash/hardhat/TransparentUpgradableUpgrade.config.ts'
    const parsedConfig = await parseChugSplashConfig(
      provider,
      transparentUpgradeConfig,
      artifactPaths,
      'hardhat'
    )
    const openzeppelinStorageLayouts = await importOpenZeppelinStorageLayouts(
      hre,
      parsedConfig,
      transparentUpgradeConfig
    )

    await chugsplashDeployAbstractTask(
      provider,
      signer,
      configPath,
      true,
      false,
      '',
      true,
      true,
      true,
      signer.address,
      artifactPaths,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      true,
      hre.chugsplash.executor,
      openzeppelinStorageLayouts
    )

    const TransparentUpgradableTokenV2 = await hre.chugsplash.getContract(
      'Transparent Upgradable Token',
      'Token'
    )

    // check upgrade completed successfully
    expect(await TransparentUpgradableTokenV2.address).to.equal(
      TransparentUpgradableTokenV1.address,
      'contracts do not have the same address'
    )
    expect(await TransparentUpgradableTokenV2.newInt()).deep.equals(
      BigNumber.from(1)
    )
    expect(await TransparentUpgradableTokenV2.originalInt()).deep.equals(
      BigNumber.from(1)
    )
  })

  it('did upgrade UUPS Ownable proxy', async () => {
    const MyTokenV1 = await hre.ethers.getContractFactory(
      'UUPSOwnableUpgradableV1',
      signer
    )
    hre.upgrades.silenceWarnings()
    const UUPSUpgradableTokenV1 = await hre.upgrades.deployProxy(MyTokenV1, {
      kind: 'uups',
    })

    const provider = hre.ethers.provider

    // check owner is signer
    expect(await UUPSUpgradableTokenV1.owner()).to.equal(
      signer.address,
      'proxy owner is not signer'
    )

    // check deployed contract has expected field
    expect(await UUPSUpgradableTokenV1.originalInt()).to.deep.equal(
      BigNumber.from(0),
      'originalInt not set correctly'
    )

    const canonicalConfigPath = hre.config.paths.canonicalConfigs
    const deploymentFolder = hre.config.paths.deployments

    const artifactPaths = await getArtifactPaths(
      hre,
      uupsOwnableUpgradeConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )

    const parsedConfig = await parseChugSplashConfig(
      provider,
      uupsOwnableUpgradeConfig,
      artifactPaths,
      'hardhat'
    )

    await chugsplashRegisterAbstractTask(
      provider,
      signer,
      parsedConfig,
      signer.address,
      true,
      'hardhat'
    )

    const managerProxyAddress = getChugSplashManagerProxyAddress(
      uupsOwnableUpgradeConfig.options.projectName
    )

    await UUPSUpgradableTokenV1.transferOwnership(managerProxyAddress)

    // check owner is manager
    expect(await UUPSUpgradableTokenV1.owner()).to.equal(
      managerProxyAddress,
      'proxy owner is not chugsplash manager'
    )

    const configPath =
      './chugsplash/hardhat/UUPSOwnableUpgradableUpgrade.config.ts'
    const openzeppelinStorageLayouts = await importOpenZeppelinStorageLayouts(
      hre,
      parsedConfig,
      uupsOwnableUpgradeConfig
    )

    await chugsplashDeployAbstractTask(
      provider,
      signer,
      configPath,
      true,
      false,
      '',
      true,
      true,
      true,
      signer.address,
      artifactPaths,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      true,
      hre.chugsplash.executor,
      openzeppelinStorageLayouts
    )

    const UUPSUpgradableTokenV2 = await hre.chugsplash.getContract(
      uupsOwnableUpgradeConfig.options.projectName,
      'Token'
    )

    // check upgrade completed successfully
    expect(await UUPSUpgradableTokenV2.address).to.equal(
      UUPSUpgradableTokenV1.address,
      'contracts do not have the same address'
    )
    expect(await UUPSUpgradableTokenV2.newInt()).deep.equals(BigNumber.from(1))
    expect(await UUPSUpgradableTokenV2.originalInt()).deep.equals(
      BigNumber.from(1)
    )

    // test claim ownership
    const manager = await getChugSplashManager(
      signer,
      uupsOwnableUpgradeConfig.options.projectName
    )
    const proxyContract = await hre.chugsplash.getContract(
      uupsOwnableUpgradeConfig.options.projectName,
      'Token'
    )
    manager.claimProxyOwnership(
      proxyContract.address,
      proxyTypeHashes[parsedConfig.contracts['Token'].proxyType],
      signer.address
    )

    // check signer is owner again
    expect(await UUPSUpgradableTokenV2.owner()).to.equal(
      signer.address,
      'proxy owner is not signer'
    )
  })

  it('did upgrade UUPS Access Control proxy', async () => {
    const MyTokenV1 = await hre.ethers.getContractFactory(
      'UUPSAccessControlUpgradableV1',
      signer
    )
    hre.upgrades.silenceWarnings()
    const UUPSAccessControlUpgradableTokenV1 = await hre.upgrades.deployProxy(
      MyTokenV1,
      {
        kind: 'uups',
      }
    )

    const provider = hre.ethers.provider

    // check owner is signer
    expect(
      await UUPSAccessControlUpgradableTokenV1.hasRole(
        ethers.constants.HashZero,
        signer.address
      )
    ).to.equal(true, 'proxy owner is not signer')

    // check deployed contract has expected field
    expect(
      await UUPSAccessControlUpgradableTokenV1.originalInt()
    ).to.deep.equal(BigNumber.from(0), 'originalInt not set correctly')

    const canonicalConfigPath = hre.config.paths.canonicalConfigs
    const deploymentFolder = hre.config.paths.deployments

    const artifactPaths = await getArtifactPaths(
      hre,
      uupsAccessControlUpgradeConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )

    const parsedConfig = await parseChugSplashConfig(
      provider,
      uupsAccessControlUpgradeConfig,
      artifactPaths,
      'hardhat'
    )

    await chugsplashRegisterAbstractTask(
      provider,
      signer,
      parsedConfig,
      signer.address,
      true,
      'hardhat'
    )

    const managerProxyAddress = getChugSplashManagerProxyAddress(
      uupsAccessControlUpgradeConfig.options.projectName
    )

    await UUPSAccessControlUpgradableTokenV1.grantRole(
      ethers.constants.HashZero,
      managerProxyAddress
    )

    // check owner is manager
    expect(
      await UUPSAccessControlUpgradableTokenV1.hasRole(
        ethers.constants.HashZero,
        managerProxyAddress
      )
    ).to.equal(true, 'proxy owner is not chugsplash manager')

    const configPath =
      './chugsplash/hardhat/UUPSAccessControlUpgradableUpgrade.config.ts'
    const openzeppelinStorageLayouts = await importOpenZeppelinStorageLayouts(
      hre,
      parsedConfig,
      uupsAccessControlUpgradeConfig
    )

    await chugsplashDeployAbstractTask(
      provider,
      signer,
      configPath,
      true,
      false,
      '',
      true,
      true,
      true,
      signer.address,
      artifactPaths,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      true,
      hre.chugsplash.executor,
      openzeppelinStorageLayouts
    )

    const UUPSAccessControlUpgradableTokenV2 = await hre.chugsplash.getContract(
      uupsAccessControlUpgradeConfig.options.projectName,
      'Token'
    )

    // check upgrade completed successfully
    expect(await UUPSAccessControlUpgradableTokenV2.address).to.equal(
      UUPSAccessControlUpgradableTokenV1.address,
      'contracts do not have the same address'
    )
    expect(await UUPSAccessControlUpgradableTokenV2.newInt()).deep.equals(
      BigNumber.from(1)
    )
    expect(await UUPSAccessControlUpgradableTokenV2.originalInt()).deep.equals(
      BigNumber.from(1)
    )

    // test claiming back ownership
    const manager = await getChugSplashManager(
      signer,
      uupsAccessControlUpgradeConfig.options.projectName
    )
    const proxyContract = await hre.chugsplash.getContract(
      uupsAccessControlUpgradeConfig.options.projectName,
      'Token'
    )
    manager.claimProxyOwnership(
      proxyContract.address,
      proxyTypeHashes[parsedConfig.contracts['Token'].proxyType],
      signer.address
    )

    // check signer is owner again
    expect(
      await UUPSAccessControlUpgradableTokenV2.hasRole(
        ethers.constants.HashZero,
        signer.address
      )
    ).to.equal(true, 'proxy owner is not signer')

    await UUPSAccessControlUpgradableTokenV1.revokeRole(
      ethers.constants.HashZero,
      managerProxyAddress
    )

    // check manager is no longer owner
    expect(
      await UUPSAccessControlUpgradableTokenV2.hasRole(
        ethers.constants.HashZero,
        managerProxyAddress
      )
    ).to.equal(false, 'proxy owner is still chugsplash manager')
  })
})
