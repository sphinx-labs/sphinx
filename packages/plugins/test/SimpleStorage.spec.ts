import { expect } from 'chai'
import { BigNumber, Contract, ethers } from 'ethers'

describe('SimpleStorage', () => {
  let FirstSimpleStorage: Contract
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    FirstSimpleStorage = await chugsplash.getContract('FirstSimpleStorage')
  })

  it('does set struct', async () => {
    const struct = await FirstSimpleStorage.getStruct()
    expect(struct[0]).equals(1)
    expect(struct[1]).equals(2)
    expect(struct[2]).to.deep.equal(BigNumber.from(3))
  })

  it('does set string mapping to string, uint, bool, address', async () => {
    expect(
      await FirstSimpleStorage.getStringTestMappingValue('string')
    ).to.equal('test')
    expect(
      await FirstSimpleStorage.getIntTestMappingValue('uint')
    ).to.deep.equal(BigNumber.from(1234))
    expect(await FirstSimpleStorage.getBoolTestMappingValue('bool')).to.equal(
      true
    )
    expect(
      await FirstSimpleStorage.getAddressTestMappingValue('address')
    ).equals('0x1111111111111111111111111111111111111111')
  })

  it('does set string mapping to struct', async () => {
    const struct = await FirstSimpleStorage.getStructTestMappingValue('test')
    expect(struct[0]).equals(1)
    expect(struct[1]).equals(2)
    expect(struct[2]).to.deep.equal(BigNumber.from(3))
  })

  it('does set uint mapping to string', async () => {
    expect(
      await FirstSimpleStorage.getUintStringTestMappingValue(BigNumber.from(1))
    ).to.equal('test')
  })

  it('does set int mapping to string', async () => {
    expect(
      await FirstSimpleStorage.getIntStringTestMappingValue(BigNumber.from(1))
    ).to.equal('test')
  })

  it('does set int8 mapping to string', async () => {
    expect(
      await FirstSimpleStorage.getIntStringTestMappingValue(BigNumber.from(1))
    ).to.equal('test')
  })

  it('does set int128 mapping to string', async () => {
    expect(
      await FirstSimpleStorage.getIntStringTestMappingValue(BigNumber.from(1))
    ).to.equal('test')
  })

  it('does set uint8 mapping to string', async () => {
    expect(await FirstSimpleStorage.getUint8StringTestMappingValue(1)).to.equal(
      'test'
    )
  })

  it('does set uint128 mapping to string', async () => {
    expect(
      await FirstSimpleStorage.getUint128StringTestMappingValue(1)
    ).to.equal('test')
  })

  it('does set address mapping to string', async () => {
    expect(
      await FirstSimpleStorage.getAddressStringTestMappingValue(
        '0x1111111111111111111111111111111111111111'
      )
    ).to.equal('test')
  })

  it('does set bytes mapping to string', async () => {
    expect(
      await FirstSimpleStorage.getBytesStringTestMappingValue(
        ethers.utils.toUtf8Bytes('abcd')
      )
    ).to.equal('test')
  })

  it('does set nested string mapping', async () => {
    expect(
      await FirstSimpleStorage.getNestedTestMappingValue('test', 'test')
    ).to.equal('success')
  })

  it('does set multi nested mapping', async () => {
    expect(
      await FirstSimpleStorage.getMultiNestedMappingTestMappingValue(
        1,
        'test',
        '0x1111111111111111111111111111111111111111'
      )
    ).to.deep.equal(BigNumber.from(2))
  })
})
