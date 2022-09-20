/* eslint-disable */
const { expect } = require("chai")
const { ethers } = require("hardhat")

describe('test', () => {
  let signer
  before(async () => {
    signer = await ethers.getSigner()
  })

  beforeEach(async () => {
    await chugsplash.reset()
  })

  let MyToken2
  beforeEach(async () => {
    MyToken2 = await chugsplash.getContract('MyToken')
    await MyToken2.mint(signer.address, 100)
  })

  it('works', async () => {
    expect(await MyToken2.balanceOf(signer.address)).deep.equals(ethers.BigNumber.from(100))
  })

  it('works again', async () => {
    expect(await MyToken2.balanceOf(signer.address)).deep.equals(ethers.BigNumber.from(100))
  })

  it('works again again', async () => {
    await MyToken2.mint(signer.address, 50)

    expect(await MyToken2.balanceOf(signer.address)).deep.equals(ethers.BigNumber.from(150))
  })
})