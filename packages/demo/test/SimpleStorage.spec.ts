import { expect } from 'chai'
import { Contract } from 'ethers'

describe('SimpleStorage', () => {
  let FirstSimpleStorage: Contract
  let SecondSimpleStorage: Contract
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    FirstSimpleStorage = await chugsplash.getContract('FirstSimpleStorage')
    SecondSimpleStorage = await chugsplash.getContract('SecondSimpleStorage')
  })

  it('initializes correctly', async () => {
    expect(await FirstSimpleStorage.number()).equals(1)
    expect(await SecondSimpleStorage.stored()).equals(true)
    expect(await SecondSimpleStorage.storageName()).equals('Second')
    expect(await FirstSimpleStorage.otherStorage()).equals(
      SecondSimpleStorage.address
    )
  })
})
