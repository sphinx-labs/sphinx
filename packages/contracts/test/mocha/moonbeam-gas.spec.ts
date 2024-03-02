import { expect } from 'chai'

import { calculateActionLeafGasForMoonbeam } from '../../src/networks'
import { AccountAccessKind } from '../../src/types'

const ratio = 15_000_000 / (40 * 1024)

describe('calculateActionLeafGasForMoonbeam', () => {
  it('should calculate correct gas for single call with write', () => {
    const foundryGas = '10000'
    const deployedContractSizes = [{ account: '0x123', size: '500' }]
    const access = {
      root: {
        chainInfo: { forkId: '0x01', chainId: '0x01' },
        kind: AccountAccessKind.Call,
        account: '0x123',
        accessor: '0x456',
        initialized: true,
        oldBalance: '100',
        newBalance: '200',
        deployedCode: '0x...',
        value: '50',
        data: '0x...',
        reverted: false,
        storageAccesses: [
          {
            account: '0x123',
            slot: '0x01',
            isWrite: true,
            previousValue: '0',
            newValue: '1',
            reverted: false,
          },
        ],
      },
      nested: [],
    }

    // The overhead on moonbeam is ratio = ~367
    // So we can calculate the expected gas by adding up the bytes we expected to be stored * the ratio
    // Expected gas = foundry cost + (storage access 32 bytes * ratio)
    const expectedGas = Math.ceil(Number(foundryGas) + ratio * 32)
    const result = calculateActionLeafGasForMoonbeam(
      foundryGas,
      deployedContractSizes,
      access
    )

    expect(result).to.eq(expectedGas.toString())
  })

  it('should handle no storage writes', () => {
    const foundryGas = '0'
    const deployedContractSizes = []
    const access = {
      root: {
        chainInfo: { forkId: '0x01', chainId: '0x01' },
        kind: AccountAccessKind.Call,
        account: '0x123',
        accessor: '0x456',
        initialized: false,
        oldBalance: '0',
        newBalance: '0',
        deployedCode: '',
        value: '0',
        data: '',
        reverted: false,
        storageAccesses: [],
      },
      nested: [],
    }

    // Since we don't do any writes in this test and the input foundryGas is 0, we expect the output gas to be 0
    const expectedGas = '0'
    const result = calculateActionLeafGasForMoonbeam(
      foundryGas,
      deployedContractSizes,
      access
    )
    expect(result).to.eq(expectedGas)
  })

  it('should handle a transaction that deploys a contract with storage writes in the constructor', () => {
    const foundryGas = '50000'
    const deployedContractSizes = [{ account: '0xContract', size: '800' }]
    const access = {
      root: {
        chainInfo: { forkId: '0x01', chainId: '0x01' },
        kind: AccountAccessKind.Create,
        account: '0xContract',
        accessor: '0xDeployer',
        initialized: true,
        oldBalance: '0',
        newBalance: '0',
        deployedCode: '0xContractCode...',
        value: '0',
        data: '0xConstructorArguments...',
        reverted: false,
        storageAccesses: [
          {
            account: '0xContract',
            slot: '0x01',
            isWrite: true,
            previousValue: '0',
            newValue: '100',
            reverted: false,
          },
          {
            account: '0xContract',
            slot: '0x02',
            isWrite: false, // should not record storage usage for this
            previousValue: '0',
            newValue: '200',
            reverted: false,
          },
          {
            account: '0xContract',
            slot: '0x03',
            isWrite: true,
            previousValue: '0',
            newValue: '200',
            reverted: false,
          },
        ],
      },
      nested: [],
    }

    // For contracts the gas is the size of the contract * ration - 200 * ratio
    // Expected gas = foundry cost + (ratio * contract code size) - (200 * contract code size) + (storageAccess 1 bytes * ratio) + (storageAccesses 2 bytes * ratio)
    const expectedGas = Math.ceil(
      Number(foundryGas) +
        ratio * Number(deployedContractSizes[0].size) +
        -200 * Number(deployedContractSizes[0].size) +
        32 * ratio +
        32 * ratio
    )
    const result = calculateActionLeafGasForMoonbeam(
      foundryGas,
      deployedContractSizes,
      access
    )
    expect(result).to.eq(expectedGas.toString())
  })

  it('should handle a transaction that does a write and then deploys a contract', () => {
    const foundryGas = '60000'
    const deployedContractSizes = [{ account: '0xNewContract', size: '900' }]
    const access = {
      root: {
        chainInfo: { forkId: '0x01', chainId: '0x01' },
        kind: AccountAccessKind.Call,
        account: '0xExistingAccount',
        accessor: '0xCaller',
        initialized: true,
        oldBalance: '100',
        newBalance: '150',
        deployedCode: '',
        value: '0',
        data: '0xSomeData...',
        reverted: false,
        storageAccesses: [
          {
            account: '0xExistingAccount',
            slot: '0x01',
            isWrite: true,
            previousValue: '0',
            newValue: '100',
            reverted: false,
          },
        ],
      },
      nested: [
        {
          chainInfo: { forkId: '0x01', chainId: '0x01' },
          kind: AccountAccessKind.Create,
          account: '0xNewContract',
          accessor: '0xCaller',
          initialized: true,
          oldBalance: '0',
          newBalance: '0',
          deployedCode: '0xNewContractCode...',
          value: '0',
          data: '0xConstructorArguments...',
          reverted: false,
          storageAccesses: [],
        },
      ],
    }

    // Expected gas = foundry cost + (ratio * new contract code size) - (200 * new contract code size) + (storageAccess 32 bytes * ratio)
    const expectedGas = Math.ceil(
      Number(foundryGas) +
        ratio * Number(deployedContractSizes[0].size) +
        -200 * Number(deployedContractSizes[0].size) +
        32 * ratio
    )
    const result = calculateActionLeafGasForMoonbeam(
      foundryGas,
      deployedContractSizes,
      access
    )
    expect(result).to.eq(expectedGas.toString())
  })
})
