import { expect } from 'chai'

describe('SimpleStorage', () => {
  let FirstSimpleStorage
  let SecondSimpleStorage
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    FirstSimpleStorage = await chugsplash.getContract('FirstSimpleStorage')
    SecondSimpleStorage = await chugsplash.getContract('SecondSimpleStorage')
  })

  it('initializes correctly', async () => {
    expect(await FirstSimpleStorage.getNumber()).equals(1)
    expect(await FirstSimpleStorage.getOtherStorage()).equals(
      SecondSimpleStorage.address
    )
    expect(await SecondSimpleStorage.isStored()).equals(true)
    expect(await SecondSimpleStorage.getStorageName()).equals('Second')
  })
})
