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

import { orgId } from '../chugsplash/Storage.config'

describe('Manager Upgrade', () => {
  let Stateless: Contract
  beforeEach(async () => {
    Stateless = await chugsplash.getContract('My First Project', 'Stateless')
    const signer = await hre.ethers.getImpersonatedSigner(
      OWNER_MULTISIG_ADDRESS
    )
    await hre.ethers.provider.send('hardhat_setBalance', [
      OWNER_MULTISIG_ADDRESS,
      '0x10000000000000000000',
    ])
    const registry = await getChugSplashRegistry(signer)
    await registry.addVersion(Stateless.address)
  })

  it('does upgrade chugsplash manager', async () => {
    const signer = hre.ethers.provider.getSigner()
    const managerProxyAddress = getChugSplashManagerAddress(orgId)

    const managerProxy = new Contract(
      managerProxyAddress,
      ChugSplashManagerProxyArtifact.abi,
      signer
    )

    await managerProxy.upgradeTo(Stateless.address)

    const StatelessManager = new Contract(
      managerProxy.address,
      Stateless.interface,
      signer
    )

    const version = await StatelessManager.version()
    expect(version.major).to.deep.equal(BigNumber.from(2))
  })
})
