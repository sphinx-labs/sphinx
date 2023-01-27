import { chugsplash } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

import { variables } from './constants'

describe('Storage', () => {
  let MyStorage: Contract
  let MySimpleStorage: Contract
  beforeEach(async () => {
    // Reset to the initial deployment state
    await chugsplash.reset()

    MyStorage = await chugsplash.getContract('MyStorage', 'My First Project')
    MySimpleStorage = await chugsplash.getContract(
      'MySimpleStorage',
      'My First Project'
    )
  })

  it('does set contract reference', async () => {
    expect(await MySimpleStorage.myStorage()).equals(MyStorage.address)
  })

  it('does set min int256', async () => {
    expect(await MyStorage.minInt256()).deep.equals(
      BigNumber.from(variables.minInt256)
    )
  })

  it('does set min int8', async () => {
    expect(await MyStorage.minInt8()).equals(variables.minInt8)
  })

  it('does set uint8', async () => {
    expect(await MyStorage.uint8Test()).equals(variables.uint8Test)
  })

  it('does set bool', async () => {
    expect(await MyStorage.boolTest()).equals(variables.boolTest)
  })

  it('does set string', async () => {
    expect(await MyStorage.stringTest()).equals(variables.stringTest)
  })

  it('does set long string', async () => {
    expect(await MyStorage.longStringTest()).equals(variables.longStringTest)
  })

  it('does set bytes', async () => {
    expect(await MyStorage.bytesTest()).equals(variables.bytesTest)
  })

  it('does set long bytes', async () => {
    expect(await MyStorage.longBytesTest()).equals(variables.longBytesTest)
  })

  it('does set contract', async () => {
    expect(await MyStorage.contractTest()).equals(variables.contractTest)
  })

  it('does set enum', async () => {
    expect(await MyStorage.enumTest()).equals(variables.enumTest)
  })

  it('does set struct', async () => {
    const { a, b, c } = await MyStorage.simpleStruct()
    expect(a).equals(variables.simpleStruct.a)
    expect(b).to.deep.equal(BigNumber.from(variables.simpleStruct.b))
    expect(c).to.deep.equal(BigNumber.from(variables.simpleStruct.c))
  })

  it('does set string mapping to string, uint, bool, address, struct', async () => {
    const [key] = Object.keys(variables.stringToStringMapping)
    expect(await MyStorage.stringToStringMapping(key)).to.equal(
      variables.stringToStringMapping[key]
    )
    expect(await MyStorage.stringToUint256Mapping(key)).to.deep.equal(
      BigNumber.from(variables.stringToUint256Mapping[key])
    )
    expect(await MyStorage.stringToBoolMapping(key)).to.equal(
      variables.stringToBoolMapping[key]
    )
    expect(await MyStorage.stringToAddressMapping(key)).equals(
      variables.stringToAddressMapping[key]
    )

    const { a, b, c } = await MyStorage.stringToStructMapping(key)
    expect(a).equals(variables.simpleStruct.a)
    expect(b).to.deep.equal(BigNumber.from(variables.simpleStruct.b))
    expect(c).to.deep.equal(BigNumber.from(variables.simpleStruct.c))
  })

  it('does set long string mapping to long string', async () => {
    const [key] = Object.keys(variables.longStringToLongStringMapping)
    expect(await MyStorage.longStringToLongStringMapping(key)).to.equal(
      variables.longStringToLongStringMapping[key]
    )
  })

  it('does set complex struct', async () => {
    expect(await MyStorage.complexStruct()).equals(variables.complexStruct.a)

    const [[key, val]] = Object.entries(variables.complexStruct.b)
    expect(await MyStorage.getComplexStructMappingVal(key)).equals(val)
  })

  it('does set uint64 fixed size array', async () => {
    for (let i = 0; i < variables.uint64FixedArray.length; i++) {
      expect(await MyStorage.uint64FixedArray(i)).deep.equals(
        BigNumber.from(variables.uint64FixedArray[i])
      )
    }
  })

  it('does set uint128 fixed size nested array', async () => {
    for (let i = 0; i < variables.uint128FixedNestedArray.length; i++) {
      for (let j = 0; j < variables.uint128FixedNestedArray[0].length; j++) {
        expect(await MyStorage.uint128FixedNestedArray(i, j)).deep.equals(
          BigNumber.from(variables.uint128FixedNestedArray[i][j])
        )
      }
    }
  })

  it('does set uint64 fixed size multi nested array', async () => {
    for (let i = 0; i < variables.uint64FixedMultiNestedArray.length; i++) {
      for (
        let j = 0;
        j < variables.uint64FixedMultiNestedArray[0].length;
        j++
      ) {
        for (
          let k = 0;
          k < variables.uint64FixedMultiNestedArray[0][0].length;
          k++
        ) {
          expect(
            await MyStorage.uint64FixedMultiNestedArray(i, j, k)
          ).deep.equals(
            BigNumber.from(variables.uint64FixedMultiNestedArray[i][j][k])
          )
        }
      }
    }
  })

  it('does set int64 dynamic array', async () => {
    for (let i = 0; i < variables.int64DynamicArray.length; i++) {
      expect(await MyStorage.int64DynamicArray(i)).deep.equals(
        BigNumber.from(variables.int64DynamicArray[i])
      )
    }
  })

  it('does set dynamic array of simple structs', async () => {
    for (let i = 0; i < variables.simpleStructDynamicArray.length; i++) {
      const { a, b, c } = await MyStorage.simpleStructDynamicArray(i)
      expect(a).equals(variables.simpleStructDynamicArray[i].a)
      expect(b).to.deep.equal(
        BigNumber.from(variables.simpleStructDynamicArray[i].b)
      )
      expect(c).to.deep.equal(
        BigNumber.from(variables.simpleStructDynamicArray[i].c)
      )
    }
  })

  it('does set uint256 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.uint256ToStringMapping)
    expect(await MyStorage.uint256ToStringMapping(key)).to.equal(val)
  })

  it('does set uint8 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.uint8ToStringMapping)
    expect(await MyStorage.uint8ToStringMapping(key)).to.equal(val)
  })

  it('does set uint128 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.uint128ToStringMapping)
    expect(await MyStorage.uint128ToStringMapping(key)).to.equal(val)
  })

  it('does set int256 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.int256ToStringMapping)
    expect(await MyStorage.int256ToStringMapping(key)).to.equal(val)
  })

  it('does set int8 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.int8ToStringMapping)
    expect(await MyStorage.int8ToStringMapping(key)).to.equal(val)
  })

  it('does set int128 mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.int128ToStringMapping)
    expect(await MyStorage.int128ToStringMapping(key)).to.equal(val)
  })

  it('does set address mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.addressToStringMapping)
    expect(await MyStorage.addressToStringMapping(key)).to.equal(val)
  })

  it('does set bytes mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.bytesToStringMapping)
    expect(await MyStorage.bytesToStringMapping(key)).to.equal(val)
  })

  it('does set nested string mapping', async () => {
    const [key] = Object.keys(variables.nestedMapping)
    const [nestedKey] = Object.keys(variables.nestedMapping[key])
    expect(await MyStorage.nestedMapping(key, nestedKey)).to.equal(
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
      await MyStorage.multiNestedMapping(firstKey, secondKey, thirdKey)
    ).to.deep.equal(BigNumber.from(val))
  })
})
