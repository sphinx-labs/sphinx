import chai, { expect } from 'chai'
import { ethers } from 'ethers'
import { recursivelyConvertResult } from '@sphinx-labs/contracts'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'

import {
  arraysEqual,
  decodeCall,
  equal,
  formatSolcLongVersion,
} from '../src/utils'
import { ABI } from './common'
import { callWithTimeout, getBytesLength, getMaxGasLimit } from '../dist'

chai.use(sinonChai)

describe('Utils', () => {
  describe('equal', () => {
    it('returns true for two empty objects', () => {
      expect(equal({}, {})).to.equal(true)
    })

    it('returns true for two empty arrays', () => {
      expect(equal([], [])).to.equal(true)
    })

    it('returns false for empty object and empty array', () => {
      expect(equal({}, [])).to.equal(false)
    })

    it('returns false for empty array and empty object', () => {
      expect(equal([], {})).to.equal(false)
    })

    it('returns true for two equal strings', () => {
      expect(equal('test', 'test')).to.equal(true)
    })

    it('returns false for two unequal strings', () => {
      expect(equal('test', 'test2')).to.equal(false)
    })

    it('returns true for two equal arrays', () => {
      expect(equal(['test', 'test2'], ['test', 'test2'])).to.equal(true)
    })

    it('returns false for two unequal arrays', () => {
      expect(equal(['test', 'test2'], ['test', 'test3'])).to.equal(false)
    })

    it('returns true for two equal objects', () => {
      expect(equal({ test: 'testVal' }, { test: 'testVal' })).to.equal(true)
    })

    it('returns false for two objects with different values', () => {
      expect(equal({ test: 'testVal' }, { test: 'testVal2' })).to.equal(false)
    })

    it('returns false for two objects with different keys', () => {
      expect(equal({ test: 'testVal' }, { test2: 'testVal' })).to.equal(false)
    })

    it('returns false for two objects with different numbers of keys', () => {
      expect(
        equal({ test: 'testVal', test2: 'testVal' }, { test: 'testVal' })
      ).to.equal(false)
    })

    it('returns true for two equal nested objects', () => {
      expect(
        equal({ test: { test2: 'testVal' } }, { test: { test2: 'testVal' } })
      ).to.equal(true)
    })

    it('returns false for two unequal nested objects', () => {
      expect(
        equal({ test: { test2: 'testVal' } }, { test: { test2: 'testVal2' } })
      ).to.equal(false)
    })

    it('returns true for two equal nested arrays', () => {
      expect(
        equal(
          { test: ['testVal', 'testVal2'] },
          { test: ['testVal', 'testVal2'] }
        )
      ).to.equal(true)
    })

    it('returns false for two unequal nested arrays', () => {
      expect(
        equal(
          { test: ['testVal', 'testVal2'] },
          { test: ['testVal', 'testVal3'] }
        )
      ).to.equal(false)
    })

    it('returns true for two equal nested objects and arrays', () => {
      expect(
        equal(
          { test: ['testVal', { test2: 'testVal2' }] },
          { test: ['testVal', { test2: 'testVal2' }] }
        )
      ).to.equal(true)
    })

    it('returns false for two unequal nested objects and arrays', () => {
      expect(
        equal(
          { test: ['testVal', { test2: 'testVal2' }] },
          { test: ['testVal', { test2: 'testVal3' }] }
        )
      ).to.equal(false)
    })

    it('returns true for two equal booleans', () => {
      expect(equal(true, true)).to.equal(true)
      expect(equal(false, false)).to.equal(true)
    })

    it('returns false for two unequal booleans', () => {
      expect(equal(true, false)).to.equal(false)
      expect(equal(false, true)).to.equal(false)
    })
  })

  describe('arraysEqual', () => {
    it('returns true for two empty arrays', () => {
      expect(arraysEqual([], [])).to.equal(true)
    })

    it('returns false for empty array and non-empty array', () => {
      expect(arraysEqual([], ['test'])).to.equal(false)
    })

    it('returns false for non-empty array and empty array', () => {
      expect(arraysEqual(['test'], [])).to.equal(false)
    })

    it('returns true for two equal arrays', () => {
      expect(arraysEqual(['test', 'test2'], ['test', 'test2'])).to.equal(true)
    })

    it('returns false for two unequal arrays', () => {
      expect(arraysEqual(['test', 'test2'], ['test', 'test3'])).to.equal(false)
    })

    it('returns false if first array is longer than the second array', () => {
      expect(arraysEqual(['test', 'test2'], ['test'])).to.equal(false)
    })

    it('returns false if the first array is shorter than the second array', () => {
      expect(arraysEqual(['test'], ['test', 'test2'])).to.equal(false)
    })

    it('returns true for two equal ParsedVariable objects', () => {
      expect(
        arraysEqual(
          [
            {
              name: 'test',
              type: 'uint256',
              value: '1',
            },
          ],
          [
            {
              name: 'test',
              type: 'uint256',
              value: '1',
            },
          ]
        )
      ).to.equal(true)
    })

    it('returns false for two unequal ParsedVariable', () => {
      expect(
        arraysEqual(
          [
            {
              name: 'test',
              type: 'uint256',
              value: '1',
            },
          ],
          [
            {
              name: 'test',
              type: 'uint256',
              value: '2',
            },
          ]
        )
      ).to.equal(false)
    })
  })

  describe('recursivelyConvertResult', () => {
    const coder = ethers.AbiCoder.defaultAbiCoder()
    const iface = ethers.Interface.from(ABI)
    const functionFragments = iface.fragments.filter(ethers.Fragment.isFunction)

    it('converts empty result', () => {
      const noArgParamTypes = functionFragments.find(
        (f) => f.name === 'myFunctionWithoutArgs'
      )!.inputs
      const values = ethers.Result.fromItems([])

      // Check that the values are valid for the param types.
      expect(() => coder.encode(noArgParamTypes, values)).to.not.throw()

      expect(recursivelyConvertResult(noArgParamTypes, values)).to.deep.equal(
        {}
      )
    })

    it('converts Result with a single arg', () => {
      const singleArgParamTypes = functionFragments.find(
        (f) => f.name === 'mySingleArgFunction'
      )!.inputs
      const values = ethers.Result.fromItems([2])

      // Check that the values are valid for the param types.
      expect(() => coder.encode(singleArgParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(singleArgParamTypes, values)
      ).to.deep.equal({
        _myNumber: 2,
      })
    })

    it('converts arg that contains arrays, including a nested array', () => {
      const arrayArgParamTypes = functionFragments.find(
        (f) => f.name === 'myArrayFunction'
      )!.inputs
      const values = ethers.Result.fromItems([
        [1, 2, 3],
        [
          [4, 5, 6],
          [7, 8, 9],
        ],
      ])

      // Check that the values are valid for the param types.
      expect(() => coder.encode(arrayArgParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(arrayArgParamTypes, values)
      ).to.deep.equal({
        _myArray: [1, 2, 3],
        _myNestedArray: [
          [4, 5, 6],
          [7, 8, 9],
        ],
      })
    })

    it('converts Result with unnamed args', () => {
      const unnamedArgsParamTypes = functionFragments.find(
        (f) => f.name === 'myFunctionWithUnnamedVars'
      )!.inputs
      const values = ethers.Result.fromItems([
        'test',
        [1, true, ['0x' + '11'.repeat(20), [1, 2, 3]]],
        2,
        false,
      ])

      // Check that the values are valid for the param types.
      expect(() => coder.encode(unnamedArgsParamTypes, values)).to.not.throw()

      // We return an array instead of an object if there are any unnamed args.
      expect(
        recursivelyConvertResult(unnamedArgsParamTypes, values)
      ).to.deep.equal([
        'test',
        {
          a: 1,
          b: true,
          c: {
            d: '0x' + '11'.repeat(20),
            e: [1, 2, 3],
          },
        },
        2,
        false,
      ])
    })

    it('converts Result that contains a nested struct', () => {
      const complexArgsParamTypes = functionFragments.find(
        (f) => f.name === 'myStructFunction'
      )!.inputs
      const values = ethers.Result.fromItems([
        [1, true, ['0x' + '11'.repeat(20), [1, 2, 3]]],
      ])

      // Check that the values are valid for the param types.
      expect(() => coder.encode(complexArgsParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(complexArgsParamTypes, values)
      ).to.deep.equal({
        _myStruct: {
          a: 1,
          b: true,
          c: {
            d: '0x' + '11'.repeat(20),
            e: [1, 2, 3],
          },
        },
      })
    })

    // BigInt values are converted to strings.
    it('converts Result that contains BigInt values', () => {
      const complexArgsParamTypes = functionFragments.find(
        (f) => f.name === 'myStructFunction'
      )!.inputs
      const values = ethers.Result.fromItems([
        [
          BigInt(1),
          true,
          ['0x' + '11'.repeat(20), [BigInt(1), BigInt(2), BigInt(3)]],
        ],
      ])

      // Check that the values are valid for the param types.
      expect(() => coder.encode(complexArgsParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(complexArgsParamTypes, values)
      ).to.deep.equal({
        _myStruct: {
          a: '1',
          b: true,
          c: {
            d: '0x' + '11'.repeat(20),
            e: ['1', '2', '3'],
          },
        },
      })
    })

    it('converts Result that contains an array of structs', () => {
      const structArrayParamTypes = functionFragments.find(
        (f) => f.name === 'myStructArrayFunction'
      )!.inputs
      const values = ethers.Result.fromItems([
        [
          [1, true, ['0x' + '11'.repeat(20), [1, 2, 3]]],
          [2, false, ['0x' + '22'.repeat(20), [4, 5, 6]]],
        ],
      ])

      // Check that the values are valid for the param types.
      expect(() => coder.encode(structArrayParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(structArrayParamTypes, values)
      ).to.deep.equal({
        _myStructArray: [
          {
            a: 1,
            b: true,
            c: {
              d: '0x' + '11'.repeat(20),
              e: [1, 2, 3],
            },
          },
          {
            a: 2,
            b: false,
            c: {
              d: '0x' + '22'.repeat(20),
              e: [4, 5, 6],
            },
          },
        ],
      })
    })
  })

  describe('formatSolcLongVersion', () => {
    it('should return the same version string if it does not contain extra parts', () => {
      const version = '0.8.23+commit.f704f362'
      const formattedVersion = formatSolcLongVersion(version)
      expect(formattedVersion).to.equal('0.8.23+commit.f704f362')
    })

    it('should trim the version string if it contains extra parts', () => {
      const version = '0.8.23+commit.f704f362.Darwin.appleclang'
      const formattedVersion = formatSolcLongVersion(version)
      expect(formattedVersion).to.equal('0.8.23+commit.f704f362')
    })
  })

  describe('decodeCall', () => {
    const iface = new ethers.Interface(ABI)

    it('should return undefined for empty data', () => {
      const data = '0x'
      const result = decodeCall(iface, data)
      expect(result).to.be.undefined
    })

    it('should return undefined if data length is < 4 bytes', () => {
      const data = '0x123456'
      const result = decodeCall(iface, data)
      expect(result).to.be.undefined
    })

    it('should return undefined if no matching fragment is found', () => {
      const selector = '0xffffffff'
      const data = selector + 'ffffffff'.repeat(10)

      expect(iface.hasFunction(selector)).equals(false)
      const result = decodeCall(iface, data)
      expect(result).to.be.undefined
    })

    it('should decode data for a matching function with no arguments', () => {
      const functionName = 'myFunctionWithoutArgs'
      const data = iface.encodeFunctionData(functionName, [])

      expect(getBytesLength(data)).equals(4)
      const result = decodeCall(iface, data)
      expect(result).to.deep.equal({
        functionName,
        variables: {},
      })
    })

    it('should decode data for a matching function with arguments', () => {
      const functionName = 'myStructFunction'
      const variables = {
        a: '123',
        b: true,
        c: {
          d: '0x' + '11'.repeat(20),
          e: ['1', '2', '3'],
        },
      }

      const data = iface.encodeFunctionData(functionName, [variables])
      const result = decodeCall(iface, data)
      expect(result).to.deep.equal({
        functionName,
        variables: {
          _myStruct: variables,
        },
      })
    })
  })

  describe('callWithTimeout', () => {
    let clearTimeoutSpy: sinon.SinonSpy

    beforeEach(() => {
      clearTimeoutSpy = sinon.spy(global, 'clearTimeout')
    })

    afterEach(() => {
      sinon.restore()
    })

    it('should clear the timeout if the promise rejects', async () => {
      const expectedError = new Error('expected error')
      const rejectedPromise = Promise.reject(expectedError)

      try {
        await callWithTimeout(rejectedPromise, 1000, 'Timeout error')
      } catch (error) {
        expect(error).to.equal(expectedError)
      }

      // Assert that clearTimeout was called
      expect(clearTimeoutSpy).to.have.been.called
    })
  })

  describe('getMaxGasLimit', () => {
    it('returns 100% of the blockGasLimit if it is less than or equal to 8,500,000', () => {
      const blockGasLimit = BigInt(6_000_000)
      const expected = blockGasLimit
      expect(getMaxGasLimit(blockGasLimit)).to.equal(expected)
    })

    it('returns 80% of the blockGasLimit if it is greater than 8,500,000 and less than or equal to 13,500,000', () => {
      const blockGasLimit = BigInt(10_000_000)
      const expected = (blockGasLimit * BigInt(8)) / BigInt(10)
      expect(getMaxGasLimit(blockGasLimit)).to.equal(expected)
    })

    it('returns 50% of the blockGasLimit if it is greater than 20,000,000', () => {
      const blockGasLimit = BigInt(21_000_000)
      const expected = blockGasLimit / BigInt(2)
      expect(getMaxGasLimit(blockGasLimit)).to.equal(expected)
    })

    it('handles edge cases accurately', () => {
      const testCases = [
        {
          input: BigInt(8_500_000),
          expected: BigInt(8_500_000),
        },
        {
          input: BigInt(20_000_000),
          expected: (BigInt(20_000_000) * BigInt(8)) / BigInt(10),
        },
      ]
      testCases.forEach(({ input, expected }) => {
        expect(getMaxGasLimit(input)).to.equal(expected)
      })
    })
  })
})
