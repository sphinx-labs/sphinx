// Hardhat plugins
import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import '../dist'

import { expect } from 'chai'
import hre, { chugsplash } from 'hardhat'
import {
  getChugSplashManagerAddress,
  chugsplashDeployAbstractTask,
  getEIP1967ProxyAdminAddress,
  getChugSplashManager,
  contractKindHashes,
  readValidatedChugSplashConfig,
  readUserChugSplashConfig,
  chugsplashClaimAbstractTask,
  FailureAction,
} from '@chugsplash/core'
import { BigNumber, ethers, providers } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import * as ProxyAdminArtifact from '@openzeppelin/contracts/build/contracts/ProxyAdmin.json'
import ora from 'ora'

import { createChugSplashRuntime } from '../src/cre'
import { makeGetConfigArtifacts } from '../src/hardhat/artifacts'
const configPath = './chugsplash/proxies.config.ts'
import { projectName as transparentName } from '../chugsplash/projects/proxies/TransparentUpgradableUpgrade.config'
import { projectName as accessControlName } from '../chugsplash/projects/proxies/UUPSAccessControlUpgradableUpgrade.config'
import { projectName as ownableName } from '../chugsplash/projects/proxies/UUPSOwnableUpgradableUpgrade.config'

describe('Transfer', () => {
  let signer: SignerWithAddress
  let claimer: providers.JsonRpcSigner
  before(async () => {
    const signers = await hre.ethers.getSigners()
    claimer = hre.ethers.provider.getSigner()
    // Get the last signer. This ensures that the deployer of the OpenZeppelin proxies uses a
    // consistent nonce, which prevents a situation where the addresses of the proxies in this test
    // file don't match the addresses defined in the `address` field of the relevant
    // ChugSplash config files.
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

    const userConfig = await readUserChugSplashConfig(configPath)

    const cre = await createChugSplashRuntime(
      false,
      true,
      hre.config.paths.canonicalConfigs,
      hre,
      // if the config parsing fails and exits with code 1, you should flip this to false to see verbose output
      true,
      process.stdout
    )

    await chugsplashClaimAbstractTask(
      provider,
      claimer,
      userConfig,
      false,
      await claimer.getAddress(),
      'hardhat',
      cre
    )

    const managerAddress = getChugSplashManagerAddress(
      userConfig.options.organizationID
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
      managerAddress
    )

    const { parsedConfig, configArtifacts, configCache } =
      await readValidatedChugSplashConfig(
        configPath,
        transparentName,
        provider,
        cre,
        makeGetConfigArtifacts(hre),
        FailureAction.THROW
      )

    const spinner = ora({ isSilent: cre.silent, stream: cre.stream })

    await chugsplashDeployAbstractTask(
      provider,
      claimer,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      cre,
      parsedConfig.projects[transparentName],
      configCache[transparentName],
      configArtifacts[transparentName],
      undefined,
      spinner
    )

    const TransparentUpgradableTokenV2 = await chugsplash.getContract(
      transparentName,
      'Token'
    )

    // check upgrade completed successfully
    expect(TransparentUpgradableTokenV2.address).to.equal(
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

    const userConfig = await readUserChugSplashConfig(configPath)

    const cre = await createChugSplashRuntime(
      false,
      true,
      hre.config.paths.canonicalConfigs,
      hre,
      // if the config parsing fails and exits with code 1, you should flip this to false to see verbose output
      true,
      process.stdout
    )

    const managerAddress = getChugSplashManagerAddress(
      userConfig.options.organizationID
    )

    await UUPSUpgradableTokenV1.transferOwnership(managerAddress)

    // check owner is manager
    expect(await UUPSUpgradableTokenV1.owner()).to.equal(
      managerAddress,
      'proxy owner is not chugsplash manager'
    )

    const { parsedConfig, configArtifacts, configCache } =
      await readValidatedChugSplashConfig(
        configPath,
        ownableName,
        provider,
        cre,
        makeGetConfigArtifacts(hre),
        FailureAction.THROW
      )

    await chugsplashDeployAbstractTask(
      provider,
      claimer,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      cre,
      parsedConfig.projects[ownableName],
      configCache[ownableName],
      configArtifacts[ownableName],
      undefined
    )

    const UUPSUpgradableTokenV2 = await hre.ethers.getContractAt(
      'UUPSOwnableUpgradableV2',
      UUPSUpgradableTokenV1.address
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
    const manager = getChugSplashManager(
      claimer,
      parsedConfig.options.organizationID
    )

    await manager.exportProxy(
      UUPSUpgradableTokenV2.address,
      contractKindHashes[
        parsedConfig.projects[ownableName].contracts['Token'].kind
      ],
      await claimer.getAddress()
    )

    // check signer is owner again
    expect(await UUPSUpgradableTokenV2.owner()).to.equal(
      await claimer.getAddress(),
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

    const userConfig = await readUserChugSplashConfig(configPath)

    const cre = await createChugSplashRuntime(
      false,
      true,
      hre.config.paths.canonicalConfigs,
      hre,
      // if the config parsing fails and exits with code 1, you should flip this to false to see verbose output
      true,
      process.stdout
    )

    const managerAddress = getChugSplashManagerAddress(
      userConfig.options.organizationID
    )

    await UUPSAccessControlUpgradableTokenV1.grantRole(
      ethers.constants.HashZero,
      managerAddress
    )

    // check owner is manager
    expect(
      await UUPSAccessControlUpgradableTokenV1.hasRole(
        ethers.constants.HashZero,
        managerAddress
      )
    ).to.equal(true, 'proxy owner is not chugsplash manager')

    const { parsedConfig, configArtifacts, configCache } =
      await readValidatedChugSplashConfig(
        configPath,
        accessControlName,
        provider,
        cre,
        makeGetConfigArtifacts(hre),
        FailureAction.THROW
      )

    await chugsplashDeployAbstractTask(
      provider,
      claimer,
      canonicalConfigPath,
      deploymentFolder,
      'hardhat',
      cre,
      parsedConfig.projects[accessControlName],
      configCache[accessControlName],
      configArtifacts[accessControlName],
      undefined
    )

    const UUPSAccessControlUpgradableTokenV2 = await hre.ethers.getContractAt(
      'UUPSAccessControlUpgradableV2',
      UUPSAccessControlUpgradableTokenV1.address
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
    const manager = getChugSplashManager(
      claimer,
      parsedConfig.options.organizationID
    )
    await manager.exportProxy(
      UUPSAccessControlUpgradableTokenV2.address,
      contractKindHashes[
        parsedConfig.projects[accessControlName].contracts['Token'].kind
      ],
      await claimer.getAddress()
    )

    // check signer is owner again
    expect(
      await UUPSAccessControlUpgradableTokenV2.hasRole(
        ethers.constants.HashZero,
        await claimer.getAddress()
      )
    ).to.equal(true, 'proxy owner is not signer')

    await UUPSAccessControlUpgradableTokenV1.revokeRole(
      ethers.constants.HashZero,
      managerAddress
    )

    // check manager is no longer owner
    expect(
      await UUPSAccessControlUpgradableTokenV2.hasRole(
        ethers.constants.HashZero,
        managerAddress
      )
    ).to.equal(false, 'proxy owner is still chugsplash manager')
  })
})
