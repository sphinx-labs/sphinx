import '@nomiclabs/hardhat-ethers'
import '@sphinx/plugins'
import { sphinx, ethers } from 'hardhat'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('HelloSphinx', () => {
  let MyFirstContract: Contract
  beforeEach(async () => {
    // You must reset your Sphinx deployments to their initial state here
    await sphinx.reset()

    MyFirstContract = await sphinx.getContract(
      'Hello Sphinx',
      'MyFirstContract',
      ethers.provider.getSigner()
    )
  })

  it('initializes correctly', async () => {
    expect(await MyFirstContract.number()).equals(1)
    expect(await MyFirstContract.stored()).equals(true)
    expect(await MyFirstContract.storageName()).equals('First')
    expect(await MyFirstContract.otherStorage()).equals(
      '0x1111111111111111111111111111111111111111'
    )
  })
})
