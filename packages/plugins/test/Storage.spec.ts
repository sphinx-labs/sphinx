import { expect } from 'chai'
import { BigNumber, Contract, constants } from 'ethers'

import { variables } from './constants'

describe('SimpleStorage', () => {
  let Storage: Contract
  beforeEach(async () => {
    // Reset to the initial deployment state
    await chugsplash.reset()

    Storage = await chugsplash.getContract('Storage')
  })

  it('does set min int256', async () => {
    expect(await Storage.minInt256()).deep.equals(
      BigNumber.from(variables.minInt256)
    )
  })

  it('does set min int8', async () => {
    expect(await Storage.minInt8()).equals(variables.minInt8)
  })

  it('does set uint8', async () => {
    expect(await Storage.uint8Test()).equals(variables.uint8Test)
  })

  it('does set bool', async () => {
    expect(await Storage.boolTest()).equals(variables.boolTest)
  })

  it('does set string', async () => {
    expect(await Storage.stringTest()).equals(variables.stringTest)
  })

  it('does set struct', async () => {
    const { a, b, c } = await Storage.structTest()
    expect(a).equals(variables.structTest.a)
    expect(b).equals(variables.structTest.b)
    expect(c).to.deep.equal(BigNumber.from(variables.structTest.c))
  })

  it('does set string mapping to string, uint, bool, address, struct', async () => {
    const [key] = Object.keys(variables.stringToStringMapping)
    expect(await Storage.stringToStringMapping(key)).to.equal(
      variables.stringToStringMapping[key]
    )
    expect(await Storage.stringToUint256Mapping(key)).to.deep.equal(
      BigNumber.from(variables.stringToUint256Mapping[key])
    )
    expect(await Storage.stringToBoolMapping(key)).to.equal(
      variables.stringToBoolMapping[key]
    )
    expect(await Storage.stringToAddressMapping(key)).equals(
      variables.stringToAddressMapping[key]
    )

    const { a, b, c } = await Storage.stringToStructMapping(key)
    expect(a).equals(variables.structTest.a)
    expect(b).equals(variables.structTest.b)
    expect(c).to.deep.equal(BigNumber.from(variables.structTest.c))
  })

  it('does set uint256 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.uint256ToStringMapping)
    expect(await Storage.uint256ToStringMapping(key)).to.equal(val)
  })

  it('does set uint8 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.uint8ToStringMapping)
    expect(await Storage.uint8ToStringMapping(key)).to.equal(val)
  })

  it('does set uint128 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.uint128ToStringMapping)
    expect(await Storage.uint128ToStringMapping(key)).to.equal(val)
  })

  it('does set int256 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.int256ToStringMapping)
    expect(await Storage.int256ToStringMapping(key)).to.equal(val)
  })

  it('does set int8 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.int8ToStringMapping)
    expect(await Storage.int8ToStringMapping(key)).to.equal(val)
  })

  it('does set int128 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.int128ToStringMapping)
    expect(await Storage.int128ToStringMapping(key)).to.equal(val)
  })

  it('does set address mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.addressToStringMapping)
    expect(await Storage.addressToStringMapping(key)).to.equal(val)
  })

  it('does set bytes mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.bytesToStringMapping)
    expect(await Storage.bytesToStringMapping(key)).to.equal(val)
  })

  it('does set nested string mapping', async () => {
    const [key] = Object.keys(variables.nestedMapping)
    const [nestedKey] = Object.keys(variables.nestedMapping[key])
    expect(await Storage.nestedMapping(key, nestedKey)).to.equal(
      variables.nestedMapping[key][nestedKey]
    )
  })

  it('does set multi nested mapping', async () => {
    const [firstKey] = Object.keys(variables.multiNestedMapping)
    const [secondKey] = Object.keys(variables.multiNestedMapping[firstKey])
    const [thirdKey] = Object.keys(
      variables.multiNestedMapping[firstKey][secondKey]
    )
    const val = variables.multiNestedMapping[firstKey][secondKey][thirdKey]
    expect(
      await Storage.multiNestedMapping(firstKey, secondKey, thirdKey)
    ).to.deep.equal(BigNumber.from(val))
  })
})
