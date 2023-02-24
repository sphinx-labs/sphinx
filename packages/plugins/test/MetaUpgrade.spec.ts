import * as path from 'path'

import '@nomiclabs/hardhat-ethers'

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
  chugsplashManagerConstructorArgs,
  chugsplashTransferOwnershipAbstractTask,
  getCreationCodeWithConstructorArgs,
  getImplAddress,
} from '@chugsplash/core'

import { getArtifactPaths } from '../dist/hardhat/artifacts'
import metaUpgradeConfig from '../chugsplash/hardhat/MetaUpgrade.config'
import { chugsplashDeployTask } from '../dist'

const configPath = 'chugsplash/hardhat/MetaUpgrade.config.ts'

describe('Meta Upgrade', () => {
  let owner: Signer
  let nonOwner: Signer
  let RootChugSplashManager: Contract
  let ChugSplashRegistry: Contract
  let artifactPaths: ArtifactPaths
  beforeEach(async () => {
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
  })

  it('upgrades the ChugSplashRegistry and ChugSplashManager', async () => {
    const { bytecode: managerBytecode, abi: managerAbi } =
      hre.artifacts.readArtifactSync('ChugSplashManager')
    const expectedManagerImplAddress = getImplAddress(
      'ChugSplash',
      'RootChugSplashManager',
      getCreationCodeWithConstructorArgs(
        managerBytecode,
        chugsplashManagerConstructorArgs,
        'RootChugSplashManager',
        managerAbi
      )
    )

    const oldName = 'Root Manager'
    const newName = 'New Name'
    expect(await RootChugSplashManager.connect(nonOwner).name()).equals(oldName)

    expect(await ChugSplashRegistry.managerImplementation()).does.not.equal(
      expectedManagerImplAddress
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

    expect(await RootChugSplashManager.connect(nonOwner).name()).equals(newName)

    expect(await ChugSplashRegistry.managerImplementation()).equals(
      expectedManagerImplAddress
    )

    // Next, we'll sanity check that a simple project can be deployed using the upgraded ChugSplash contracts.
    await chugsplashDeployTask(
      {
        configPath: 'chugsplash/hardhat/SimpleProject.config.ts',
        newOwner: await owner.getAddress(),
        ipfsUrl: '',
        silent: true,
        noCompile: false,
        confirm: true,
        noWithdraw: false,
        skipStorageCheck: true,
      },
      hre
    )

    const MyContract = await hre.chugsplash.getContract(
      'Simple Project',
      'MyContract'
    )
    expect(await MyContract.myStorage()).equals('0x' + '11'.repeat(20))
  })
})
