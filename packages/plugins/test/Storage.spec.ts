import { chugsplash } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

import { complexConstructorArgs, constructorArgs, variables } from './constants'

describe('Storage', () => {
  let MyStorage: Contract
  let MySimpleStorage: Contract
  let Stateless: Contract
  let ComplexConstructorArgs: Contract
  before(async () => {
    MyStorage = await chugsplash.getContract('My First Project', 'MyStorage')
    MySimpleStorage = await chugsplash.getContract(
      'My First Project',
      'MySimpleStorage'
    )
    Stateless = await chugsplash.getContract('My First Project', 'Stateless')
    ComplexConstructorArgs = await chugsplash.getContract(
      'My First Project',
      'ComplexConstructorArgs'
    )
  })

  it('does deploy stateless immutable contract', async () => {
    expect(await Stateless.hello()).to.equal('Hello, world!')
    expect(await Stateless.immutableUint()).to.deep.equal(BigNumber.from(1))
  })

  it('does properly resolve reference to stateless immutable contract', async () => {
    expect(await MySimpleStorage.myStateless()).to.equal(Stateless.address)
    expect(await MySimpleStorage.hello()).to.equal('Hello, world!')
  })

  it('does set immutable int', async () => {
    expect(await MyStorage.immutableInt()).to.deep.equals(
      BigNumber.from(constructorArgs._immutableInt)
    )
  })

  it('does set immutable int8', async () => {
    expect(await MyStorage.immutableInt8()).equals(
      constructorArgs._immutableInt8
    )
  })

  it('does set immutable uint', async () => {
    expect(await MyStorage.immutableUint()).to.deep.equals(
      BigNumber.from(constructorArgs._immutableUint)
    )
  })

  it('does set immutable uint8', async () => {
    expect(await MyStorage.immutableUint8()).equals(
      constructorArgs._immutableUint8
    )
  })

  it('does set immutable bool', async () => {
    expect(await MyStorage.immutableBool()).equals(
      constructorArgs._immutableBool
    )
  })

  it('does set immutable bytes', async () => {
    expect(await MyStorage.immutableBytes32()).equals(
      constructorArgs._immutableBytes32
    )
  })

  it('does set immutable user defined type', async () => {
    expect(await MyStorage.immutableUserDefinedType()).to.deep.equals(
      BigNumber.from(constructorArgs._immutableUserDefinedType)
    )
  })

  it('does set immutable BigNumber int', async () => {
    expect(await MyStorage.immutableBigNumberInt()).to.deep.equals(
      constructorArgs._immutableBigNumberInt
    )
  })

  it('does set immutable BigNumber uint', async () => {
    expect(await MyStorage.immutableBigNumberUint()).to.deep.equals(
      constructorArgs._immutableBigNumberUint
    )
  })

  it('does set immutable address', async () => {
    expect(await MyStorage.immutableAddress()).equals(
      constructorArgs._immutableAddress
    )
  })

  it('does set immutable contract', async () => {
    expect(await MyStorage.immutableContract()).equals(
      constructorArgs._immutableContract
    )
  })

  it('does set immutable contract with reference', async () => {
    expect(await MySimpleStorage.immutableContractReference()).equals(
      MyStorage.address
    )
  })

  it('does set immutable contract with reference to no-proxy contract', async () => {
    expect(await MySimpleStorage.immutableStatelessReference()).equals(
      Stateless.address
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

  it('does set BigNumber int256', async () => {
    expect(await MyStorage.bigNumberInt256()).deep.equals(
      variables.bigNumberInt256
    )
  })

  it('does set BigNumber int8', async () => {
    expect(await MyStorage.bigNumberInt8()).deep.equals(
      variables.bigNumberInt8.toNumber()
    )
  })

  it('does set BigNumber uint256', async () => {
    expect(await MyStorage.bigNumberUint256()).deep.equals(
      variables.bigNumberUint256
    )
  })

  it('does set BigNumber uint8', async () => {
    expect(await MyStorage.bigNumberUint8()).deep.equals(
      variables.bigNumberUint8.toNumber()
    )
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

  it('does set bytes32', async () => {
    expect(await MyStorage.bytes32Test()).equals(variables.bytes32Test)
  })

  it('does set addressTest', async () => {
    expect(await MyStorage.addressTest()).equals(variables.addressTest)
  })

  it('does set payableAddressTest', async () => {
    expect(await MyStorage.payableAddressTest()).equals(
      variables.payableAddressTest
    )
  })

  it('does set user defined type', async () => {
    expect(await MyStorage.userDefinedTypeTest()).deep.equals(
      BigNumber.from(variables.userDefinedTypeTest)
    )
  })

  it('does set user defined bytes', async () => {
    expect(await MyStorage.userDefinedBytesTest()).deep.equals(
      variables.userDefinedBytesTest
    )
  })

  it('does set user defined int', async () => {
    expect(await MyStorage.userDefinedInt()).deep.equals(
      BigNumber.from(variables.userDefinedInt)
    )
  })

  it('does set user defined int8', async () => {
    expect(await MyStorage.userDefinedInt8()).deep.equals(
      variables.userDefinedInt8
    )
  })

  it('does set user defined uint8', async () => {
    expect(await MyStorage.userDefinedUint8()).deep.equals(
      variables.userDefinedUint8
    )
  })

  it('does set user defined bool', async () => {
    expect(await MyStorage.userDefinedBool()).deep.equals(
      variables.userDefinedBool
    )
  })

  it('does set user defined BigNumber int', async () => {
    expect(await MyStorage.userDefinedBigNumberInt()).deep.equals(
      variables.userDefinedBigNumberInt
    )
  })

  it('does set string mapping to user defined type', async () => {
    const [key] = Object.keys(variables.stringToUserDefinedMapping)
    expect(await MyStorage.stringToUserDefinedMapping(key)).to.deep.equal(
      BigNumber.from(variables.stringToUserDefinedMapping[key])
    )
  })

  it('does set user defined type mapping to string', async () => {
    const [key] = Object.keys(variables.userDefinedToStringMapping)
    expect(await MyStorage.userDefinedToStringMapping(key)).to.equal(
      variables.userDefinedToStringMapping[key]
    )
  })

  it('does set user defined fixed array', async () => {
    for (let i = 0; i < variables.userDefinedFixedArray.length; i++) {
      expect(await MyStorage.userDefinedFixedArray(i)).deep.equals(
        BigNumber.from(variables.userDefinedFixedArray[i])
      )
    }
  })

  it('does set user defined fixed size nested array', async () => {
    for (let i = 0; i < variables.userDefinedFixedNestedArray.length; i++) {
      for (
        let j = 0;
        j < variables.userDefinedFixedNestedArray[0].length;
        j++
      ) {
        expect(await MyStorage.userDefinedFixedNestedArray(i, j)).deep.equals(
          BigNumber.from(variables.userDefinedFixedNestedArray[i][j])
        )
      }
    }
  })

  it('does set user defined dynamic array', async () => {
    for (let i = 0; i < variables.userDefinedDynamicArray.length; i++) {
      expect(await MyStorage.userDefinedDynamicArray(i)).deep.equals(
        BigNumber.from(variables.userDefinedDynamicArray[i])
      )
    }
  })

  it('does set contract', async () => {
    expect(await MyStorage.contractTest()).equals(variables.contractTest)
  })

  it('does set enum', async () => {
    expect(await MyStorage.enumTest()).equals(variables.enumTest)
  })

  it('does set BigNumber enum', async () => {
    expect(await MyStorage.bigNumberEnumTest()).deep.equals(
      variables.bigNumberEnumTest.toNumber()
    )
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
    expect(await MyStorage.stringToBigNumberUintMapping(key)).to.deep.equal(
      variables.stringToBigNumberUintMapping[key]
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
    const complexStruct = await MyStorage.complexStruct()
    expect(complexStruct.a).equals(variables.complexStruct.a)
    expect(complexStruct.c).to.deep.equal(
      BigNumber.from(variables.complexStruct.c)
    )

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

  it('does set uint64 mixed types array', async () => {
    for (let i = 0; i < variables.mixedTypesUint64FixedArray.length; i++) {
      expect(await MyStorage.mixedTypesUint64FixedArray(i)).deep.equals(
        BigNumber.from(variables.mixedTypesUint64FixedArray[i])
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

  it('does set int64 nested dynamic array', async () => {
    for (let i = 0; i < variables.int64NestedDynamicArray.length; i++) {
      for (let j = 0; j < variables.int64NestedDynamicArray[0].length; j++) {
        expect(await MyStorage.int64NestedDynamicArray(i, j)).deep.equals(
          BigNumber.from(variables.int64NestedDynamicArray[i][j])
        )
      }
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

  it('does set contract mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.contractToStringMapping)
    expect(await MyStorage.contractToStringMapping(key)).to.equal(val)
  })

  it('does set enum mapping to string', async () => {
    const [[key, val]] = Object.entries(variables.enumToStringMapping)
    expect(await MyStorage.enumToStringMapping(key)).to.equal(val)
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

  it('does set mutable string constructor arg', async () => {
    expect(await ComplexConstructorArgs.str()).to.equal(
      complexConstructorArgs._str
    )
  })

  it('does set mutable bytes constructor arg', async () => {
    expect(await ComplexConstructorArgs.dynamicBytes()).to.equal(
      complexConstructorArgs._dynamicBytes
    )
  })

  it('does set mutable uint64 fixed size array constructor arg', async () => {
    for (let i = 0; i < complexConstructorArgs._uint64FixedArray.length; i++) {
      expect(await ComplexConstructorArgs.uint64FixedArray(i)).deep.equals(
        BigNumber.from(complexConstructorArgs._uint64FixedArray[i])
      )
    }
  })

  it('does set mutable int64 dynamic array constructor arg', async () => {
    for (let i = 0; i < complexConstructorArgs._int64DynamicArray.length; i++) {
      expect(await ComplexConstructorArgs.int64DynamicArray(i)).deep.equals(
        BigNumber.from(complexConstructorArgs._int64DynamicArray[i])
      )
    }
  })

  it('does set mutable uint64 fixed size nested array constructor arg', async () => {
    for (
      let i = 0;
      i < complexConstructorArgs._uint64FixedNestedArray.length;
      i++
    ) {
      for (
        let j = 0;
        j < complexConstructorArgs._uint64FixedNestedArray[i].length;
        j++
      ) {
        expect(
          await ComplexConstructorArgs.uint64FixedNestedArray(i, j)
        ).deep.equals(
          BigNumber.from(complexConstructorArgs._uint64FixedNestedArray[i][j])
        )
      }
    }
  })

  it('does set mutable uint64 dynamic multi nested array constructor arg', async () => {
    for (
      let i = 0;
      i < complexConstructorArgs._uint64DynamicMultiNestedArray.length;
      i++
    ) {
      for (
        let j = 0;
        j < complexConstructorArgs._uint64DynamicMultiNestedArray[i].length;
        j++
      ) {
        for (
          let k = 0;
          k <
          complexConstructorArgs._uint64DynamicMultiNestedArray[i][j].length;
          k++
        ) {
          expect(
            await ComplexConstructorArgs.uint64DynamicMultiNestedArray(i, j, k)
          ).deep.equals(
            BigNumber.from(
              complexConstructorArgs._uint64DynamicMultiNestedArray[i][j][k]
            )
          )
        }
      }
    }
  })

  it('does set mutable struct constructor arg', async () => {
    const { a, b, c, d, e } = await ComplexConstructorArgs.getComplexStruct()
    expect(a).equals(complexConstructorArgs._complexStruct.a)
    expect(b).deep.equals(
      BigNumber.from(complexConstructorArgs._complexStruct.b)
    )
    expect(c).deep.equals(
      BigNumber.from(complexConstructorArgs._complexStruct.c)
    )
    for (let i = 0; i < d.length; i++) {
      expect(d[i]).deep.equals(
        BigNumber.from(complexConstructorArgs._complexStruct.d[i])
      )
    }
    for (let i = 0; i < e.length; i++) {
      for (let j = 0; j < e[i].length; j++) {
        expect(e[i][j]).deep.equals(
          BigNumber.from(complexConstructorArgs._complexStruct.e[i][j])
        )
      }
    }
  })
})
