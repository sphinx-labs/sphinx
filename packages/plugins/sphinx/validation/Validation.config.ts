import { UserConfig } from '@sphinx-labs/core'

const config: UserConfig = {
  projectName: 'Validation',
  contracts: {
    // Ignore the fact that there's a TypeScript warning on this field. This config intentionally
    // does not have a 'kind' field to test that an error is thrown when it's missing.
    VariableValidation: {
      contract: 'VariableValidation',
      constructorArgs: {},
      variables: {
        arrayInt8: [0, 1, 2],
        int8OutsideRange: 255,
        uint8OutsideRange: 256,
        intAddress: 1,
        arrayAddress: ['0x00000000'],
        shortAddress: '0x00000000',
        intBytes32: 1,
        arrayBytes32: [1],
        shortBytes32: '0x00000000',
        oddStaticBytes: '0xabcdefghijklmno',
        longBytes8: '0x' + '11'.repeat(32),
        malformedBytes16: '11'.repeat(16),
        intBoolean: 1,
        stringBoolean: 'true',
        arrayBoolean: [true, false],
        oddDynamicBytes: '0xabcde',
        oversizedArray: [1, 2, 3],
        oversizedNestedArray: [
          [1, 2],
          [1, 2],
          [1, 2],
        ],
        invalidBoolArray: ['hello', 'world'],
        invalidBytes32Array: [1, 2],
        invalidAddressArray: ['0x00000000', '0x00000000'],
        invalidStringStringMapping: {
          testKey: 1,
        },
        invalidStringIntMapping: {
          testKey: true,
        },
        invalidNestedStringIntBoolMapping: {
          testKey: {
            testKey: true,
          },
        },
        extraMemberStruct: {
          a: 1,
          b: 2,
          c: 3,
        },
        missingMemberStruct: {
          b: 2,
        },
        // variables that are not in the contract
        extraVar: 214830928,
        anotherExtraVar: [],
        functionType: {},
      },
    },
    Stateless: {
      contract: 'Stateless',
      kind: 'immutable',
      constructorArgs: {
        _immutableUint: 1,
        _immutableAddress: '{{ VariableValidation }}',
      },
      variables: {
        hello: 'world',
      },
    },
  },
}

export default config
