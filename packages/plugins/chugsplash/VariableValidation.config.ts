import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'Variable Validation'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
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
      kind: 'no-proxy',
      constructorArgs: {
        _immutableUint: 1,
        _immutableContractReference: '{{ VariableValidation }}',
      },
      variables: {
        hello: 'world',
      },
    },
    Reverter1: {
      contract: 'Reverter',
      kind: 'no-proxy',
      unsafeAllowFlexibleConstructor: true,
    },
    Reverter2: {
      contract: 'Reverter',
      kind: 'no-proxy',
      unsafeAllowFlexibleConstructor: true,
    },
  },
}

export default config
