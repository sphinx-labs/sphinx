import * as path from 'path'

// Hardhat plugins
import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import '../dist'

import { expect } from 'chai'
import hre from 'hardhat'
import {
  getChugSplashManagerProxyAddress,
  chugsplashRegisterAbstractTask,
  parseChugSplashConfig,
  chugsplashDeployAbstractTask,
} from '@chugsplash/core'
import { BigNumber } from 'ethers'

import { getArtifactPaths } from '../src/hardhat/artifacts'
import uupsRegisterConfig from '../chugsplash/hardhat/UUPSUpgradableRegister.config'
import uupsUpgradeConfig from '../chugsplash/hardhat/UUPSUpgradableUpgrade.config'
import transparentRegisterConfig from '../chugsplash/hardhat/TransparentUpgradableRegister.config'
import transparentUpgradeConfig from '../chugsplash/hardhat/TransparentUpgradableUpgrade.config'

describe('Transfer', () => {
  it('did upgrade transparent proxy', async () => {
    const MyTokenV1 = await hre.ethers.getContractFactory(
      'TransparentUpgradableV1'
    )
    hre.upgrades.silenceWarnings()
    const TransparentUpgradableTokenV1 = await hre.upgrades.deployProxy(
      MyTokenV1
    )
    await TransparentUpgradableTokenV1.deployed()

    const provider = hre.ethers.provider
    const signer = hre.ethers.provider.getSigner()
    const signerAddress = await signer.getAddress()

    // check owner is signer
    expect(await TransparentUpgradableTokenV1.owner()).to.equal(
      signerAddress,
      'proxy owner is not signer'
    )

    // check deployed contract has expected field
    expect(await TransparentUpgradableTokenV1.originalInt()).to.deep.equal(
      BigNumber.from(0),
      'originalInt not set correctly'
    )

    const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
    const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
    const canonicalConfigPath = hre.config.paths.canonicalConfigs
    const deploymentFolder = hre.config.paths.deployments

    const artifactPaths = await getArtifactPaths(
      hre,
      transparentUpgradeConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )

    console.log('parsing in test')
    const parsedConfig = await parseChugSplashConfig(
      provider,
      transparentRegisterConfig,
      artifactPaths,
      'hardhat'
    )
    console.log('done parsing in test')

    await chugsplashRegisterAbstractTask(
      provider,
      signer,
      parsedConfig,
      signerAddress,
      true,
      'hardhat'
    )

    const managerProxyAddress = getChugSplashManagerProxyAddress(
      transparentRegisterConfig.options.projectName
    )

    await hre.upgrades.admin.changeProxyAdmin(
      TransparentUpgradableTokenV1.address,
      managerProxyAddress
    )

    await chugsplashDeployAbstractTask(
      provider,
      signer,
      './chugsplash/hardhat/TransparentUpgradableUpgrade.config.ts',
      true,
      false,
      '',
      true,
      true,
      true,
      signerAddress,
      artifactPaths,
      buildInfoFolder,
      artifactFolder,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      true,
      hre.chugsplash.executor
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

  it('did upgrade UUPS proxy', async () => {
    const MyTokenV1 = await hre.ethers.getContractFactory('UUPSUpgradableV1')
    hre.upgrades.silenceWarnings()
    const UUPSUpgradableTokenV1 = await hre.upgrades.deployProxy(MyTokenV1, {
      kind: 'uups',
    })

    const provider = hre.ethers.provider
    const signer = hre.ethers.provider.getSigner()
    const signerAddress = await signer.getAddress()

    // check owner is signer
    expect(await UUPSUpgradableTokenV1.owner()).to.equal(
      signerAddress,
      'proxy owner is not signer'
    )

    // check deployed contract has expected field
    expect(await UUPSUpgradableTokenV1.originalInt()).to.deep.equal(
      BigNumber.from(0),
      'originalInt not set correctly'
    )

    const buildInfoFolder = path.join(hre.config.paths.artifacts, 'build-info')
    const artifactFolder = path.join(hre.config.paths.artifacts, 'contracts')
    const canonicalConfigPath = hre.config.paths.canonicalConfigs
    const deploymentFolder = hre.config.paths.deployments

    const artifactPaths = await getArtifactPaths(
      hre,
      uupsUpgradeConfig.contracts,
      hre.config.paths.artifacts,
      path.join(hre.config.paths.artifacts, 'build-info')
    )

    const parsedConfig = await parseChugSplashConfig(
      provider,
      uupsRegisterConfig,
      artifactPaths,
      'hardhat'
    )

    await chugsplashRegisterAbstractTask(
      provider,
      signer,
      parsedConfig,
      signerAddress,
      true,
      'hardhat'
    )

    const managerProxyAddress = getChugSplashManagerProxyAddress(
      uupsRegisterConfig.options.projectName
    )

    await UUPSUpgradableTokenV1.transferOwnership(managerProxyAddress)

    // check owner is manager
    expect(await UUPSUpgradableTokenV1.owner()).to.equal(
      managerProxyAddress,
      'proxy owner is not chugsplash manager'
    )

    await chugsplashDeployAbstractTask(
      provider,
      signer,
      './chugsplash/hardhat/UUPSUpgradableUpgrade.config.ts',
      true,
      false,
      '',
      true,
      true,
      true,
      signerAddress,
      artifactPaths,
      buildInfoFolder,
      artifactFolder,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      true,
      hre.chugsplash.executor
    )

    const UUPSUpgradableTokenV2 = await hre.chugsplash.getContract(
      'UUPS Upgradable Token',
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
  })
})
