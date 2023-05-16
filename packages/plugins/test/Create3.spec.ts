import { expect } from 'chai'
import { chugsplash } from 'hardhat'
import { Contract, ethers } from 'ethers'
import '@nomiclabs/hardhat-ethers'

describe('Create3', () => {
  let Stateless: Contract
  let StatelessWithSalt: Contract
  before(async () => {
    Stateless = await chugsplash.getContract('My First Project', 'Stateless')
    StatelessWithSalt = await chugsplash.getContract(
      'My First Project',
      'Stateless',
      '0x' + '11'.repeat(32)
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
