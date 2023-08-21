import { UserConfig } from '@sphinx-labs/core'
import { BigNumber as EthersV5BigNumber } from '@ethersproject/bignumber'
import { ethers } from 'ethers'

import { immutableConstructorArgsTwo, TestEnum } from '../test/constants'

export const networks = [
  'anvil',
  'optimism-goerli',
  'base-goerli',
  'gnosis-chiado',
  'arbitrum-goerli',
  'goerli',
]

const immutableContractOverrideOne =
  '0x1111111111111111111111111111111111111112'
const immutableContractOverrideTwo =
  '0x1111111111111111111111111111111111111113'
const immutableAddressOverrideOne = '0x1111111111111111111111111111111111111114'
const immutableAddressOverrideTwo = '0x1111111111111111111111111111111111111115'
const immutableUserDefinedOverrideOne = '654321'
const immutableUserDefinedOverrideTwo = '54321'

const defaults = {
  immutableUserDefinedType:
    immutableConstructorArgsTwo._immutableUserDefinedType,
  immutableBigNumberUint: immutableConstructorArgsTwo._immutableBigNumberUint,
  immutableBigNumberInt: immutableConstructorArgsTwo._immutableBigNumberInt,
  immutableAddress: immutableConstructorArgsTwo._immutableAddress,
  immutableContract: immutableConstructorArgsTwo._immutableContract,
  immutableEnum: immutableConstructorArgsTwo._immutableEnum,
}

export type StateVariables = {
  immutableEnum: TestEnum
  immutableUserDefinedType: string
  immutableContract: string
  immutableAddress: string
  immutableBigNumberUint: EthersV5BigNumber
  immutableBigNumberInt: EthersV5BigNumber
}

export const ExpectedStateVariables: {
  [network: string]: StateVariables
} = {
  goerli: defaults,
  anvil: {
    immutableEnum: TestEnum.A,
    immutableUserDefinedType: immutableUserDefinedOverrideTwo,
    immutableContract: immutableContractOverrideTwo,
    immutableAddress: immutableAddressOverrideTwo,
    immutableBigNumberUint: EthersV5BigNumber.from(12345),
    immutableBigNumberInt: EthersV5BigNumber.from(-12345),
  },
  'arbitrum-goerli': {
    ...defaults,
    immutableUserDefinedType: immutableUserDefinedOverrideOne,
    immutableContract: immutableContractOverrideTwo,
    immutableAddress: immutableAddressOverrideTwo,
    immutableBigNumberUint: EthersV5BigNumber.from(12345),
    immutableBigNumberInt: EthersV5BigNumber.from(-12345),
  },
  'optimism-goerli': {
    ...defaults,
    immutableEnum: TestEnum.A,
    immutableUserDefinedType: immutableUserDefinedOverrideTwo,
    immutableAddress: immutableAddressOverrideOne,
    immutableContract: immutableContractOverrideOne,
  },
  'base-goerli': {
    ...defaults,
    immutableAddress: immutableAddressOverrideOne,
    immutableContract: immutableContractOverrideOne,
  },
  'gnosis-chiado': {
    ...defaults,
    immutableContract: immutableContractOverrideTwo,
    immutableAddress: immutableAddressOverrideTwo,
    immutableBigNumberUint: EthersV5BigNumber.from(12345),
    immutableBigNumberInt: EthersV5BigNumber.from(-12345),
  },
}

const config: UserConfig = {
  projectName: 'ChainOverrides',
  contracts: {
    ChainOverrides: {
      contract: 'contracts/test/ContainsStorage.sol:OtherImmutables',
      kind: 'immutable',
      constructorArgs: {
        _immutableUserDefinedType: EthersV5BigNumber.from(
          ethers.MaxUint256
        ).toString(),
        _immutableBigNumberUint: EthersV5BigNumber.from(ethers.MaxUint256),
        _immutableBigNumberInt: EthersV5BigNumber.from(ethers.MinInt256),
        _immutableAddress: '0x1111111111111111111111111111111111111111',
        _immutableContract: '0x1111111111111111111111111111111111111111',
        _immutableEnum: TestEnum.B,
      },
      overrides: [
        {
          chains: ['arbitrum-goerli'],
          constructorArgs: {
            _immutableEnum: TestEnum.B,
            _immutableUserDefinedType: immutableUserDefinedOverrideOne,
          },
        },
        {
          chains: ['anvil', 'optimism-goerli'],
          constructorArgs: {
            _immutableEnum: TestEnum.A,
            _immutableUserDefinedType: immutableUserDefinedOverrideTwo,
          },
        },
        {
          chains: ['optimism-goerli', 'base-goerli'],
          constructorArgs: {
            _immutableAddress: immutableAddressOverrideOne,
            _immutableContract: immutableContractOverrideOne,
          },
        },
        {
          chains: ['anvil', 'gnosis-chiado', 'arbitrum-goerli'],
          constructorArgs: {
            _immutableContract: immutableContractOverrideTwo,
            _immutableAddress: immutableAddressOverrideTwo,
            _immutableBigNumberUint: EthersV5BigNumber.from(12345),
            _immutableBigNumberInt: EthersV5BigNumber.from(-12345),
          },
        },
      ],
    },
  },
}

export default config
