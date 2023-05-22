import fs from 'fs'
import path from 'path'

import { BigNumber, ethers } from 'ethers'

export const fetchBuildInfo = () => {
  const directoryPath = path.join(__dirname, '../artifacts/build-info')
  const fileNames = fs.readdirSync(directoryPath)
  if (fileNames.length !== 1) {
    throw new Error(
      'Did not find exactly one ChugSplash contracts build info file.'
    )
  }
  return fileNames[0]
}

const enum TestEnum {
  'A',
  'B',
  'C',
}

export const invalidConstructorArgsPartOne = {
  _arrayInt8: [0, 1, 2],
  _int8OutsideRange: 255,
  _uint8OutsideRange: 256,
  _intAddress: 1,
  _arrayAddress: ['0x00000000'],
  _shortAddress: '0x00000000',
  _intBytes32: 1,
  _arrayBytes32: [1],
  _shortBytes32: '0x00000000',
  _oddStaticBytes: '0xabcdefghijklmno',
}

export const invalidConstructorArgsPartTwo = {
  _longBytes8: '0x' + '11'.repeat(32),
  _malformedBytes16: '11'.repeat(16),
  _intBoolean: 1,
  _stringBoolean: 'true',
  _arrayBoolean: [true, false],
  _invalidBaseTypeArray: ['hello', 'world'],
  _invalidNestedBaseTypeArray: [['hello', 'world']],
  _incorrectlySizedArray: [1, 2, 3, 4, 5],
  _incorrectlySizedNestedArray: [
    [1, 2, 3],
    [4, 5, 6],
  ],
  _structMissingMembers: {
    a: 1,
    z: 2,
  },
}

export const constructorArgs = {
  _immutableInt: ethers.constants.MinInt256.toString(),
  _immutableInt8: -128,
  _immutableUint: ethers.constants.MaxUint256.toString(),
  _immutableUint8: 255,
  _immutableBool: true,
  _immutableBytes32: '0x' + '11'.repeat(32),
  _immutableUserDefinedType: ethers.constants.MaxUint256.toString(),
  _immutableBigNumberUint: ethers.constants.MaxUint256,
  _immutableBigNumberInt: ethers.constants.MinInt256,
  _immutableAddress: '0x1111111111111111111111111111111111111111',
  _immutableContract: '0x1111111111111111111111111111111111111111',
  _immutableEnum: TestEnum.B,
}

export const complexConstructorArgs = {
  _str: 'testString',
  _dynamicBytes: '0xabcd1234',
  _uint64FixedArray: [1, 10, 100, 1_000, 10_000],
  _int64DynamicArray: [-5, 50, -500, 5_000, -50_000, 500_000, -5_000_000],
  _uint64FixedNestedArray: [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25],
    [26, 27, 28, 29, 30],
  ],
  _uint64DynamicMultiNestedArray: [
    [
      [1, 2, 3],
      [4, 5, 6],
    ],
    [
      [7, 8, 9],
      [10, 11, 12],
    ],
    [
      [13, 14, 15],
      [16, 17, 18],
    ],
  ],
  _complexStruct: {
    b: 2,
    a: '0x' + 'aa'.repeat(32),
    c: 3,
    d: [1, 2],
    e: [
      [1, 2, 3],
      [4, 5, 6],
    ],
  },
}

export const variables = {
  minInt256: ethers.constants.MinInt256.toString(),
  minInt8: -128,
  bigNumberInt256: ethers.constants.MaxInt256,
  bigNumberInt8: BigNumber.from(-128),
  bigNumberUint256: ethers.constants.MaxUint256,
  bigNumberUint8: BigNumber.from(255),
  uint8Test: 255,
  boolTest: true,
  stringTest: 'testString',
  longStringTest:
    'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
  bytesTest: '0xabcd1234',
  bytes32Test: '0x' + '11'.repeat(32),
  addressTest: '0x1111111111111111111111111111111111111111',
  payableAddressTest: '0x1111111111111111111111111111111111111111',
  longBytesTest:
    '0x123456789101112131415161718192021222324252627282930313233343536373839404142434445464',
  userDefinedTypeTest: '1000000000000000000',
  userDefinedBytesTest: '0x' + '11'.repeat(32),
  userDefinedInt: ethers.constants.MinInt256.toString(),
  userDefinedInt8: -128,
  userDefinedUint8: 255,
  userDefinedBool: true,
  userDefinedBigNumberInt: BigNumber.from(0),
  userDefinedFixedArray: ['1000000000000000000', '1000000000000000000'],
  userDefinedFixedNestedArray: [
    ['1000000000000000000', '1000000000000000000'],
    ['1000000000000000000', '1000000000000000000'],
  ],
  userDefinedDynamicArray: [
    '1000000000000000000',
    '1000000000000000000',
    '1000000000000000000',
  ],
  stringToUserDefinedMapping: {
    testKey: '1000000000000000000',
  },
  userDefinedToStringMapping: {
    '1000000000000000000': 'testVal',
  },
  contractTest: '0x' + '11'.repeat(20),
  enumTest: TestEnum.B,
  bigNumberEnumTest: BigNumber.from(TestEnum.B),
  simpleStruct: {
    a: '0x' + 'aa'.repeat(32),
    b: 12345,
    c: 54321,
  },
  complexStruct: {
    a: 4,
    b: {
      5: 'testVal',
    },
    c: '1000000000000000000',
  },
  uint64FixedArray: [1, 10, 100, 1_000, 10_000],
  mixedTypesUint64FixedArray: [
    1,
    '10',
    BigNumber.from(100),
    1_000,
    BigNumber.from(10_000),
  ],
  uint128FixedNestedArray: [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25],
    [26, 27, 28, 29, 30],
  ],
  uint64FixedMultiNestedArray: [
    [
      [1, 2],
      [3, 4],
    ],
    [
      [5, 6],
      [7, 8],
    ],
  ],
  int64DynamicArray: [-5, 50, -500, 5_000, -50_000, 500_000, -5_000_000],
  int64NestedDynamicArray: [
    [-5, 50, -500, 5_000, -50_000, 500_000, -5_000_000],
    [-5, 50, -500, 5_000, -50_000, 500_000, -5_000_000],
  ],
  simpleStructDynamicArray: [
    {
      a: '0x' + 'ab'.repeat(32),
      b: 12345,
      c: 54321,
    },
    {
      a: '0x' + 'cd'.repeat(32),
      b: 100_000_000,
      c: 999_999_999,
    },
    {
      a: '0x' + 'ef'.repeat(32),
      b: 56789,
      c: 98765,
    },
  ],
  stringToStringMapping: {
    testKey: 'testVal',
  },
  longStringToLongStringMapping: {
    abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz:
      'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
  },
  stringToUint256Mapping: {
    testKey: 12341234,
  },
  stringToBoolMapping: {
    testKey: true,
  },
  stringToAddressMapping: {
    testKey: '0x' + '11'.repeat(20),
  },
  stringToStructMapping: {
    testKey: {
      a: '0x' + 'aa'.repeat(32),
      b: 12345,
      c: 54321,
    },
  },
  uint256ToStringMapping: {
    12341234: 'testVal',
  },
  uint8ToStringMapping: {
    255: 'testVal',
  },
  uint128ToStringMapping: {
    1234: 'testVal',
  },
  stringToBigNumberUintMapping: {
    testKey: BigNumber.from(1234),
  },
  int256ToStringMapping: {
    '-1': 'testVal',
  },
  int8ToStringMapping: {
    '-10': 'testVal',
  },
  int128ToStringMapping: {
    '-1234': 'testVal',
  },
  addressToStringMapping: {
    '0x1111111111111111111111111111111111111111': 'testVal',
  },
  contractToStringMapping: {
    '0x2222222222222222222222222222222222222222': 'test',
  },
  enumToStringMapping: {
    [TestEnum.B]: 'testVal',
  },
  bytesToStringMapping: {
    '0xabcd1234': 'testVal',
  },
  nestedMapping: {
    testKey: {
      nestedKey: 'nestedVal',
    },
  },
  multiNestedMapping: {
    1: {
      testKey: {
        '0x1111111111111111111111111111111111111111': 2,
      },
    },
  },
}
