import { ChugSplashConfig } from '@chugsplash/core'

const config: ChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
    projectOwner: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  },
  // Below, we define all of the contracts in the deployment along with their state variables.
  contracts: {
    // First contract config:
    FirstSimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        testInt: 1,
        number: 1,
        stored: true,
        storageName: 'First',
        testStruct: {
          a: 1,
          b: 2,
          c: 3,
        },
        strTest: {
          string: 'test',
        },
        uintTest: {
          uint: 1234,
        },
        boolTest: {
          bool: true,
        },
        addressTest: {
          address: '0x1111111111111111111111111111111111111111',
        },
        structTest: {
          test: {
            a: 1,
            b: 2,
            c: 3,
          },
        },
        uintStrTest: {
          1: 'test',
        },
        intStrTest: {
          1: 'test',
        },
        int8StrTest: {
          1: 'test',
        },
        int128StrTest: {
          1: 'test',
        },
        uint8StrTest: {
          1: 'test',
        },
        uint128StrTest: {
          1: 'test',
        },
        addressStrTest: {
          '0x1111111111111111111111111111111111111111': 'test',
        },
        bytesStrTest: {
          '0xabcd': 'test',
        },
        nestedMappingTest: {
          test: {
            test: 'success',
          },
        },
        multiNestedMapping: {
          1: {
            test: {
              '0x1111111111111111111111111111111111111111': 2,
            },
          },
        },
      },
    },
  },
}

export default config
