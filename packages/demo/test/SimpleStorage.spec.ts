import '@chugsplash/plugins'
import { chugsplash } from 'hardhat'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('SimpleStorage', () => {
  let FirstSimpleStorage: Contract
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    FirstSimpleStorage = await chugsplash.getContract('FirstSimpleStorage')
  })

  it('initializes correctly', async () => {
    expect(await FirstSimpleStorage.number()).equals(1)
    expect(await FirstSimpleStorage.stored()).equals(true)
    expect(await FirstSimpleStorage.storageName()).equals('First')
    expect(await FirstSimpleStorage.otherStorage()).equals(
      '0x1111111111111111111111111111111111111111'
    )
  })
})
