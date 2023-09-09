import fs from 'fs'
import path from 'path'

// eslint-disable-next-line import/order
import hre from 'hardhat'

import '../dist' // This loads in the Sphinx's HRE type extensions, e.g. `compilerConfigPath`
import '@nomicfoundation/hardhat-ethers'

import { ethers } from 'ethers'
import { BigNumber as EthersV5BigNumber } from '@ethersproject/bignumber'
import {
  SphinxJsonRpcProvider,
  SupportedNetworkName,
  UserConfigWithOptions,
  UserContractConfigs,
  getAuthAddress,
  getAuthData,
  getSphinxManagerAddress,
} from '@sphinx-labs/core'

import { createSphinxRuntime } from '../src/cre'

export type MultiChainProjectTestInfo = {
  managerAddress: string
  authAddress: string
  authData: string
  userConfig: UserConfigWithOptions
  ownerPrivateKeys: string[]
  ownerAddresses: string[]
  proposerAddresses: string[]
}

// The multi-chain test suite is run against two different execution methods:
// 1. 'standard': This is the execution flow used in production, which means a proposer must first
//    sign a meta transaction to propose an auth root, then at least `threshold` owners must sign a
//    meta transaction to approve the auth root.
// 2. 'bypass verification': This is the execution flow that allows a user to test a Sphinx config
//    locally before proposing it on live networks. In a local testing environment, the proposer and
//    owner private keys are not known. To resolve this for the owner threshold, we set it to 0 via
//    a `setStorageAt` RPC call in the SphinxAuth contract. For the proposer threshold, we can't use
//    `setStorageAt` because the proposer threshold is hard-coded as a constant value in the
//    SphinxAuth contract (which means it has no storage slot). So, instead, we set a known private
//    key as a proposer, then use it to sign a meta transaction, which we submit like normal. It's
//    worth mentioning that we test this flow in the multi-chain test suite to ensure that users can
//    test their Sphinx configs locally against any set of auth leafs.
//
export type ExecutionMethod = 'standard' | 'bypass verification'
export const executionMethods: Array<ExecutionMethod> = [
  'standard',
  'bypass verification',
]

// The following values are shared between the Sphinx configs that are tested.
export const DUMMY_ORG_ID = '1111'
// This is the `DEFAULT_ADMIN_ROLE` used by OpenZeppelin's Access Control contract, which the Auth
// contract inherits.
export const OWNER_ROLE_HASH = ethers.ZeroHash

export const defaultCre = createSphinxRuntime(
  'hardhat',
  false,
  hre.config.networks.hardhat.allowUnlimitedContractSize,
  true, // Automatically confirm proposals
  hre.config.paths.compilerConfigs,
  hre,
  false // TODO: undo
)
export const initialTestnets: Array<SupportedNetworkName> = [
  'goerli',
  'optimism-goerli',
]
export const testnetsToAdd: Array<SupportedNetworkName> = [
  'arbitrum-goerli',
  'gnosis-chiado',
]
export const allTestnets = initialTestnets.concat(testnetsToAdd)
export const rpcProviders: { [network: string]: SphinxJsonRpcProvider } = {
  goerli: new SphinxJsonRpcProvider('http://127.0.0.1:42005'),
  'optimism-goerli': new SphinxJsonRpcProvider('http://127.0.0.1:42420'),
  'gnosis-chiado': new SphinxJsonRpcProvider('http://127.0.0.1:42200'),
  'arbitrum-goerli': new SphinxJsonRpcProvider('http://127.0.0.1:42613'),
  'base-goerli': new SphinxJsonRpcProvider('http://127.0.0.1:42531'),
  anvil: new SphinxJsonRpcProvider('http://127.0.0.1:8545'),
}

// Accounts #0-4 on Hardhat/Anvil node.
export const ownerPrivateKeys = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
]
// Account 5
export const proposerPrivateKey =
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba'
// Account 6. This account should have no permissions.
export const randomPrivateKey =
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e'
// Account 8
export const deployerPrivateKey =
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97'
// Account 9
export const relayerPrivateKey =
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6'

const contractConfig: UserContractConfigs = {
  ConfigContract1: {
    contract: 'MyContract1',
    kind: 'immutable',
    constructorArgs: {
      _intArg: 0,
      _uintArg: 0,
      _addressArg: ethers.ZeroAddress,
      _otherAddressArg: ethers.ZeroAddress,
    },
  },
}

// Next, we'll define the EOA project variables.
// A single account is used as the owner and proposer for this project.
const eoaAddress = new ethers.Wallet(proposerPrivateKey).address
const eoaUserConfig: UserConfigWithOptions = {
  projectName: 'EOA Project',
  options: {
    orgId: DUMMY_ORG_ID,
    owners: [eoaAddress],
    ownerThreshold: 1,
    testnets: initialTestnets,
    mainnets: [],
    proposers: [eoaAddress],
    managerVersion: 'v0.2.3',
  },
  contracts: contractConfig,
}
const eoaAuthData = getAuthData(
  [eoaAddress],
  eoaUserConfig.options.ownerThreshold
)
const eoaAuthAddress = getAuthAddress(
  [eoaAddress],
  eoaUserConfig.options.ownerThreshold,
  eoaUserConfig.projectName
)
const eoaManagerAddress = getSphinxManagerAddress(
  eoaAuthAddress,
  eoaUserConfig.projectName
)

// Multisig project variables
const multisigUserConfig: UserConfigWithOptions = {
  projectName: 'Multisig Project',
  options: {
    orgId: DUMMY_ORG_ID,
    owners: ownerPrivateKeys.map((privateKey) => {
      return new ethers.Wallet(privateKey).address
    }),
    ownerThreshold: 3,
    testnets: initialTestnets,
    mainnets: [],
    proposers: [new ethers.Wallet(proposerPrivateKey).address],
    managerVersion: 'v0.2.3',
  },
  contracts: contractConfig,
}
const multisigAuthData = getAuthData(
  multisigUserConfig.options.owners,
  multisigUserConfig.options.ownerThreshold
)
const multisigAuthAddress = getAuthAddress(
  multisigUserConfig.options.owners,
  multisigUserConfig.options.ownerThreshold,
  multisigUserConfig.projectName
)
const multisigManagerAddress = getSphinxManagerAddress(
  multisigAuthAddress,
  multisigUserConfig.projectName
)

export const multichainTestInfo: Array<MultiChainProjectTestInfo> = []
// EOA project
multichainTestInfo.push({
  managerAddress: eoaManagerAddress,
  authAddress: eoaAuthAddress,
  authData: eoaAuthData,
  userConfig: eoaUserConfig,
  ownerPrivateKeys: [proposerPrivateKey],
  ownerAddresses: [eoaAddress],
  proposerAddresses: [eoaAddress],
})
// Multisig project
multichainTestInfo.push({
  managerAddress: multisigManagerAddress,
  authAddress: multisigAuthAddress,
  authData: multisigAuthData,
  userConfig: multisigUserConfig,
  ownerPrivateKeys,
  ownerAddresses: multisigUserConfig.options.owners,
  proposerAddresses: multisigUserConfig.options.proposers,
})

export const fetchBuildInfo = () => {
  const directoryPath = path.join(__dirname, '../artifacts/build-info')
  const fileNames = fs.readdirSync(directoryPath)
  if (fileNames.length !== 1) {
    throw new Error(
      `Did not find exactly one Sphinx contracts build info file. Run:\n` +
        `npx hardhat clean`
    )
  }
  return fileNames[0]
}

export const enum TestEnum {
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

export const immutableConstructorArgsOne = {
  _immutableInt: EthersV5BigNumber.from(ethers.MinInt256).toString(),
  _immutableInt8: -128,
  _immutableUint: EthersV5BigNumber.from(ethers.MaxUint256).toString(),
  _immutableUint8: 255,
  _immutableBool: true,
  _immutableBytes32: '0x' + '11'.repeat(32),
}

export const immutableConstructorArgsTwo = {
  _immutableUserDefinedType: EthersV5BigNumber.from(
    ethers.MaxUint256
  ).toString(),
  _immutableBigNumberUint: EthersV5BigNumber.from(ethers.MaxUint256),
  _immutableBigNumberInt: EthersV5BigNumber.from(ethers.MinInt256),
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
  minInt256: EthersV5BigNumber.from(ethers.MinInt256).toString(),
  minInt8: -128,
  bigNumberInt256: EthersV5BigNumber.from(ethers.MaxInt256),
  bigNumberInt8: EthersV5BigNumber.from(-128),
  bigNumberUint256: EthersV5BigNumber.from(ethers.MaxUint256),
  bigNumberUint8: EthersV5BigNumber.from(255),
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
  userDefinedInt: EthersV5BigNumber.from(ethers.MinInt256).toString(),
  userDefinedInt8: -128,
  userDefinedUint8: 255,
  userDefinedBool: true,
  userDefinedBigNumberInt: EthersV5BigNumber.from(0),
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
  bigNumberEnumTest: EthersV5BigNumber.from(TestEnum.B),
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
    EthersV5BigNumber.from(100),
    1_000,
    EthersV5BigNumber.from(10_000),
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
    testKey: EthersV5BigNumber.from(1234),
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
