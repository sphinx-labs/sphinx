import { ethers } from 'ethers'

const enum TestEnum {
  'A',
  'B',
  'C',
}

export const variables = {
  minInt256: ethers.constants.MinInt256.toString(),
  minInt8: -128,
  uint8Test: 255,
  boolTest: true,
  stringTest: 'testString',
  bytesTest: '0xabcd1234',
  contractTest: '0x' + '11'.repeat(20),
  enumTest: TestEnum.B,
  simpleStruct: {
    a: 1,
    b: 2,
    c: 3,
  },
  complexStruct: {
    a: 4,
    b: {
      5: 'testVal',
    },
  },
  uint64FixedArray: [1, 10, 100, 1_000, 10_000],
  stringToStringMapping: {
    testKey: 'testVal',
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
      a: 1,
      b: 2,
      c: 3,
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
