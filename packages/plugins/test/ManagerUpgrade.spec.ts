import '@nomiclabs/hardhat-ethers'
import '../dist' // Imports type extensions for hre.sphinx

import hre, { sphinx } from 'hardhat'
import { BigNumber, Contract, Signer } from 'ethers'
import { getSphinxManagerAddress, getSphinxRegistry } from '@sphinx/core'
import {
  SphinxManagerProxyArtifact,
  OWNER_MULTISIG_ADDRESS,
} from '@sphinx/contracts'
import { expect } from 'chai'

const ownerAddress = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'
const projectName = 'ManagerUpgrade'

describe('Manager Upgrade', () => {
  let Stateless: Contract
  let Registry: Contract
  let owner: Signer
  beforeEach(async () => {
    owner = await hre.ethers.getSigner(ownerAddress)
    Stateless = await sphinx.getContract(projectName, 'Stateless', owner)
    const signer = await hre.ethers.getImpersonatedSigner(
      OWNER_MULTISIG_ADDRESS
    )
    await hre.ethers.provider.send('hardhat_setBalance', [
      OWNER_MULTISIG_ADDRESS,
      '0x10000000000000000000',
    ])
    Registry = getSphinxRegistry(signer)
    await Registry.addVersion(Stateless.address)
  })

  it('does upgrade sphinx manager', async () => {
    const managerProxyAddress = getSphinxManagerAddress(
      await owner.getAddress(),
      projectName
    )

    const ManagerProxy = new Contract(
      managerProxyAddress,
      SphinxManagerProxyArtifact.abi,
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
