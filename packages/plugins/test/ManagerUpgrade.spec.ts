import '@nomicfoundation/hardhat-ethers'
import '../dist' // Imports type extensions for hre.sphinx

import hre, { sphinx } from 'hardhat'
import { Contract } from 'ethers'
import { getSphinxManagerAddress, getSphinxRegistry } from '@sphinx-labs/core'
import {
  SphinxManagerProxyArtifact,
  OWNER_MULTISIG_ADDRESS,
} from '@sphinx-labs/contracts'
import { expect } from 'chai'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

const ownerAddress = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'
const projectName = 'ManagerUpgrade'

describe('Manager Upgrade', () => {
  let Stateless: Contract
  let Registry: Contract
  let owner: HardhatEthersSigner
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
    await Registry.addVersion(await Stateless.getAddress())
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

    await ManagerProxy.upgradeTo(await Stateless.getAddress())

    const StatelessManager = new Contract(
      managerProxyAddress,
      Stateless.interface,
      owner
    )

    const version = await StatelessManager.version()
    expect(version.major).to.deep.equal(BigInt(2))
  })
})
