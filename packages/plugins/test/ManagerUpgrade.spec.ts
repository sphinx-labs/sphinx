import '@nomiclabs/hardhat-ethers'

import hre, { chugsplash } from 'hardhat'
import { BigNumber, Contract } from 'ethers'
import {
  getChugSplashManagerAddress,
  getChugSplashRegistry,
} from '@chugsplash/core'
import {
  ChugSplashManagerProxyArtifact,
  OWNER_MULTISIG_ADDRESS,
} from '@chugsplash/contracts'
import { expect } from 'chai'

import { owner } from '../chugsplash/manager-upgrade.config'

describe('Manager Upgrade', () => {
  let Stateless: Contract
  let Registry: Contract
  beforeEach(async () => {
    Stateless = await chugsplash.getContract('ManagerUpgrade', 'Stateless')
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
    const signer = await hre.ethers.getSigner(owner)
    const managerProxyAddress = getChugSplashManagerAddress(owner)

    const ManagerProxy = new Contract(
      managerProxyAddress,
      ChugSplashManagerProxyArtifact.abi,
      signer
    )

    await ManagerProxy.upgradeTo(Stateless.address)

    const StatelessManager = new Contract(
      ManagerProxy.address,
      Stateless.interface,
      signer
    )

    const version = await StatelessManager.version()
    expect(version.major).to.deep.equal(BigNumber.from(2))
  })
})
