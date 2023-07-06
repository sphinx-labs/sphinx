import { expect } from 'chai'
import { chugsplash, ethers } from 'hardhat'
import { Contract } from 'ethers'
import '@nomiclabs/hardhat-ethers'

describe('Create3', () => {
  let Stateless: Contract
  let StatelessWithSalt: Contract
  before(async () => {
    const owner = ethers.provider.getSigner()
    Stateless = await chugsplash.getContract('Storage', 'Stateless', owner)
    StatelessWithSalt = await chugsplash.getContract(
      'Create3',
      'Stateless',
      owner,
      1
    )
  })

  it('has different address than contract without salt', () => {
    expect(Stateless.address).to.not.equal(StatelessWithSalt.address)
  })

  it('does deploy non-proxy contract with salt', async () => {
    expect(await StatelessWithSalt.hello()).to.equal('Hello, world!')
    expect(await StatelessWithSalt.immutableUint()).to.deep.equal(
      ethers.BigNumber.from(2)
    )
  })
})
