import { expect } from 'chai'
import { ethers } from 'ethers'

import {
  arraysEqual,
  equal,
  isUserFunctionOptions,
  recursivelyConvertResult,
} from '../src/utils'

describe('Utils', () => {
  describe('isUserFunctionOptions', () => {
    it('returns false for undefined arg', () => {
      expect(isUserFunctionOptions(undefined)).to.equal(false)
    })

    it('returns false for boolean', () => {
      expect(isUserFunctionOptions(false)).to.equal(false)
      expect(isUserFunctionOptions(true)).to.equal(false)
    })

    it('returns false for number', () => {
      expect(isUserFunctionOptions(1)).to.equal(false)
      expect(isUserFunctionOptions(0)).to.equal(false)
    })

    it('returns false for string', () => {
      expect(isUserFunctionOptions('')).to.equal(false)
      expect(isUserFunctionOptions('test')).to.equal(false)
    })

    it('returns false for object that contains invalid overrides field', () => {
      expect(
        isUserFunctionOptions({
          overrides: [{ incorrectField: 1, chains: ['goerli'] }],
        })
      ).to.equal(false)
    })

    it('returns true for valid UserFunctionOptions', () => {
      expect(
        isUserFunctionOptions({
          overrides: [{ args: {}, chains: ['goerli'] }],
        })
      ).to.equal(true)
    })
  })

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

  // TODO: .only
  describe.only('recursivelyConvertResult', () => {
    const coder = ethers.AbiCoder.defaultAbiCoder()

    it('Converts array', () => {
      const encoded = coder.encode(
        ['string', 'string'],
        ['myFirstStr', 'mySecondStr']
      )

      const result = coder.decode(['string', 'string'], encoded)

      const converted = recursivelyConvertResult(result)

      expect(converted).to.deep.equal(['myFirstStr', 'mySecondStr'])
    })

    it('Converts nested array', () => {
      const encoded = coder.encode(
        ['string', 'uint256[]'],
        ['myFirstStr', [1, 2]]
      )

      // This converts any numbers to BigInt, so the converted result will contain BigInts too.
      const result = coder.decode(['string', 'uint256[]'], encoded)

      const converted = recursivelyConvertResult(result)

      expect(converted).to.deep.equal(['myFirstStr', [1n, 2n]])
    })

    it('Converts empty object', () => {
      const emptyResult = new ethers.Result([])

      const converted = recursivelyConvertResult(emptyResult)

      expect(converted).to.deep.equal([])
    })

    it('Converts object with unnamed fields', () => {
      // TODO(docs)
      const abi = [
        {
          inputs: [
            {
              internalType: 'string',
              name: '',
              type: 'string',
            },
            {
              internalType: 'string',
              name: '_name',
              type: 'string',
            },
            {
              internalType: 'uint256',
              name: '_number',
              type: 'uint256',
            },
            {
              internalType: 'string',
              name: '',
              type: 'string',
            },
          ],
          name: 'myFunction',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
      ]
      const iface = new ethers.Interface(abi)

      const encoded = iface.encodeFunctionData('myFunction', [
        'myFirstStr',
        'myName',
        1,
        'mySecondStr',
      ])

      const decoded = iface.decodeFunctionData('myFunction', encoded)

      const converted = recursivelyConvertResult(decoded)

      expect(converted).to.deep.equal([
        'myFirstStr',
        'myName',
        1n,
        'mySecondStr',
      ])
    })
  })
})
