import '@nomiclabs/hardhat-ethers'

import hre, { chugsplash } from 'hardhat'
import { BigNumber, Contract, Signer } from 'ethers'
import {
  getChugSplashManagerAddress,
  getChugSplashRegistry,
} from '@chugsplash/core'
import {
  ChugSplashManagerProxyArtifact,
  OWNER_MULTISIG_ADDRESS,
} from '@chugsplash/contracts'
import { expect } from 'chai'

const ownerAddress = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'

describe('Manager Upgrade', () => {
  let Stateless: Contract
  let Registry: Contract
  let owner: Signer
  beforeEach(async () => {
    owner = await hre.ethers.getSigner(ownerAddress)
    Stateless = await chugsplash.getContract(
      'ManagerUpgrade',
      'Stateless',
      owner
    )
    const signer = await hre.ethers.getImpersonatedSigner(
      OWNER_MULTISIG_ADDRESS
    )
    await hre.ethers.provider.send('hardhat_setBalance', [
      OWNER_MULTISIG_ADDRESS,
      '0x10000000000000000000',
    ])
    Registry = getChugSplashRegistry(signer)
    await Registry.addVersion(Stateless.address)
  })

  it('does upgrade chugsplash manager', async () => {
    const managerProxyAddress = getChugSplashManagerAddress(
      await owner.getAddress()
    )

    const ManagerProxy = new Contract(
      managerProxyAddress,
      ChugSplashManagerProxyArtifact.abi,
      owner
    )

    await ManagerProxy.upgradeTo(Stateless.address)

    const StatelessManager = new Contract(
      ManagerProxy.address,
      Stateless.interface,
      owner
    )

    const version = await StatelessManager.version()
    expect(version.major).to.deep.equal(BigNumber.from(2))
  })
})
