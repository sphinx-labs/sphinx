const ethers = require('ethers')

const constructorArgs = {
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
  _immutableEnum: 1,
}

const complexConstructorArgs = {
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

const variables = {
  minInt256: ethers.constants.MinInt256.toString(),
  minInt8: -128,
  bigNumberInt256: ethers.constants.MaxInt256,
  bigNumberInt8: ethers.BigNumber.from(-128),
  bigNumberUint256: ethers.constants.MaxUint256,
  bigNumberUint8: ethers.BigNumber.from(255),
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
  userDefinedBigNumberInt: ethers.BigNumber.from(0),
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
    // eslint-disable-next-line prettier/prettier
    '1000000000000000000': 'testVal',
  },
  contractTest: '0x' + '11'.repeat(20),
  enumTest: 1,
  bigNumberEnumTest: ethers.BigNumber.from(1),
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
    ethers.BigNumber.from(100),
    1_000,
    ethers.BigNumber.from(10_000),
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
    testKey: ethers.BigNumber.from(1234),
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

const projectName = 'Deploy test'

module.exports = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    MyStorage: {
      contract: 'Storage',
      constructorArgs,
      variables,
    },
    ComplexConstructorArgs: {
      contract: 'ComplexConstructorArgs',
      kind: 'no-proxy',
      unsafeAllowFlexibleConstructor: true,
      constructorArgs: complexConstructorArgs,
    },
    MySimpleStorage: {
      contract: 'SimpleStorage',
      constructorArgs: {
        _immutableContractReference: '{{ MyStorage }}',
        _statelessImmutableContractReference: '{{ Stateless }}',
      },
      variables: {
        myStorage: '{{ MyStorage }}',
        myStateless: '{{ Stateless }}',
      },
    },
    Stateless: {
      contract: 'Stateless',
      kind: 'no-proxy',
      constructorArgs: {
        _immutableUint: 1,
        _immutableContractReference: '{{ MyStorage }}',
      },
    },
  },
}
