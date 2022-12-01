import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

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

  it('does set bytes', async () => {
    expect(await Storage.bytesTest()).equals(variables.bytesTest)
  })

  it('does set contract', async () => {
    expect(await Storage.contractTest()).equals(variables.contractTest)
  })

  it('does set enum', async () => {
    expect(await Storage.enumTest()).equals(variables.enumTest)
  })

  it('does set struct', async () => {
    const { a, b, c } = await Storage.simpleStruct()
    expect(a).equals(variables.simpleStruct.a)
    expect(b).to.deep.equal(BigNumber.from(variables.simpleStruct.b))
    expect(c).to.deep.equal(BigNumber.from(variables.simpleStruct.c))
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
    expect(a).equals(variables.simpleStruct.a)
    expect(b).to.deep.equal(BigNumber.from(variables.simpleStruct.b))
    expect(c).to.deep.equal(BigNumber.from(variables.simpleStruct.c))
  })

  it('does set complex struct', async () => {
    expect(await Storage.complexStruct()).equals(variables.complexStruct.a)

    const [[key, val]] = Object.entries(variables.complexStruct.b)
    expect(await Storage.getComplexStructMappingVal(key)).equals(val)
  })

  it('does set uint64 fixed size array', async () => {
    for (let i = 0; i < variables.uint64FixedArray.length; i++) {
      expect(await Storage.uint64FixedArray(i)).deep.equals(
        BigNumber.from(variables.uint64FixedArray[i])
      )
    }
  })

  it('does set uint128 fixed size nested array', async () => {
    for (let i = 0; i < variables.uint128FixedNestedArray.length; i++) {
      for (let j = 0; j < variables.uint128FixedNestedArray[0].length; j++) {
        expect(await Storage.uint128FixedNestedArray(i, j)).deep.equals(
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
            await Storage.uint64FixedMultiNestedArray(i, j, k)
          ).deep.equals(
            BigNumber.from(variables.uint64FixedMultiNestedArray[i][j][k])
          )
        }
      }
    }
  })

  it('does set int64 dynamic array', async () => {
    for (let i = 0; i < variables.int64DynamicArray.length; i++) {
      expect(await Storage.int64DynamicArray(i)).deep.equals(
        BigNumber.from(variables.int64DynamicArray[i])
      )
    }
  })

  it('does set dynamic array of simple structs', async () => {
    for (let i = 0; i < variables.simpleStructDynamicArray.length; i++) {
      const { a, b, c } = await Storage.simpleStructDynamicArray(i)
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
