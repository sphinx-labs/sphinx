import '@chugsplash/plugins'
import { chugsplash } from 'hardhat'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('HelloChugSplash', () => {
  let MyFirstContract: Contract
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    MyFirstContract = await chugsplash.getContract(
      'Hello ChugSplash',
      'MyFirstContract'
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
